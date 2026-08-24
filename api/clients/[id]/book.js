const crypto = require('crypto');
const { supabase } = require('../../_lib/supabase');
const { getSessionUser } = require('../../_lib/auth');

const JOIN_WINDOW_MINUTES = 20;

module.exports = async (req, res) => {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'يلزم تسجيل الدخول' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'طريقة غير مدعومة' });

  const { id } = req.query; // معرّف المراجع
  const { date, time } = req.body || {};
  if (!date || !time) return res.status(400).json({ error: 'التاريخ والوقت مطلوبان' });

  const { data: client } = await supabase.from('clients').select('*').eq('id', id).single();
  if (!client) return res.status(404).json({ error: 'المراجع غير موجود' });
  if (user.role !== 'super_admin' && client.counselor_id !== user.counselor_id) {
    return res.status(403).json({ error: 'صلاحية غير كافية' });
  }

  const { data: content } = await supabase.from('site_content').select('data').eq('id', 1).single();
  const counselor = (content?.data?.counselors || []).find(c => c.id === client.counselor_id);

  const booking = {
    id: crypto.randomBytes(5).toString('hex'),
    name: client.name, phone: client.phone,
    counselor_id: client.counselor_id,
    counselor_name: counselor ? counselor.name : 'غير محدد',
    date, time, created_at: Date.now(), status: 'confirmed',
    client_id: client.id
  };
  const { error } = await supabase.from('bookings').insert(booking);
  if (error) return res.status(500).json({ error: 'تعذّر إنشاء الحجز' });

  res.status(200).json({ ok: true, booking: { id: booking.id, date, time }, joinWindowMinutes: JOIN_WINDOW_MINUTES });
};
