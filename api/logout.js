import { respond,method,sameOrigin,sessionCookie } from '../lib/shared.js';
export default function handler(req,res) {
  if(!method(req,res,'POST'))return;
  if(!sameOrigin(req))return respond(res,403,{error:'Origin không hợp lệ'});
  return respond(res,200,{admin:false},{'Set-Cookie':sessionCookie('',true)});
}
