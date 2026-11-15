/**
 * Mộc Thư — Gemini Flash TTS test endpoint (admin-only).
 * - Uses the official Gemini Interactions REST API (3.8 Flash TTS).
 * - Returns one short WAV recording, not a persistent audiobook.
 * - Daily quota to protect the API project from accidental overuse.
 */
import { neon } from '@neondatabase/serverless';
import { isAdmin, method, sameOrigin, respond } from '../lib/shared.js';

const MAX_CHARS = 240;
const MAX_WAV_BYTES = 4_100_000; // Leave headroom under Vercel's 4.5MB response limit.
const MAX_DAILY_CALLS = 8;
const ALLOWED_VOICES = new Set(['Kore', 'Puck', 'Charon', 'Aoede']);

export default async function handler(req, res) {
  if (!method(req, res, 'POST')) return;
  if (!sameOrigin(req)) return respond(res, 403, { error: 'Origin không hợp lệ.' });
  if (!isAdmin(req)) return respond(res, 401, { error: 'Chỉ admin được thử Gemini TTS.' });
  if (!process.env.GEMINI_API_KEY) return respond(res, 503, { error: 'Thiếu GEMINI_API_KEY trong Vercel Environment Variables.' });
  if (!process.env.DATABASE_URL) return respond(res, 503, { error: 'Thiếu DATABASE_URL để giới hạn số lượt thử mỗi ngày.' });

  const data = typeof req.body === 'string' ? (()=>{try{return JSON.parse(req.body);}catch{return null;}})() : req.body;
  const content = data && typeof data.text === 'string' ? data.text.normalize('NFC').trim() : '';
  const voice = ALLOWED_VOICES.has(data?.voice) ? data.voice : 'Kore';
  if (!content || [...content].length > MAX_CHARS || Buffer.byteLength(content, 'utf8') > 1600) {
    return respond(res, 400, { error: `Hãy gửi đoạn văn tối đa ${MAX_CHARS} ký tự tiếng Việt.` });
  }
  try {
    // The attempt is counted even if Google returns an error, preventing rapid retries.
    const sql = neon(process.env.DATABASE_URL);
    await sql`CREATE TABLE IF NOT EXISTS mocthu_tts_daily (day DATE PRIMARY KEY, attempts INTEGER NOT NULL DEFAULT 0)`;
    const used = await sql`
      INSERT INTO mocthu_tts_daily (day, attempts) VALUES (CURRENT_DATE, 1)
      ON CONFLICT (day) DO UPDATE SET attempts = mocthu_tts_daily.attempts + 1
      WHERE mocthu_tts_daily.attempts < ${MAX_DAILY_CALLS}
      RETURNING attempts
    `;
    if (!used.length) return respond(res, 429, { error: `Đã hết ${MAX_DAILY_CALLS} lượt thử TTS hôm nay. Thử lại ngày mai (giờ UTC).` });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 54_000);
    let googleResponse;
    try {
      googleResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: 'gemini-3.8-flash-tts',
          input: [{
            type: 'user_input',
            content: [{
              type: 'text', text: content,
              annotations: [{ type: 'speech_metadata', style: 'Read this Vietnamese passage clearly and naturally, like an audiobook narrator.' }]
            }]
          }],
          response_format: { type: 'audio', mime_type: 'audio/wav' },
          generation_config: { speech_config: [{ voice }] }
        })
      });
    } finally { clearTimeout(timer); }

    if (!googleResponse.ok) {
      let details = {};
      try { details = await googleResponse.json(); } catch { /* no structured error */ }
      const googleCode = googleResponse.status;
      const status = googleCode === 429 ? 429 : googleCode === 400 ? 422 : 502;
      const safe = googleCode === 429
        ? 'Hết quota Gemini Free Tier hoặc đang bị giới hạn tốc độ (429). Kiểm tra Rate Limits trên Google AI Studio.'
        : googleCode === 403
          ? 'API key hoặc quyền model không hợp lệ. Kiểm tra API key và project trong AI Studio.'
          : `Google Gemini TTS chưa tạo được âm thanh (HTTP ${googleCode}). Kiểm tra Logs Vercel.`;
      console.error('Gemini TTS error', googleCode, details?.error?.message || 'unknown');
      return respond(res, status, { error: safe });
    }

    const payload = await googleResponse.json();
    // REST stores audio in steps[].content[].data; SDK exposes output_audio.data.
    const interaction = payload?.interaction || payload;
    const audioParts = (interaction?.steps || [])
      .filter(s => s?.type === 'model_output')
      .flatMap(s => Array.isArray(s.content) ? s.content : [])
      .filter(p => p?.type === 'audio' && typeof p.data === 'string');
    const base64 = audioParts.at(-1)?.data || interaction?.output_audio?.data || interaction?.outputAudio?.data;
    if (!base64) {
      console.error('Gemini TTS response missing audio', Object.keys(interaction || {}));
      return respond(res, 502, { error: 'Google không trả về phần audio trong kết quả. Kiểm tra Vercel logs.' });
    }
    const wav = Buffer.from(base64, 'base64');
    if (wav.length > MAX_WAV_BYTES) return respond(res, 413, { error: 'File WAV vượt giới hạn Vercel. Hãy thử một đoạn ngắn hơn.' });
    if (wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') {
      return respond(res, 502, { error: 'File audio Google trả về không phải WAV hợp lệ.' });
    }
    res.writeHead(200, {
      'Content-Type': 'audio/wav',
      'Content-Length': wav.length,
      'Cache-Control': 'private, no-store',
      'Content-Disposition': 'inline; filename="mocthu-gemini-tts.wav"',
      'X-Content-Type-Options': 'nosniff'
    });
    return res.end(wav);
  } catch (error) {
    console.error('Moc Thu TTS demo failed:', error);
    if (error?.name === 'AbortError') return respond(res, 504, { error: 'Google tạo giọng quá lâu. Hãy thử đoạn văn ngắn hơn.' });
    return respond(res, 502, { error: 'Không thể gọi Gemini TTS lúc này. Kiểm tra Vercel logs.' });
  }
}
