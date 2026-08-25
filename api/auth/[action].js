const { supabase } = require('../_lib/supabase');
const { verifyPassword, signToken, setSessionCookie, clearSessionCookie, getSessionUser, hashPasswordSync } = require('../_lib/auth');

module.exports = async (req, res) => {
  const { action } = req.query;

  if (action === 'login') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'طريقة غير مدعومة' });
    const { name, password } = req.body || {};
    const cleanName = (name || '').trim();
    const { data: user } = await supabase.from('admin_users').select('*').ilike('name', cleanName).single();
    if (!user || !verifyPassword(password || '', user.password_hash)) {
      return res.status(401).json({ error: 'الاسم أو كلمة المرور غير صحيحة' });
    }
    const token = signToken({ uid: user.id, exp: Date.now() + 1000 * 60 * 60 * 12 });
    setSessionCookie(res, token);
    return res.status(200).json({ ok: true, mustChangePassword: !!user.must_change_password, name: user.name, role: user.role });
  }

  if (action === 'logout') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'طريقة غير مدعومة' });
    clearSessionCookie(res);
    return res.status(200).json({ ok: true });
  }

  if (action === 'change-password') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'طريقة غير مدعومة' });
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'يلزم تسجيل الدخول' });
    const { newPassword } = req.body || {};
    if (!newPassword || newPassword.length < 8) return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' });
    const { error } = await supabase.from('admin_users')
      .update({ password_hash: hashPasswordSync(newPassword), must_change_password: false })
      .eq('id', user.id);
    if (error) return res.status(500).json({ error: 'تعذّر حفظ كلمة المرور الجديدة' });
    return res.status(200).json({ ok: true });
  }

  res.status(404).json({ error: 'مسار غير معروف' });
};
