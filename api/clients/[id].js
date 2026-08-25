const { supabase } = require('../_lib/supabase');
const { getSessionUser } = require('../_lib/auth');

module.exports = async (req, res) => {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'يلزم تسجيل الدخول' });
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'طريقة غير مدعومة' });

  const { id } = req.query;
  const { error } = await supabase.from('clients').delete().eq('id', id);
  if (error) return res.status(500).json({ error: 'تعذّر حذف المراجع' });
  res.status(200).json({ ok: true });
};
