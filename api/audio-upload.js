import { handleUpload } from '@vercel/blob/client';
import { isAdmin, sameOrigin, respond, booksTable } from '../lib/shared.js';
import { audioSQL, ensureAudioTables, fetchBook, hashBook, cleanBookId } from '../lib/audio.js';

export default async function handler(req,res){
  if(req.method!=='POST')return respond(res,405,{error:'Chỉ nhận POST'});
  if(!sameOrigin(req))return respond(res,403,{error:'Origin không hợp lệ'});
  if(!process.env.BLOB_READ_WRITE_TOKEN)return respond(res,503,{error:'Thiếu BLOB_READ_WRITE_TOKEN'});
  try{
    const data=typeof req.body==='string'?JSON.parse(req.body):req.body;
    const result=await handleUpload({body:data,request:req,
      onBeforeGenerateToken:async(pathname,clientPayload)=>{
        if(!isAdmin(req))throw new Error('Cần đăng nhập Admin');
        let info;try{info=JSON.parse(clientPayload||'{}');}catch{throw new Error('Thông tin upload sai');}
        if(!cleanBookId(info.bookId)||!pathname.startsWith(`mocthu/audio/${info.bookId}/`)|| !/\.(mp3|wav)$/i.test(pathname))throw new Error('Đường dẫn upload sai');
        const sql=audioSQL();await booksTable();
        if(!await fetchBook(sql,info.bookId))throw new Error('Sách không tồn tại');
        return {allowedContentTypes:['audio/mpeg','audio/mp3','audio/wav','audio/x-wav'],maximumSizeInBytes:200*1024*1024,addRandomSuffix:true,
          tokenPayload:JSON.stringify({bookId:info.bookId})};
      },
      onUploadCompleted:async({blob,tokenPayload})=>{
        // Callback verified by Vercel Blob SDK.
        const info=JSON.parse(tokenPayload||'{}');
        if(!cleanBookId(info.bookId)||!blob.pathname.startsWith(`mocthu/audio/${info.bookId}/`))throw new Error('Upload callback invalid');
        const sql=audioSQL();await booksTable();await ensureAudioTables(sql);
        const book=await fetchBook(sql,info.bookId);if(!book)return;
        await sql`INSERT INTO mocthu_audio_assets(book_id,mode,status,content_hash,total_parts,uploaded_url,uploaded_mime)
          VALUES(${info.bookId},'uploaded','ready',${hashBook(book)},1,${blob.url},${blob.contentType})
          ON CONFLICT(book_id) DO UPDATE SET mode='uploaded',status='ready',content_hash=${hashBook(book)},total_parts=1,uploaded_url=${blob.url},uploaded_mime=${blob.contentType},updated_at=now()`;
      }
    });
    return res.status(200).json(result);
  }catch(e){console.error('Upload error',e);return respond(res,400,{error:e.message||'Không upload được'});}
}
