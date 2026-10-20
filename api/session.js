import { respond,method,isAdmin } from '../lib/shared.js';
export default function handler(req,res) {
  if(!method(req,res,'GET')) return;
  return respond(res,200,{server:true,admin:isAdmin(req)});
}
