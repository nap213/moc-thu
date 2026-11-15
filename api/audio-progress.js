import { respond, sameOrigin } from '../lib/shared.js';
import { audioSQL, ensureAudioTables, cleanBookId } from '../lib/audio.js';
const validDevice=id=>typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id);
export default async function handler(req,res){
  if(!['GET','POST'].includes(req.method))return respond(res,405,{error:'Không hỗ trợ method'});
  if(req.method==='POST'&&!sameOrigin(req))return respond(res,403,{error:'Origin không hợp lệ'});
  const q=req.method==='GET'?(req.query||{}):(typeof req.body==='string'?JSON.parse(req.body):req.body)||{};
  const {bookId,deviceId}=q;
  if(!cleanBookId(bookId)||!validDevice(deviceId))return respond(res,400,{error:'Mã sách/thiết bị không hợp lệ'});
  try{
    const sql=audioSQL();await ensureAudioTables(sql);
    if(req.method==='GET'){
      const r=await sql`SELECT part_no,seconds FROM mocthu_audio_progress WHERE book_id=${bookId} AND device_id=${deviceId}`;
      return respond(res,200,{found:r.length>0,partNo:r[0]?.part_no||0,seconds:r[0]?.seconds||0});
    }
    const partNo=Number(q.partNo),seconds=Number(q.seconds);
    if(!Number.isInteger(partNo)||partNo<0||partNo>10000||!Number.isFinite(seconds)||seconds<0||seconds>86400)return respond(res,400,{error:'Tiến độ sai'});
    await sql`INSERT INTO mocthu_audio_progress(book_id,device_id,part_no,seconds) VALUES(${bookId},${deviceId},${partNo},${seconds})
      ON CONFLICT (book_id,device_id) DO UPDATE SET part_no=${partNo},seconds=${seconds},updated_at=now()`;
    return respond(res,200,{ok:true});
  }catch(e){console.error('audio progress',e);return respond(res,503,{error:'Không lưu được tiến độ trên Neon'});}
}
