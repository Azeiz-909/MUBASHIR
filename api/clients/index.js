const crypto = require('crypto');
const { supabase } = require('../_lib/supabase');
const { getSessionUser } = require('../_lib/auth');

module.exports = async (req, res) => {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'يلزم تسجيل الدخول' });

  if (req.method === 'GET') {
    // كل حسابات الأطباء والمدير العام تشاهد كل المراجعين (مشتركة بينهم، موزّعة حسب التصنيف)
    const { data, error } = await supabase.from('clients').select('*').order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: 'تعذّر تحميل المراجعين' });
    return res.status(200).json(data.map(c => ({
      id: c.id, name: c.name, phone: c.phone, category: c.category, counselorId: c.counselor_id, createdAt: c.created_at
    })));
  }

  if (req.method === 'POST') {
    const { name, phone, category, note } = req.body || {};
    if (!name || !phone) return res.status(400).json({ error: 'الاسم ورقم الجوال مطلوبان' });

    const counselorId = user.role === 'super_admin' ? (req.body.counselorId || null) : user.counselor_id;
    const client = {
      id: 'cl_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
      name, phone, category: (category || 'عام').trim() || 'عام',
      counselor_id: counselorId, created_at: Date.now()
    };
    const { error } = await supabase.from('clients').insert(client);
    if (error) return res.status(500).json({ error: 'تعذّر إضافة المراجع' });

    if ((note || '').trim()) {
      await supabase.from('client_notes').insert({
        id: 'n_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
        client_id: client.id, title: 'ملاحظة عند الإضافة', body: note.trim(), created_at: Date.now()
      });
    }

    return res.status(200).json({ ok: true, client: { id: client.id, name: client.name, phone: client.phone, category: client.category, counselorId: client.counselor_id } });
  }

  res.status(405).json({ error: 'طريقة غير مدعومة' });
};
