const { supabase } = require('../_lib/supabase');
const { getSessionUser } = require('../_lib/auth');

module.exports = async (req, res) => {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'يلزم تسجيل الدخول' });
  if (user.role !== 'super_admin') return res.status(403).json({ error: 'صلاحية غير كافية' });
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'طريقة غير مدعومة' });

  const { id } = req.query;
  if (id === user.id) return res.status(400).json({ error: 'لا يمكن حذف حسابك الحالي' });

  const { error } = await supabase.from('admin_users').delete().eq('id', id);
  if (error) return res.status(500).json({ error: 'تعذّر حذف الحساب' });
  res.status(200).json({ ok: true });
};
