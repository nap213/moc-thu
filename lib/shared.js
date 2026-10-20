import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { SEED_BOOKS } from './seed.js';

const SESSION_NAME = 'mocthu_session';
const TTL_MS = 7*24*60*60*1000;
export const MAX_BODY = 3_500_000; // Vercel Function request limit is approx. 4.5MB
export const MAX_BOOK = 2_500_000;

export function respond(res, code, data, extra = {}) {
  return res.writeHead(code, {
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff',
    ...extra
  }).end(JSON.stringify(data));
}
export function method(req,res,allowed) {
  if (req.method===allowed) return true;
  respond(res,405,{error:'Phương thức không hỗ trợ'},{Allow:allowed});
  return false;
}
export function sameOrigin(req) {
  if (!req.headers.origin) return true;
  try { return new URL(req.headers.origin).host===req.headers.host; }
  catch { return false; }
}
export function getBody(req) {
  const data=typeof req.body==='string' ? JSON.parse(req.body) : req.body;
  if(!data||typeof data!=='object') throw new Error('Dữ liệu JSON không hợp lệ');
  if(Buffer.byteLength(JSON.stringify(data),'utf8')>MAX_BODY) throw new Error('Tổng dung lượng sách vượt 3,5 MB');
  return data;
}
export function isConfigured() {
  return Boolean(process.env.ADMIN_USER && process.env.ADMIN_PASS &&
    process.env.SESSION_SECRET && process.env.SESSION_SECRET.length>=32);
}
export function authAvailable(res) {
  if(isConfigured()) return true;
  respond(res,503,{error:'Admin chưa cấu hình ADMIN_USER, ADMIN_PASS hoặc SESSION_SECRET (tối thiểu 32 ký tự)'});
  return false;
}
function secureEquals(a,b) {
  const left=crypto.createHash('sha256').update(String(a)).digest();
  const right=crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(left,right);
}
export function correctCredentials(user,pass) {
  return secureEquals(user,process.env.ADMIN_USER||'') && secureEquals(pass,process.env.ADMIN_PASS||'');
}
function sign(payload) {
  return crypto.createHmac('sha256',process.env.SESSION_SECRET||'').update(payload).digest('base64url');
}
function cookieHeader(req) {
  return req.headers.cookie || '';
}
function cookieValue(req,name) {
  const segment=cookieHeader(req).split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='));
  return segment ? segment.slice(name.length+1) : null;
}
export function createSession() {
  const payload=`${Date.now()}.${crypto.randomBytes(16).toString('hex')}`;
  return `${payload}.${sign(payload)}`;
}
export function isAdmin(req) {
  if(!isConfigured()) return false;
  const token=cookieValue(req,SESSION_NAME);
  if(!token || token.length>300) return false;
  const [time,random,sig,...extra]=token.split('.');
  if(extra.length || !/^\d{13}$/.test(time||'') || !/^[a-f0-9]{32}$/.test(random||'') || !sig) return false;
  const age=Date.now()-Number(time);
  if(age<0 || age>TTL_MS) return false;
  const expected=sign(`${time}.${random}`);
  const a=Buffer.from(sig), b=Buffer.from(expected);
  return a.length===b.length && crypto.timingSafeEqual(a,b);
}
export function sessionCookie(token,expired=false) {
  // Vercel runs HTTPS. Secure cookie doesn't work on plain HTTP outside localhost.
  const secure = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
  return `${SESSION_NAME}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${expired?0:TTL_MS/1000}${secure?'; Secure':''}`;
}
export function sanitizeBook(book, i) {
  if (!book || typeof book!=='object' || typeof book.title!=='string' || typeof book.content!=='string' ||
      !book.title.trim() || !book.content.trim()) throw new Error('Sách phải có tiêu đề và nội dung');
  if (Buffer.byteLength(book.content,'utf8')>MAX_BOOK) throw new Error('Một cuốn sách vượt giới hạn 2,5 MB');
  return {
    id:String(book.id||`book-${i}-${crypto.randomUUID()}`).slice(0,120),
    title:book.title.trim().slice(0,120),
    author:String(book.author||'Khuyết danh').slice(0,100),
    genre:String(book.genre||'Sách').slice(0,50),
    description:String(book.description||'').slice(0,220),
    cover:Math.min(5,Math.max(0,parseInt(book.cover,10)||0)),
    content:book.content
  };
}
function database() {
  if(!process.env.DATABASE_URL) throw Object.assign(new Error('Chưa kết nối Neon database: thiếu DATABASE_URL'),{status:503});
  return neon(process.env.DATABASE_URL);
}
export async function booksTable() {
  const sql=database();
  await sql`CREATE TABLE IF NOT EXISTS mocthu_library (name TEXT PRIMARY KEY, books JSONB NOT NULL, updated_at TIMESTAMPTZ DEFAULT now())`;
  await sql`INSERT INTO mocthu_library (name, books) VALUES ('main', ${JSON.stringify(SEED_BOOKS)}::jsonb) ON CONFLICT (name) DO NOTHING`;
  return sql;
}
export function serverError(res,err) {
  console.error('Moc Thu API error',err);
  return respond(res,err.status||500,{error:err.status===503?err.message:'Không xử lý được yêu cầu. Kiểm tra cấu hình/database.'});
}
