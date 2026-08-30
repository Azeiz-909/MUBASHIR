const crypto = require('crypto');
const { supabase } = require('./_lib/supabase');
const { getSessionUser } = require('./_lib/auth');

module.exports = async (req, res) => {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'يلزم تسجيل الدخول' });

  const counselorId = user.role === 'super_admin' ? (req.query.counselorId || req.body?.counselorId) : user.counselor_id;
  if (!counselorId) return res.status(400).json({ error: 'لا يوجد مستشار مرتبط بهذا الحساب' });

  if (req.method === 'GET') {
    const { date } = req.query;
    let blocksQuery = supabase.from('availability_blocks').select('date,time').eq('counselor_id', counselorId);
    let bookingsQuery = supabase.from('bookings').select('date,time').eq('counselor_id', counselorId);

    if (date) {
      blocksQuery = blocksQuery.eq('date', date);
      bookingsQuery = bookingsQuery.eq('date', date);
    } else {
      const days = Math.min(parseInt(req.query.days) || 14, 30);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const endDate = new Date(today); endDate.setDate(endDate.getDate() + days);
      const startStr = today.toISOString().slice(0, 10);
      const endStr = endDate.toISOString().slice(0, 10);
      blocksQuery = blocksQuery.gte('date', startStr).lte('date', endStr);
      bookingsQuery = bookingsQuery.gte('date', startStr).lte('date', endStr);
    }

    const [{ data: blocks, error: e1 }, { data: bookings, error: e2 }] = await Promise.all([blocksQuery, bookingsQuery]);
    if (e1 || e2) return res.status(500).json({ error: 'تعذّر تحميل الجدول' });
    return res.status(200).json({
      blocks: (blocks || []).map(b => ({ date: b.date, time: b.time })),
      bookings: (bookings || []).map(b => ({ date: b.date, time: b.time }))
    });
  }

  if (req.method === 'POST') {
    const { date, time, action } = req.body || {};

    if (action === 'block_day') {
      if (!date) return res.status(400).json({ error: 'التاريخ مطلوب' });
      const slots = [];
      for (let h = 8; h <= 21; h++) { slots.push(String(h).padStart(2,'0')+':00'); slots.push(String(h).padStart(2,'0')+':30'); }

      const { data: bookedRows } = await supabase.from('bookings').select('time').eq('counselor_id', counselorId).eq('date', date);
      const bookedTimes = new Set((bookedRows || []).map(b => b.time));
      const toInsert = slots.filter(t => !bookedTimes.has(t)).map(t => ({
        id: 'ab_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex') + '_' + t.replace(':',''),
        counselor_id: counselorId, date, time: t, created_at: Date.now()
      }));
      if (toInsert.length) {
        const { error } = await supabase.from('availability_blocks').upsert(toInsert, { onConflict: 'counselor_id,date,time', ignoreDuplicates: true });
        if (error) return res.status(500).json({ error: 'تعذّر تعطيل اليوم بالكامل' });
      }
      return res.status(200).json({ ok: true, blockedCount: toInsert.length });
    }

    if (!date || !time) return res.status(400).json({ error: 'التاريخ والوقت مطلوبان' });

    if (action === 'unblock') {
      const { error } = await supabase.from('availability_blocks').delete()
        .eq('counselor_id', counselorId).eq('date', date).eq('time', time);
      if (error) return res.status(500).json({ error: 'تعذّر إلغاء الحجب' });
      return res.status(200).json({ ok: true });
    }

    const { data: existingBooking } = await supabase.from('bookings').select('id')
      .eq('counselor_id', counselorId).eq('date', date).eq('time', time).limit(1);
    if (existingBooking && existingBooking.length) {
      return res.status(400).json({ error: 'هذا الوقت لديه موعد محجوز بالفعل، لا يمكن حجبه' });
    }

    const { error } = await supabase.from('availability_blocks').insert({
      id: 'ab_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
      counselor_id: counselorId, date, time, created_at: Date.now()
    });
    if (error && error.code !== '23505') return res.status(500).json({ error: 'تعذّر حجب الوقت' });
    return res.status(200).json({ ok: true });
  }

  res.status(405).json({ error: 'طريقة غير مدعومة' });
};
