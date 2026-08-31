const { supabase } = require('../_lib/supabase');
const { getSessionUser } = require('../_lib/auth');

const JOIN_WINDOW_MINUTES = 20;

module.exports = async (req, res) => {
  const { id } = req.query;

  if (req.method === 'DELETE') {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'يلزم تسجيل الدخول' });
    let query = supabase.from('bookings').delete().eq('id', id);
    query = user.role !== 'super_admin' ? query.eq('counselor_id', user.counselor_id) : query;
    const { error } = await query;
    if (error) return res.status(500).json({ error: 'تعذّر حذف الحجز' });
    return res.status(200).json({ ok: true });
  }

  if (req.method !== 'GET') return res.status(405).json({ error: 'طريقة غير مدعومة' });

  const { data: b, error } = await supabase.from('bookings').select('*').eq('id', id).single();
  if (error || !b) return res.status(404).json({ error: 'لم يتم العثور على حجز بهذا الرقم' });

  res.status(200).json({
    id: b.id, name: b.name, phone: b.phone, counselorId: b.counselor_id, counselorName: b.counselor_name,
    date: b.date, time: b.time, status: b.status, videoRoomUrl: b.video_room_url || null,
    joinWindowMinutes: JOIN_WINDOW_MINUTES
  });
};
