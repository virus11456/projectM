import { next } from '@vercel/edge';

// 保護所有路徑（含 data/*.json）。Vercel 內部資源(_vercel)不攔。
export const config = { matcher: '/((?!_vercel).*)' };

const COOKIE = 'sm_auth';
const MAXAGE = 60 * 60 * 24 * 30; // 30 天

export default async function middleware(req) {
  const url = new URL(req.url);
  const path = url.pathname;
  const USER = process.env.BASIC_AUTH_USER;
  const PASS = process.env.BASIC_AUTH_PASS;
  const SECRET = process.env.AUTH_SECRET;
  if (!USER || !PASS || !SECRET) return new Response('尚未設定登入憑證', { status: 503 });

  // 公開資源：讓登入頁也能載入小助手（純前端動畫、無機密）
  if (path === '/club.js') return next();

  // 登入表單送出
  if (path === '/login' && req.method === 'POST') {
    const form = await req.formData();
    const u = (form.get('username') || '').toString();
    const p = (form.get('password') || '').toString();
    if (safeEqual(u, USER) && safeEqual(p, PASS)) {
      const token = await makeToken(SECRET);
      return new Response(null, {
        status: 303,
        headers: {
          'Location': '/',
          'Set-Cookie': `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAXAGE}`,
        },
      });
    }
    return new Response(null, { status: 303, headers: { 'Location': '/login?e=1' } });
  }

  // 登出
  if (path === '/logout') {
    return new Response(null, {
      status: 302,
      headers: { 'Location': '/login', 'Set-Cookie': `${COOKIE}=; Path=/; Max-Age=0` },
    });
  }

  const cookies = parseCookie(req.headers.get('cookie') || '');
  const authed = cookies[COOKIE] ? await verifyToken(cookies[COOKIE], SECRET) : false;

  // 登入頁：未登入可看；已登入導回首頁
  if (path === '/login') {
    if (authed) return new Response(null, { status: 302, headers: { 'Location': '/' } });
    return next();
  }

  if (authed) return next();
  return new Response(null, { status: 302, headers: { 'Location': '/login' } });
}

/* ---- 工具 ---- */
function parseCookie(str) {
  const o = {};
  str.split(';').forEach(p => { const i = p.indexOf('='); if (i > -1) o[p.slice(0, i).trim()] = p.slice(i + 1).trim(); });
  return o;
}
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function b64url(bytes) {
  let s = btoa(String.fromCharCode.apply(null, bytes));
  return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}
async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return b64url(new Uint8Array(sig));
}
async function makeToken(secret) {
  const payload = 'v1.' + (Date.now() + MAXAGE * 1000);
  const sig = await hmac(secret, payload);
  return b64url(new TextEncoder().encode(payload)) + '.' + sig;
}
async function verifyToken(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  let payload;
  try { payload = new TextDecoder().decode(b64urlDecode(parts[0])); } catch (e) { return false; }
  const expected = await hmac(secret, payload);
  if (!safeEqual(parts[1], expected)) return false;
  const exp = parseInt(payload.split('.')[1], 10);
  return Number.isFinite(exp) && exp > Date.now();
}
