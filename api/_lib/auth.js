const crypto = require('crypto');
const { supabase } = require('./supabase');

const SECRET = process.env.SESSION_SECRET;
if (!SECRET) {
  // تحذير مبكر وواضح بدل خطأ غامض لاحقًا
  console.error('⚠️ SESSION_SECRET غير معرّف في Environment Variables على Vercel.');
}

function hashPasswordSync(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'));
}

function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch { return null; }
}
function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(';').forEach(p => {
    const idx = p.indexOf('=');
    if (idx > -1) out[p.slice(0, idx).trim()] = decodeURIComponent(p.slice(idx + 1).trim());
  });
  return out;
}

// يُرجع بيانات المستخدم الحالي من جدول admin_users، أو null إن لم يكن مسجلًا
async function getSessionUser(req) {
  const cookies = parseCookies(req);
  const payload = verifyToken(cookies.sid);
  if (!payload) return null;
  const { data, error } = await supabase.from('admin_users').select('*').eq('id', payload.uid).single();
  if (error || !data) return null;
  return data;
}

function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=43200; Secure`);
}
function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; Path=/; Max-Age=0; Secure');
}

module.exports = {
  hashPasswordSync, verifyPassword, signToken, verifyToken,
  parseCookies, getSessionUser, setSessionCookie, clearSessionCookie
};
