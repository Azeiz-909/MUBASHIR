const { supabase } = require('../_lib/supabase');

const JOIN_WINDOW_MINUTES = 20;

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'طريقة غير مدعومة' });
  const { id } = req.query;

  const { data: b, error } = await supabase.from('bookings').select('*').eq('id', id).single();
  if (error || !b) return res.status(404).json({ error: 'لم يتم العثور على حجز بهذا الرقم' });

  res.status(200).json({
    id: b.id, name: b.name, phone: b.phone, counselorId: b.counselor_id, counselorName: b.counselor_name,
    date: b.date, time: b.time, status: b.status, joinWindowMinutes: JOIN_WINDOW_MINUTES
  });
};
