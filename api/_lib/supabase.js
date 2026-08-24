const { createClient } = require('@supabase/supabase-js');

// هذا الملف يعمل فقط على السيرفر (داخل /api) — لا يصل إليه المتصفح أبدًا.
// SUPABASE_SERVICE_ROLE_KEY يجب أن يكون موجودًا فقط في Environment Variables على Vercel.
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = { supabase };
