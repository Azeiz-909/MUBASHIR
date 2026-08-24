const crypto = require('crypto');
const { supabase } = require('../_lib/supabase');
const { getSessionUser } = require('../_lib/auth');

const JOIN_WINDOW_MINUTES = 20; // يُفعَّل زر دخول الجلسة قبل الموعد بهذه المدة

module.exports = async (req, res) => {
  if (req.method === 'POST') {
    const { name, phone, counselorId, date, time } = req.body || {};
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

    const booking = {
      id: crypto.randomBytes(5).toString('hex'),
      name, phone,
      counselor_id: counselor ? counselor.id : null,
      counselor_name: counselor ? counselor.name : 'غير محدد',
      date, time,
      created_at: Date.now(),
      status: 'confirmed'
    };
    const { error } = await supabase.from('bookings').insert(booking);
    if (error) return res.status(500).json({ error: 'تعذّر إنشاء الحجز' });

    return res.status(200).json({
      ok: true,
      booking: { id: booking.id, name: booking.name, phone: booking.phone, counselorId: booking.counselor_id, counselorName: booking.counselor_name, date: booking.date, time: booking.time },
      joinWindowMinutes: JOIN_WINDOW_MINUTES
    });
  }

  if (req.method === 'GET') {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'يلزم تسجيل الدخول' });

    let query = supabase.from('bookings').select('*').order('created_at', { ascending: false });
    if (user.role !== 'super_admin') query = query.eq('counselor_id', user.counselor_id);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: 'تعذّر تحميل الحجوزات' });

    const bookings = data.map(b => ({ id: b.id, name: b.name, phone: b.phone, counselorId: b.counselor_id, counselorName: b.counselor_name, date: b.date, time: b.time, createdAt: b.created_at, status: b.status }));
    return res.status(200).json({ bookings, joinWindowMinutes: JOIN_WINDOW_MINUTES });
  }

  res.status(405).json({ error: 'طريقة غير مدعومة' });
};
