import { next } from '@vercel/edge';

// 保護所有路徑（含 data/*.json）。Vercel 內部資源(_vercel)不攔。
export const config = { matcher: '/((?!_vercel).*)' };

export default function middleware(request) {
  const USER = process.env.BASIC_AUTH_USER;
  const PASS = process.env.BASIC_AUTH_PASS;

  // 沒設定憑證時，一律擋下（fail-safe，避免機密外洩）
  if (!USER || !PASS) {
    return new Response('尚未設定登入憑證', { status: 503 });
  }

  const header = request.headers.get('authorization') || '';
  if (header.startsWith('Basic ')) {
    let decoded = '';
    try { decoded = atob(header.slice(6)); } catch (e) { decoded = ''; }
    const idx = decoded.indexOf(':');
    if (idx !== -1) {
      const u = decoded.slice(0, idx);
      const p = decoded.slice(idx + 1);
      if (safeEqual(u, USER) && safeEqual(p, PASS)) {
        return next();
      }
    }
  }

  return new Response('需要登入（公司內部機密）', {
    status: 401,
    headers: {
      // realm 必須是純 ASCII，否則瀏覽器不會跳出登入框
      'WWW-Authenticate': 'Basic realm="Simple Marketing Dashboard"',
      'content-type': 'text/plain; charset=utf-8',
    },
  });
}

// 定時間比較，降低時序攻擊風險
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
