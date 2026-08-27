// ملف مساعد داخلي — لا يُنشئ رابط API مستقل (يبدأ بـ "_" فلا يُحسب من حد Vercel).
// يُستخدم من داخل ملفات الحجز مباشرة عند تأكيد أي موعد.

async function createDailyRoomForBooking(bookingId, startMs) {
  const apiKey = process.env.DAILY_API_KEY;
  if (!apiKey) return null; // لو المفتاح غير مُعرَّف بعد، نتجاهل بصمت بدل ما نكسر عملية الحجز

  const exp = Math.floor(startMs / 1000) + 60 * 60 * 4; // الغرفة تنتهي بعد 4 ساعات من وقت الموعد

  try {
    const roomRes = await fetch('https://api.daily.co/v1/rooms', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'b' + bookingId,
        privacy: 'private',
        properties: { exp, enable_chat: true, eject_at_room_exp: true }
      })
    });
    const room = await roomRes.json();
    if (!roomRes.ok || !room.url) return null;

    const tokenRes = await fetch('https://api.daily.co/v1/meeting-tokens', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ properties: { room_name: room.name, exp } })
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.token) return room.url;

    return `${room.url}?t=${tokenData.token}`;
  } catch (e) {
    return null;
  }
}

module.exports = { createDailyRoomForBooking };
