const { clearSessionCookie } = require('../_lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'طريقة غير مدعومة' });
  clearSessionCookie(res);
  res.status(200).json({ ok: true });
};
