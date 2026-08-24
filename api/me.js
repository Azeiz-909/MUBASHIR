const { getSessionUser } = require('./_lib/auth');

module.exports = async (req, res) => {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'يلزم تسجيل الدخول' });
  res.status(200).json({
    id: user.id, name: user.name, email: user.email, role: user.role,
    counselorId: user.counselor_id || null,
    mustChangePassword: !!user.must_change_password
  });
};
