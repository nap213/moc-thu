import { neon } from '@neondatabase/serverless';
import crypto from 'node:crypto';

export function audioSQL() {
  if (!process.env.DATABASE_URL) throw new Error('Thiếu DATABASE_URL');
  return neon(process.env.DATABASE_URL);
}
export async function ensureAudioTables(sql) {
  await sql`CREATE TABLE IF NOT EXISTS mocthu_audio_assets (
    book_id TEXT PRIMARY KEY,
    mode TEXT NOT NULL,
    status TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    uploaded_url TEXT,
    uploaded_mime TEXT,
    total_parts INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS mocthu_audio_clips (
    book_id TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    part_no INTEGER NOT NULL,
    url TEXT NOT NULL,
    PRIMARY KEY(book_id, content_hash, part_no)
  )`;
  await sql`CREATE TABLE IF NOT EXISTS mocthu_audio_progress (
    book_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    part_no INTEGER NOT NULL DEFAULT 0,
    seconds DOUBLE PRECISION NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(book_id,device_id)
  )`;
}
export async function fetchBook(sql, bookId) {
  if (typeof bookId !== 'string' || bookId.length > 120 || !bookId.trim()) return null;
  const r=await sql`SELECT books FROM mocthu_library WHERE name='main'`;
  const arr=Array.isArray(r[0]?.books)?r[0].books:[];
  return arr.find(b=>b.id===bookId)||null;
}
export function hashBook(book) {
  return crypto.createHash('sha256').update(String(book.content||'').normalize('NFC'),'utf8').digest('hex');
}
// Deterministic word-based split: no sentence content is silently dropped.
export function splitBook(text, maxChars=800) {
  const normalized=String(text||'').normalize('NFC').replace(/\r\n?/g,'\n').trim();
  if(!normalized) return [];
  const tokens=normalized.match(/\S+\s*/gu)||[];
  const parts=[]; let current='';
  for(const token of tokens) {
    if((current+token).length<=maxChars) {current+=token;continue;}
    if(current.trim()) {parts.push(current.trim());current='';}
    if(token.length<=maxChars){current=token;continue;}
    for(let i=0;i<token.length;i+=maxChars)parts.push(token.slice(i,i+maxChars));
  }
  if(current.trim())parts.push(current.trim());
  return parts;
}
export function cleanBookId(id) {return typeof id==='string' && id.length<=120 && /^[a-zA-Z0-9_-]+$/.test(id);}
