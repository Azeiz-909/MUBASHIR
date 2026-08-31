const crypto = require('crypto');
const { supabase } = require('../../_lib/supabase');
const { getSessionUser } = require('../../_lib/auth');
const { createDailyRoomForBooking, updateDailyRoomExpiry } = require('../../_lib/daily');

const JOIN_WINDOW_MINUTES = 20;

module.exports = async (req, res) => {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'يلزم تسجيل الدخول' });
  const { id, action } = req.query;

  const { data: client } = await supabase.from('clients').select('*').eq('id', id).single();
  if (!client) return res.status(404).json({ error: 'المراجع غير موجود' });
  if (user.role !== 'super_admin' && client.counselor_id !== user.counselor_id) {
    return res.status(403).json({ error: 'صلاحية غير كافية' });
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

    const startMs = new Date(date + 'T' + time).getTime();
    const callExpiresAt = Math.floor(startMs / 1000) + 4 * 3600;
    const videoRoomUrl = await createDailyRoomForBooking(booking.id, startMs);
    await supabase.from('bookings').update({ video_room_url: videoRoomUrl, call_expires_at: callExpiresAt }).eq('id', booking.id);

    return res.status(200).json({ ok: true, booking: { id: booking.id, date, time }, joinWindowMinutes: JOIN_WINDOW_MINUTES });
  }

  if (action === 'call-expiry') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'طريقة غير مدعومة' });
    const days = parseInt(req.body?.days) || 0;
    const hours = parseInt(req.body?.hours) || 0;
    if (days === 0 && hours === 0) return res.status(400).json({ error: 'حدد مدة أكبر من صفر' });

    const { data: latestBooking } = await supabase.from('bookings')
      .select('*').eq('client_id', id).order('created_at', { ascending: false }).limit(1).single();
    if (!latestBooking) return res.status(404).json({ error: 'لا يوجد حجز مرتبط بهذا المراجع بعد' });

    const startMs = new Date(latestBooking.date + 'T' + latestBooking.time).getTime();
    const newExpSec = Math.floor(startMs / 1000) + days * 86400 + hours * 3600;

    const updatedUrl = await updateDailyRoomExpiry(latestBooking.video_room_url, newExpSec);
    if (!updatedUrl) return res.status(500).json({ error: 'تعذّر تحديث صلاحية رابط المكالمة (تحقق من إعداد Daily.co)' });

    await supabase.from('bookings').update({ video_room_url: updatedUrl, call_expires_at: newExpSec }).eq('id', latestBooking.id);
    return res.status(200).json({ ok: true });
  }

  res.status(404).json({ error: 'مسار غير معروف' });
};
