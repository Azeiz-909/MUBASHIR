const crypto = require('crypto');
const { supabase } = require('../_lib/supabase');
const { getSessionUser } = require('../_lib/auth');

const JOIN_WINDOW_MINUTES = 20;

module.exports = async (req, res) => {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'يلزم تسجيل الدخول' });

  const slug = req.query.slug || [];
  const [id, action] = slug;

  // ===== /api/clients =====
  if (!id) {
    if (req.method === 'GET') {
      let query = supabase.from('clients').select('*').order('created_at', { ascending: false });
      query = user.role !== 'super_admin'
        ? (user.counselor_id ? query.eq('counselor_id', user.counselor_id) : query.is('counselor_id', null))
        : query;
      const { data, error } = await query;
      if (error) return res.status(500).json({ error: 'تعذّر تحميل المراجعين' });
      return res.status(200).json(data.map(c => ({ id: c.id, name: c.name, phone: c.phone, category: c.category, counselorId: c.counselor_id, createdAt: c.created_at })));
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
    return res.status(405).json({ error: 'طريقة غير مدعومة' });
  }

  // تحقق من ملكية المراجع لكل ما بعد هذا
  const { data: client } = await supabase.from('clients').select('*').eq('id', id).single();
  if (!client) return res.status(404).json({ error: 'المراجع غير موجود' });
  if (user.role !== 'super_admin' && client.counselor_id !== user.counselor_id) {
    return res.status(403).json({ error: 'صلاحية غير كافية' });
  }

  // ===== /api/clients/:id =====
  if (!action) {
    if (req.method !== 'DELETE') return res.status(405).json({ error: 'طريقة غير مدعومة' });
    const { error } = await supabase.from('clients').delete().eq('id', id);
    if (error) return res.status(500).json({ error: 'تعذّر حذف المراجع' });
    return res.status(200).json({ ok: true });
  }

  // ===== /api/clients/:id/notes =====
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

  // ===== /api/clients/:id/book =====
  if (action === 'book') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'طريقة غير مدعومة' });
    const { date, time } = req.body || {};
    if (!date || !time) return res.status(400).json({ error: 'التاريخ والوقت مطلوبان' });

    const { data: taken } = await supabase.from('bookings').select('id').eq('counselor_id', client.counselor_id).eq('date', date).eq('time', time).limit(1);
    if (taken && taken.length) return res.status(400).json({ error: 'هذا الوقت محجوز بالفعل' });
    const { data: blocked } = await supabase.from('availability_blocks').select('id').eq('counselor_id', client.counselor_id).eq('date', date).eq('time', time).limit(1);
    if (blocked && blocked.length) return res.status(400).json({ error: 'أنت محدَّد كمشغول في هذا الوقت بجدولك' });

    const { data: content } = await supabase.from('site_content').select('data').eq('id', 1).single();
    const counselor = (content?.data?.counselors || []).find(c => c.id === client.counselor_id);
    const booking = {
      id: crypto.randomBytes(5).toString('hex'), name: client.name, phone: client.phone,
      counselor_id: client.counselor_id, counselor_name: counselor ? counselor.name : 'غير محدد',
      date, time, created_at: Date.now(), status: 'confirmed', client_id: client.id
    };
    const { error } = await supabase.from('bookings').insert(booking);
    if (error) return res.status(500).json({ error: 'تعذّر إنشاء الحجز' });
    return res.status(200).json({ ok: true, booking: { id: booking.id, date, time }, joinWindowMinutes: JOIN_WINDOW_MINUTES });
  }

  res.status(404).json({ error: 'مسار غير معروف' });
};
