const crypto = require('crypto');
const { supabase } = require('./_lib/supabase');
const { getSessionUser } = require('./_lib/auth');

const ALLOWED = { '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.gif':'image/gif', '.woff':'font/woff', '.woff2':'font/woff2', '.ttf':'font/ttf', '.otf':'font/otf' };

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'طريقة غير مدعومة' });
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'يلزم تسجيل الدخول' });

  const { filename, dataBase64 } = req.body || {};
  if (!filename || !dataBase64) return res.status(400).json({ error: 'لم يتم إرفاق ملف' });

  const ext = ('.' + filename.split('.').pop()).toLowerCase();
  const contentType = ALLOWED[ext];
  if (!contentType) return res.status(400).json({ error: 'صيغة الملف غير مدعومة' });

  const buffer = Buffer.from(dataBase64, 'base64');
  if (buffer.length > 4 * 1024 * 1024) return res.status(400).json({ error: 'حجم الملف كبير جدًا (الحد 4 ميجابايت)' });

  const path = `img_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
  const { error } = await supabase.storage.from('uploads').upload(path, buffer, { contentType, upsert: false });
  if (error) return res.status(500).json({ error: 'تعذّر رفع الملف: ' + error.message });

  const { data } = supabase.storage.from('uploads').getPublicUrl(path);
  res.status(200).json({ ok: true, url: data.publicUrl });
};
