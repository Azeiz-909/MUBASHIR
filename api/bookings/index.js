const crypto = require('crypto');
const { supabase } = require('../_lib/supabase');
const { getSessionUser } = require('../_lib/auth');
const { checkSlotAvailable } = require('../_lib/availability');

const JOIN_WINDOW_MINUTES = 20; // يُفعَّل زر دخول الجلسة قبل الموعد بهذه المدة

module.exports = async (req, res) => {
  // ----- إنشاء حجز جديد (عام، بدون تسجيل دخول) -----
  if (req.method === 'POST') {
    const { name, phone, counselorId, date, time, notes } = req.body || {};
    if (!name || !phone || !date || !time) {
      return res.status(400).json({ error: 'الرجاء تعبئة الاسم ورقم الجوال والتاريخ والوقت' });
    }

    const { data: content } = await supabase.from('site_content').select('data').eq('id', 1).single();
    const counselors = content?.data?.counselors || [];
    let counselor = null;
    if (counselors.length > 1) {
      counselor = counselors.find(c => c.id === counselorId);
      if (!counselor) return res.status(400).json({ error: 'الرجاء اختيار المستشار' });
    } else {
      counselor = counselors[0] || null;
    }

    const check = await checkSlotAvailable(counselor ? counselor.id : null, date, time);
    if (!check.ok) return res.status(409).json({ error: check.error });

    const trimmedNotes = (notes || '').trim() || null;

    // إيجاد/إنشاء "مراجع" مرتبط برقم الجوال، ليظهر تلقائيًا في صفحة "المراجعين" عند كل الأطباء
    let clientId = null;
    const { data: existingClient } = await supabase.from('clients').select('id').eq('phone', phone).limit(1).maybeSingle();
    if (existingClient) {
      clientId = existingClient.id;
    } else {
      clientId = 'cl_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
      await supabase.from('clients').insert({
        id: clientId, name, phone, category: 'حجوزات جديدة',
        counselor_id: counselor ? counselor.id : null, created_at: Date.now()
      });
    }
    if (trimmedNotes) {
      await supabase.from('client_notes').insert({
        id: 'n_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
        client_id: clientId, title: 'ملاحظة من الحجز', body: trimmedNotes, created_at: Date.now()
      });
    }

    const booking = {
      id: crypto.randomBytes(5).toString('hex'),
      name, phone,
      counselor_id: counselor ? counselor.id : null,
      counselor_name: counselor ? counselor.name : 'غير محدد',
      date, time,
      notes: trimmedNotes,
      client_id: clientId,
      created_at: Date.now(),
      status: 'confirmed'
    };
    const { error } = await supabase.from('bookings').insert(booking);
    if (error) return res.status(500).json({ error: 'تعذّر إنشاء الحجز' });

    return res.status(200).json({
      ok: true,
      booking: { id: booking.id, name: booking.name, phone: booking.phone, counselorId: booking.counselor_id, counselorName: booking.counselor_name, date: booking.date, time: booking.time, notes: booking.notes },
      joinWindowMinutes: JOIN_WINDOW_MINUTES
    });
  }

  // ----- قراءة قائمة الحجوزات، أو (عبر ?availability=1) قراءة جدول توفر مستشار -----
  if (req.method === 'GET') {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'يلزم تسجيل الدخول' });

    if (req.query.availability === '1') {
      const counselorId = user.role === 'super_admin' ? (req.query.counselorId || null) : user.counselor_id;
      if (!counselorId) return res.status(400).json({ error: 'الرجاء تحديد المستشار' });

      const [{ data: blocks, error: e1 }, { data: bks, error: e2 }] = await Promise.all([
        supabase.from('availability_blocks').select('date,time').eq('counselor_id', counselorId),
        supabase.from('bookings').select('date,time,name').eq('counselor_id', counselorId).neq('status', 'cancelled')
      ]);
      if (e1 || e2) return res.status(500).json({ error: 'تعذّر تحميل بيانات التوفر' });

      return res.status(200).json({
        counselorId,
        blocked: (blocks || []).map(b => ({ date: b.date, time: b.time })),
        booked: (bks || []).map(b => ({ date: b.date, time: b.time, name: b.name }))
      });
    }

    // كل الحسابات (المدير العام وكل حسابات المستشارين) تشاهد كل المواعيد المحجوزة
    const { data, error } = await supabase.from('bookings').select('*').order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: 'تعذّر تحميل الحجوزات' });

    const bookings = data.map(b => ({
      id: b.id, name: b.name, phone: b.phone, counselorId: b.counselor_id, counselorName: b.counselor_name,
      date: b.date, time: b.time, notes: b.notes || '', createdAt: b.created_at, status: b.status
    }));
    return res.status(200).json({ bookings, joinWindowMinutes: JOIN_WINDOW_MINUTES });
  }

  // ----- إغلاق/فتح وقت من جدول توفر المستشار -----
  if (req.method === 'PUT') {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'يلزم تسجيل الدخول' });

    const { date, time, action } = req.body || {};
    if (!date || !time || !['block', 'unblock'].includes(action)) {
      return res.status(400).json({ error: 'بيانات غير مكتملة' });
    }
    const counselorId = user.role === 'super_admin' ? (req.body.counselorId || null) : user.counselor_id;
    if (!counselorId) return res.status(400).json({ error: 'الرجاء تحديد المستشار' });

    if (action === 'block') {
      const { data: existing } = await supabase.from('bookings').select('id')
        .eq('counselor_id', counselorId).eq('date', date).eq('time', time).neq('status', 'cancelled');
      if (existing && existing.length) return res.status(409).json({ error: 'هذا الوقت لديه موعد محجوز بالفعل' });

      const { error } = await supabase.from('availability_blocks').upsert({
        id: 'ab_' + crypto.createHash('md5').update(counselorId + date + time).digest('hex'),
        counselor_id: counselorId, date, time, created_at: Date.now()
      }, { onConflict: 'counselor_id,date,time' });
      if (error) return res.status(500).json({ error: 'تعذّر إغلاق الوقت' });
    } else {
      const { error } = await supabase.from('availability_blocks').delete()
        .eq('counselor_id', counselorId).eq('date', date).eq('time', time);
      if (error) return res.status(500).json({ error: 'تعذّر فتح الوقت' });
    }

    return res.status(200).json({ ok: true });
  }

  res.status(405).json({ error: 'طريقة غير مدعومة' });
};
