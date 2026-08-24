const { supabase } = require('../_lib/supabase');
const { verifyPassword, signToken, setSessionCookie } = require('../_lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'طريقة غير مدعومة' });

  const { email, password } = req.body || {};
  const cleanEmail = (email || '').toLowerCase().trim();
  const { data: user } = await supabase.from('admin_users').select('*').eq('email', cleanEmail).single();

  if (!user || !verifyPassword(password || '', user.password_hash)) {
    return res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
  }

  const token = signToken({ uid: user.id, exp: Date.now() + 1000 * 60 * 60 * 12 });
  setSessionCookie(res, token);
  return res.status(200).json({
    ok: true,
    mustChangePassword: !!user.must_change_password,
    name: user.name,
    role: user.role
  });
};
