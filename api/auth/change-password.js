const { supabase } = require('../_lib/supabase');
const { getSessionUser, hashPasswordSync } = require('../_lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'طريقة غير مدعومة' });

  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'يلزم تسجيل الدخول' });

  const { newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' });
  }

  const { error } = await supabase
    .from('admin_users')
    .update({ password_hash: hashPasswordSync(newPassword), must_change_password: false })
    .eq('id', user.id);

  if (error) return res.status(500).json({ error: 'تعذّر حفظ كلمة المرور الجديدة' });
  res.status(200).json({ ok: true });
};
