const { supabase } = require('./supabase');

// يتحقق أن الوقت المطلوب غير محجوز مسبقًا (لا يتوافق مع موعد آخر) وغير مُغلق من قِبل المستشار
async function checkSlotAvailable(counselorId, date, time) {
  if (!counselorId) return { ok: true };

  const { data: existing } = await supabase
    .from('bookings').select('id')
    .eq('counselor_id', counselorId).eq('date', date).eq('time', time)
    .neq('status', 'cancelled');
  if (existing && existing.length) return { ok: false, error: 'هذا الموعد محجوز مسبقًا، الرجاء اختيار وقت آخر' };

  const { data: blocked } = await supabase
    .from('availability_blocks').select('id')
    .eq('counselor_id', counselorId).eq('date', date).eq('time', time);
  if (blocked && blocked.length) return { ok: false, error: 'المستشار غير متاح في هذا الوقت، الرجاء اختيار وقت آخر' };

  return { ok: true };
}

module.exports = { checkSlotAvailable };
