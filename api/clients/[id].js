const { supabase } = require('../_lib/supabase');
const { getSessionUser } = require('../_lib/auth');

module.exports = async (req, res) => {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'يلزم تسجيل الدخول' });
  const { id } = req.query;

  if (req.method === 'DELETE') {
    let query = supabase.from('clients').delete().eq('id', id);
    query = user.role !== 'super_admin' ? query.eq('counselor_id', user.counselor_id) : query;
    const { error } = await query;
    if (error) return res.status(500).json({ error: 'تعذّر حذف المراجع' });
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'PATCH') {
    const { data: client } = await supabase.from('clients').select('*').eq('id', id).single();
    if (!client) return res.status(404).json({ error: 'المراجع غير موجود' });
    if (user.role !== 'super_admin' && client.counselor_id !== user.counselor_id) {
      return res.status(403).json({ error: 'صلاحية غير كافية' });
    }
    const { active } = req.body || {};
    const { error } = await supabase.from('clients').update({ active: !!active }).eq('id', id);
    if (error) return res.status(500).json({ error: 'تعذّر تحديث الحالة' });

    if (!active) {
      // نقل لغير النشطين: مسح كل حجوزاته تلقائيًا
      await supabase.from('bookings').delete().eq('client_id', id);
    }
    return res.status(200).json({ ok: true });
  }

  res.status(405).json({ error: 'طريقة غير مدعومة' });
};
