const crypto = require('crypto');
const { supabase } = require('../_lib/supabase');
const { getSessionUser } = require('../_lib/auth');
const { createDailyRoomForBooking } = require('../_lib/daily');

const JOIN_WINDOW_MINUTES = 20;

async function findOrCreateClient(counselorId, name, phone) {
  const { data: existing } = await supabase.from('clients').select('id').eq('counselor_id', counselorId).eq('phone', phone).limit(1);
  if (existing && existing.length) return existing[0].id;
  const id = 'cl_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
  await supabase.from('clients').insert({ id, name, phone, category: 'حجز عام', counselor_id: counselorId, created_at: Date.now() });
  return id;
}

module.exports = async (req, res) => {
  if (req.method === 'POST') {
    const { name, phone, counselorId, date, time, note } = req.body || {};
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
    const cId = counselor ? counselor.id : null;

    if (cId) {
      const { data: taken } = await supabase.from('bookings').select('id').eq('counselor_id', cId).eq('date', date).eq('time', time).limit(1);
      if (taken && taken.length) return res.status(400).json({ error: 'هذا الوقت محجوز بالفعل، الرجاء اختيار وقت آخر' });
      const { data: blocked } = await supabase.from('availability_blocks').select('id').eq('counselor_id', cId).eq('date', date).eq('time', time).limit(1);
      if (blocked && blocked.length) return res.status(400).json({ error: 'المستشار غير متاح في هذا الوقت، الرجاء اختيار وقت آخر' });
    }

    let clientId = null;
    if (cId) {
      clientId = await findOrCreateClient(cId, name, phone);
      if (note && note.trim()) {
        await supabase.from('client_notes').insert({
          id: 'n_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
          client_id: clientId, title: 'ملاحظة عند الحجز', body: note.trim(), created_at: Date.now()
        });
      }
    }

    const booking = {
      id: crypto.randomBytes(5).toString('hex'),
      name, phone, counselor_id: cId, counselor_name: counselor ? counselor.name : 'غير محدد',
      date, time, created_at: Date.now(), status: 'confirmed', client_id: clientId
    };
    const { error } = await supabase.from('bookings').insert(booking);
    if (error) return res.status(500).json({ error: 'تعذّر إنشاء الحجز' });

    const startMs = new Date(date + 'T' + time).getTime();
    const callExpiresAt = Math.floor(startMs / 1000) + 4 * 3600; // تنتهي صلاحية المكالمة بعد 4 ساعات من وقت الموعد افتراضيًا
    const videoRoomUrl = await createDailyRoomForBooking(booking.id, startMs);
    await supabase.from('bookings').update({ video_room_url: videoRoomUrl, call_expires_at: callExpiresAt }).eq('id', booking.id);

    return res.status(200).json({
      ok: true,
      booking: { id: booking.id, name, phone, counselorId: cId, counselorName: booking.counselor_name, date, time },
      joinWindowMinutes: JOIN_WINDOW_MINUTES
    });
  }

  if (req.method === 'GET') {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'يلزم تسجيل الدخول' });

    // حذف تلقائي لأي حجز انتهت صلاحية رابط مكالمته
    const nowSec = Math.floor(Date.now() / 1000);
    await supabase.from('bookings').delete().lt('call_expires_at', nowSec);

    let query = supabase.from('bookings').select('*').order('created_at', { ascending: false });
    query = user.role !== 'super_admin'
      ? (user.counselor_id ? query.eq('counselor_id', user.counselor_id) : query.is('counselor_id', null))
      : query;
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: 'تعذّر تحميل الحجوزات' });
    const bookings = data.map(b => ({ id: b.id, name: b.name, phone: b.phone, counselorId: b.counselor_id, counselorName: b.counselor_name, date: b.date, time: b.time, createdAt: b.created_at, status: b.status }));
    return res.status(200).json({ bookings, joinWindowMinutes: JOIN_WINDOW_MINUTES });
  }

  res.status(405).json({ error: 'طريقة غير مدعومة' });
};
