import { put, head } from '@vercel/blob';
import crypto from 'node:crypto';
import { isAdmin, sameOrigin, respond, booksTable } from '../lib/shared.js';
import { audioSQL, ensureAudioTables, fetchBook, hashBook, splitBook, cleanBookId } from '../lib/audio.js';
const MODEL='gemini-3.8-flash-tts';
const MAX_DAILY=40; // protective per-project cap; Google imposes its own smaller quotas.

async function generateWav(text,voice) {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),54_000);
  let response;
  try {
    response=await fetch('https://generativelanguage.googleapis.com/v1beta/interactions',{
      method:'POST', signal:controller.signal,
      headers:{'Content-Type':'application/json','x-goog-api-key':process.env.GEMINI_API_KEY},
      body:JSON.stringify({model:MODEL,input:[{type:'user_input',content:[{type:'text',text,
        annotations:[{type:'speech_metadata',style:'Read this Vietnamese passage completely, clearly, in a steady audiobook narrator voice. No commentary.'}]}]}],
        response_format:{type:'audio',mime_type:'audio/wav'},generation_config:{speech_config:[{voice}]}})
    });
  } finally {clearTimeout(timer);}
  if(!response.ok){
    const detail=await response.text().catch(()=> '');
    console.error('Gemini generate error',response.status,detail.slice(0,400));
    const error=new Error(response.status===429?'Gemini đã chạm quota (429); thử lại sau.':`Gemini trả lỗi ${response.status}. Kiểm tra quyền model/API key.`);
    error.status=response.status===429?429:502;throw error;
  }
  const payload=await response.json();
  const output=payload.interaction||payload;
  const items=(output.steps||[]).filter(s=>s.type==='model_output').flatMap(s=>s.content||[]);
  const b64=items.filter(p=>p.type==='audio' && typeof p.data==='string').at(-1)?.data||output.output_audio?.data||output.outputAudio?.data;
  if(!b64)throw new Error('Gemini không trả WAV; kiểm tra Vercel logs.');
  const bytes=Buffer.from(b64,'base64');
  if(bytes.length<44 || bytes.toString('ascii',0,4)!=='RIFF' || bytes.toString('ascii',8,12)!=='WAVE')throw new Error('WAV không hợp lệ.');
  if(bytes.length>22_000_000)throw new Error('Đoạn WAV quá lớn; cần giảm kích thước đoạn.');
  return bytes;
}
async function currentAudio(sql,id,book) {
  const meta=(await sql`SELECT * FROM mocthu_audio_assets WHERE book_id=${id}`)[0];
  if(!meta)return {mode:'none',status:'missing',parts:[],totalParts:0};
  const stale=meta.mode==='generated' && meta.content_hash!==hashBook(book);
  if(stale)return {mode:'generated',status:'stale',parts:[],totalParts:meta.total_parts};
  if(meta.mode==='uploaded')return {mode:'uploaded',status:'ready',parts:[{url:meta.uploaded_url,partNo:0}],totalParts:1};
  const rows=await sql`SELECT part_no,url FROM mocthu_audio_clips WHERE book_id=${id} AND content_hash=${meta.content_hash} ORDER BY part_no ASC`;
  return {mode:'generated',status:meta.status,parts:rows.map(r=>({partNo:r.part_no,url:r.url})),totalParts:meta.total_parts};
}
export default async function handler(req,res){
  if(!['GET','POST'].includes(req.method))return respond(res,405,{error:'Method không hỗ trợ'});
  if(req.method==='POST' && (!sameOrigin(req)||!isAdmin(req)))return respond(res,403,{error:'Cần đăng nhập admin.'});
  try{
    const data=req.method==='POST'?(typeof req.body==='string'?JSON.parse(req.body):req.body)||{}:req.query||{};
    const bookId=data.bookId;
    if(!cleanBookId(bookId))return respond(res,400,{error:'Mã sách không hợp lệ.'});
    const sql=audioSQL(); await booksTable(); await ensureAudioTables(sql);
    const book=await fetchBook(sql,bookId);
    if(!book)return respond(res,404,{error:'Không tìm thấy cuốn sách.'});
    if(req.method==='GET')return respond(res,200,await currentAudio(sql,bookId,book));
    const action=data.action;
    if(action==='start'){
      if(!process.env.GEMINI_API_KEY || !process.env.BLOB_READ_WRITE_TOKEN)return respond(res,503,{error:'Chưa cấu hình GEMINI_API_KEY hoặc BLOB_READ_WRITE_TOKEN'});
      const hash=hashBook(book); const parts=splitBook(book.content);if(!parts.length)return respond(res,400,{error:'Sách trống.'});
      // Refuse very long bulk jobs; admin can upload an externally created MP3 instead.
      if(parts.length>1500)return respond(res,413,{error:'Sách quá dài cho chế độ tạo Gemini trực tiếp; hãy dùng MP3 upload hoặc chia thành nhiều cuốn.'});
      const existing=(await sql`SELECT * FROM mocthu_audio_assets WHERE book_id=${bookId}`)[0];
      if(existing?.mode==='generated'&&existing?.content_hash===hash){
        return respond(res,200,await currentAudio(sql,bookId,book));
      }
      await sql`INSERT INTO mocthu_audio_assets(book_id,mode,status,content_hash,total_parts,uploaded_url,uploaded_mime)
        VALUES(${bookId},'generated','generating',${hash},${parts.length},NULL,NULL)
        ON CONFLICT (book_id) DO UPDATE SET mode='generated',status='generating',content_hash=${hash},total_parts=${parts.length},uploaded_url=NULL,uploaded_mime=NULL,updated_at=now()`;
      return respond(res,200,await currentAudio(sql,bookId,book));
    }
    if(action==='next'){
      if(!process.env.GEMINI_API_KEY || !process.env.BLOB_READ_WRITE_TOKEN)return respond(res,503,{error:'Thiếu GEMINI_API_KEY hoặc BLOB_READ_WRITE_TOKEN'});
      const meta=(await sql`SELECT * FROM mocthu_audio_assets WHERE book_id=${bookId}`)[0];
      const hash=hashBook(book);
      if(!meta||meta.mode!=='generated'||meta.content_hash!==hash)return respond(res,409,{error:'Chưa bắt đầu hoặc sách đã thay đổi. Nhấn Tạo audio để bắt đầu lại.'});
      if(meta.status==='ready')return respond(res,200,await currentAudio(sql,bookId,book));
      const parts=splitBook(book.content);
      const completed=await sql`SELECT part_no FROM mocthu_audio_clips WHERE book_id=${bookId} AND content_hash=${hash}`;
      const saved=new Set(completed.map(r=>r.part_no));
      let idx=parts.findIndex((_,i)=>!saved.has(i));
      if(idx===-1){
        await sql`UPDATE mocthu_audio_assets SET status='ready',updated_at=now() WHERE book_id=${bookId} AND content_hash=${hash}`;
        return respond(res,200,await currentAudio(sql,bookId,book));
      }
      await sql`CREATE TABLE IF NOT EXISTS mocthu_audio_quota (day DATE PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0)`;
      const quota=await sql`INSERT INTO mocthu_audio_quota(day,count) VALUES (CURRENT_DATE,1)
        ON CONFLICT(day) DO UPDATE SET count=mocthu_audio_quota.count+1 WHERE mocthu_audio_quota.count < ${MAX_DAILY} RETURNING count`;
      if(!quota.length)return respond(res,429,{error:`Đã đạt giới hạn bảo vệ ${MAX_DAILY} đoạn/ngày. Hôm sau vào trang admin và bấm Tiếp tục tạo; các đoạn cũ vẫn còn.`});
      const voice=['Kore','Puck','Aoede','Charon'].includes(data.voice)?data.voice:'Kore';
      const wav=await generateWav(parts[idx],voice);
      // Filename random and immutable to prevent cache stale after edits.
      const blob=await put(`mocthu/audio/${bookId}/${hash.slice(0,12)}-${idx}-${crypto.randomUUID()}.wav`,wav,{access:'public',contentType:'audio/wav',addRandomSuffix:false});
      // If book is edited while generating, metadata of the previous version is not used.
      await sql`INSERT INTO mocthu_audio_clips(book_id,content_hash,part_no,url) VALUES(${bookId},${hash},${idx},${blob.url}) ON CONFLICT DO NOTHING`;
      const latest=await sql`SELECT * FROM mocthu_audio_assets WHERE book_id=${bookId}`;
      if(latest[0]?.content_hash===hash){
        const count=(await sql`SELECT COUNT(*)::int AS n FROM mocthu_audio_clips WHERE book_id=${bookId} AND content_hash=${hash}`)[0].n;
        if(count>=parts.length)await sql`UPDATE mocthu_audio_assets SET status='ready',updated_at=now() WHERE book_id=${bookId} AND content_hash=${hash}`;
      }
      return respond(res,200,await currentAudio(sql,bookId,book));
    }
    if(action==='confirmUpload'){
      if(!process.env.BLOB_READ_WRITE_TOKEN)return respond(res,503,{error:'Vercel Blob chưa cấu hình.'});
      const url=String(data.url||''); if(!url.startsWith('https://')||url.length>2048)return respond(res,400,{error:'URL file sai.'});
      let blob;
      try{blob=await head(url);}catch{return respond(res,400,{error:'Không xác nhận được file đã upload lên Blob.'});}
      if(!blob.pathname.startsWith(`mocthu/audio/${bookId}/`) || !/\.(mp3|wav)$/i.test(blob.pathname))return respond(res,403,{error:'Đường dẫn file không hợp lệ.'});
      if(!['audio/mpeg','audio/mp3','audio/wav','audio/x-wav'].includes(blob.contentType))return respond(res,400,{error:'Chỉ nhận MP3/WAV.'});
      await sql`INSERT INTO mocthu_audio_assets(book_id,mode,status,content_hash,total_parts,uploaded_url,uploaded_mime)
        VALUES(${bookId},'uploaded','ready',${hashBook(book)},1,${blob.url},${blob.contentType})
        ON CONFLICT(book_id) DO UPDATE SET mode='uploaded',status='ready',content_hash=${hashBook(book)},total_parts=1,uploaded_url=${blob.url},uploaded_mime=${blob.contentType},updated_at=now()`;
      return respond(res,200,await currentAudio(sql,bookId,book));
    }
    if(action==='remove'){
      await sql`DELETE FROM mocthu_audio_assets WHERE book_id=${bookId}`;
      // Old blobs remain stored until cleaned up in Vercel Blob dashboard; avoid accidental deletion of files in use.
      return respond(res,200,{mode:'none',status:'missing',parts:[],totalParts:0});
    }
    return respond(res,400,{error:'Tác vụ không hợp lệ.'});
  }catch(err){console.error('audio api error',err);return respond(res,err.status||500,{error:err.status?err.message:'Lỗi xử lý audio; xem Vercel Logs.'});}
}
