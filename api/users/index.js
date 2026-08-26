const { supabase } = require('../_lib/supabase');
const { getSessionUser, hashPasswordSync } = require('../_lib/auth');

module.exports = async (req, res) => {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'يلزم تسجيل الدخول' });
  if (user.role !== 'super_admin') return res.status(403).json({ error: 'صلاحية غير كافية' });

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('admin_users').select('id,name,email,role,counselor_id,must_change_password');
    if (error) return res.status(500).json({ error: 'تعذّر تحميل الحسابات' });
    return res.status(200).json(data.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role, counselorId: u.counselor_id, mustChangePassword: u.must_change_password })));
  }

  if (req.method === 'POST') {
    const { name, email, tempPassword, counselorId } = req.body || {};
    if (!name || !email || !tempPassword) return res.status(400).json({ error: 'الرجاء تعبئة كل الحقول' });
    const cleanEmail = email.toLowerCase().trim();
    const { data: existing } = await supabase.from('admin_users').select('id').eq('email', cleanEmail).single();
    if (existing) return res.status(400).json({ error: 'هذا البريد مستخدم مسبقًا' });
    const { error } = await supabase.from('admin_users').insert({
      id: 'u_' + Date.now(), name, email: cleanEmail, role: 'consultant',
      counselor_id: counselorId || null, password_hash: hashPasswordSync(tempPassword), must_change_password: true
    });
    if (error) return res.status(500).json({ error: 'تعذّر إنشاء الحساب' });
    return res.status(200).json({ ok: true });
  }

  res.status(405).json({ error: 'طريقة غير مدعومة' });
};
