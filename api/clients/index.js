const crypto = require('crypto');
const { supabase } = require('../_lib/supabase');
const { getSessionUser } = require('../_lib/auth');

module.exports = async (req, res) => {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'يلزم تسجيل الدخول' });

  if (req.method === 'GET') {
    let query = supabase.from('clients').select('*').order('created_at', { ascending: false });
    query = user.role !== 'super_admin'
      ? (user.counselor_id ? query.eq('counselor_id', user.counselor_id) : query.is('counselor_id', null))
      : query;
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: 'تعذّر تحميل المراجعين' });
    return res.status(200).json(data.map(c => ({ id: c.id, name: c.name, phone: c.phone, category: c.category, counselorId: c.counselor_id, createdAt: c.created_at, active: c.active !== false })));
  }

  if (req.method === 'POST') {
    const { name, phone, category, note } = req.body || {};
    if (!name || !phone) return res.status(400).json({ error: 'الاسم ورقم الجوال مطلوبان' });
    const counselorId = user.role === 'super_admin' ? (req.body.counselorId || null) : user.counselor_id;
    const clientId = 'cl_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
    const { error } = await supabase.from('clients').insert({
      id: clientId, name, phone, category: (category || 'عام').trim() || 'عام', counselor_id: counselorId, created_at: Date.now()
    });
    if (error) return res.status(500).json({ error: 'تعذّر إضافة المراجع' });
    if (note && note.trim()) {
      await supabase.from('client_notes').insert({
        id: 'n_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
        client_id: clientId, title: 'ملاحظة عند الإضافة', body: note.trim(), created_at: Date.now()
      });
    }
    return res.status(200).json({ ok: true, client: { id: clientId, name, phone, category: category || 'عام', counselorId } });
  }

  res.status(405).json({ error: 'طريقة غير مدعومة' });
};
