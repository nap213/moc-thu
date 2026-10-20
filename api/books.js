import { respond,sameOrigin,isAdmin,getBody,booksTable,sanitizeBook,serverError } from '../lib/shared.js';
export default async function handler(req,res) {
  if(!['GET','PUT'].includes(req.method))return respond(res,405,{error:'Phương thức không hỗ trợ'},{Allow:'GET, PUT'});
  if(req.method==='PUT' && !sameOrigin(req))return respond(res,403,{error:'Origin không hợp lệ'});
  if(req.method==='PUT' && !isAdmin(req))return respond(res,401,{error:'Cần đăng nhập admin'});
  try {
    if(req.method==='PUT') {
      let data;
      try {data=getBody(req);}catch(e){return respond(res,400,{error:e.message});}
      if(!Array.isArray(data.books) || data.books.length>500)return respond(res,400,{error:'Thư viện không hợp lệ (tối đa 500 cuốn)'});
      let next;
      try {
        next=data.books.map(sanitizeBook);
        if(new Set(next.map(book=>book.id)).size!==next.length) throw new Error('Mã sách bị trùng');
      } catch(e) {return respond(res,400,{error:e.message});}
      const sql=await booksTable();
      await sql`UPDATE mocthu_library SET books=${JSON.stringify(next)}::jsonb,updated_at=now() WHERE name='main'`;
      return respond(res,200,{books:next});
    }
    const sql=await booksTable();
    const result=await sql`SELECT books FROM mocthu_library WHERE name='main'`;
    let books=result[0]?.books||[];
    if(typeof books==='string')books=JSON.parse(books);
    return respond(res,200,{books});
  } catch(e) {return serverError(res,e);}
}
