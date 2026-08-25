const crypto = require('crypto');
const { supabase } = require('../../_lib/supabase');
const { getSessionUser } = require('../../_lib/auth');
const { checkSlotAvailable } = require('../../_lib/availability');

const JOIN_WINDOW_MINUTES = 20;

module.exports = async (req, res) => {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'يلزم تسجيل الدخول' });
  const { id, action } = req.query;

  const { data: client } = await supabase.from('clients').select('*').eq('id', id).single();
  if (!client) return res.status(404).json({ error: 'المراجع غير موجود' });
  // كل الحسابات المسجّلة (المدير العام وكل الأطباء) لها صلاحية التعامل مع كل مراجع — المراجعون مشتركون بين الجميع

  if (action === 'category') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'طريقة غير مدعومة' });
    const { category } = req.body || {};
    if (!category || !category.trim()) return res.status(400).json({ error: 'التصنيف مطلوب' });
    const { error } = await supabase.from('clients').update({ category: category.trim() }).eq('id', id);
    if (error) return res.status(500).json({ error: 'تعذّر نقل المراجع' });
    return res.status(200).json({ ok: true, category: category.trim() });
  }

  if (action === 'notes') {
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
    return res.status(405).json({ error: 'طريقة غير مدعومة' });
  }

  if (action === 'book') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'طريقة غير مدعومة' });
    const { date, time } = req.body || {};
    if (!date || !time) return res.status(400).json({ error: 'التاريخ والوقت مطلوبان' });

    const check = await checkSlotAvailable(client.counselor_id, date, time);
    if (!check.ok) return res.status(409).json({ error: check.error });

    const { data: content } = await supabase.from('site_content').select('data').eq('id', 1).single();
    const counselor = (content?.data?.counselors || []).find(c => c.id === client.counselor_id);
    const booking = {
      id: crypto.randomBytes(5).toString('hex'),
      name: client.name, phone: client.phone,
      counselor_id: client.counselor_id,
      counselor_name: counselor ? counselor.name : 'غير محدد',
      date, time, created_at: Date.now(), status: 'confirmed', client_id: client.id
    };
    const { error } = await supabase.from('bookings').insert(booking);
    if (error) return res.status(500).json({ error: 'تعذّر إنشاء الحجز' });
    return res.status(200).json({ ok: true, booking: { id: booking.id, date, time }, joinWindowMinutes: JOIN_WINDOW_MINUTES });
  }

  res.status(404).json({ error: 'مسار غير معروف' });
};
