const { supabase } = require('./_lib/supabase');
const { getSessionUser } = require('./_lib/auth');

function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    const { data, error } = await supabase.from('site_content').select('data').eq('id', 1).single();
    if (error) return res.status(500).json({ error: 'تعذّر تحميل المحتوى' });
    return res.status(200).json(data.data);
  }

  if (req.method === 'PUT') {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'يلزم تسجيل الدخول' });

    const { data: current, error: readErr } = await supabase.from('site_content').select('data').eq('id', 1).single();
    if (readErr) return res.status(500).json({ error: 'تعذّر قراءة المحتوى الحالي' });

    const merged = deepMerge(current.data, req.body || {});
    const { error: writeErr } = await supabase.from('site_content').update({ data: merged }).eq('id', 1);
    if (writeErr) return res.status(500).json({ error: 'تعذّر حفظ التعديلات' });

    return res.status(200).json({ ok: true, content: merged });
  }

  res.status(405).json({ error: 'طريقة غير مدعومة' });
};
