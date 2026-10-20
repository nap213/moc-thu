import { respond,method,sameOrigin,authAvailable,getBody,correctCredentials,createSession,sessionCookie } from '../lib/shared.js';
export default function handler(req,res) {
  if(!method(req,res,'POST'))return;
  if(!sameOrigin(req))return respond(res,403,{error:'Origin không hợp lệ'});
  if(!authAvailable(res))return;
  try {
    const data=getBody(req);
    if(!correctCredentials(data.username||'',data.password||''))return respond(res,401,{error:'Sai tài khoản hoặc mật khẩu'});
    return respond(res,200,{admin:true},{'Set-Cookie':sessionCookie(createSession())});
  } catch {return respond(res,400,{error:'Dữ liệu đăng nhập không hợp lệ'});}
}
