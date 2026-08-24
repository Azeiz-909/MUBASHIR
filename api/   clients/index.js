
const crypto = require('crypto');
const { supabase } = require('../../_lib/supabase');
const { getSessionUser } = require('../../_lib/auth');

module.exports = async (req, res) => {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'يلزم تسجيل الدخول' });
  const { id } = req.query; // معرّف المراجع

  const { data: client } = await supabase.from('clients').select('counselor_id').eq('id', id).single();
  if (!client) return res.status(404).json({ error: 'المراجع غير موجود' });
  if (user.role !== 'super_admin' && client.counselor_id !== user.counselor_id) {
    return res.status(403).json({ error: 'صلاحية غير كافية' });
  }

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('client_notes').select('*').eq('client_id', id).order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: 'تعذّر تحميل الملاحظات' });
    return res.status(200).json(data.map(n => ({ id: n.id, title: n.title, body: n.body, createdAt: n.created_at })));
  }

  if (req.method === 'POST') {
    const { title, body } = req.body || {};
    if (!title || !body) return res.status(400).json({ error: 'عنوان الملاحظة ونصها مطلوبان' });
    const note = { id: 'n_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'), client_id: id, title, body, created_at: Date.now() };
    const { error } = await supabase.from('client_notes').insert(note);
    if (error) return res.status(500).json({ error: 'تعذّر إضافة الملاحظة' });
    return res.status(200).json({ ok: true, note: { id: note.id, title: note.title, body: note.body, createdAt: note.created_at } });
  }

  res.status(405).json({ error: 'طريقة غير مدعومة' });
};
