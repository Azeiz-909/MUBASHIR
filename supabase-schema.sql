-- ============================================================
-- عيادة تحدث — إعداد قاعدة البيانات (تُنفَّذ مرة واحدة فقط)
-- الصق هذا الملف كاملًا في: Supabase → SQL Editor → New Query → Run
-- ============================================================

-- جدول محتوى الموقع (صف واحد فقط يحتوي كل النصوص/الألوان/البيانات كـ JSON)
create table if not exists site_content (
  id smallint primary key default 1,
  data jsonb not null,
  constraint single_row check (id = 1)
);

-- جدول الحسابات (سوبر أدمن + مستشارون)
create table if not exists admin_users (
  id text primary key,
  name text not null,
  email text unique not null,
  role text not null check (role in ('super_admin','consultant')),
  counselor_id text,
  password_hash text not null,
  must_change_password boolean not null default true
);

-- جدول الحجوزات
create table if not exists bookings (
  id text primary key,
  name text not null,
  phone text not null,
  counselor_id text,
  counselor_name text,
  date text not null,
  time text not null,
  created_at bigint not null,
  status text not null default 'confirmed'
);

-- تفعيل RLS (الحماية) — الوصول الوحيد المسموح هو عبر مفتاح السيرفر السري (service_role)
-- الذي يتجاوز RLS تلقائيًا، لذلك لا حاجة لسياسات إضافية؛ هذا يمنع أي وصول مباشر
-- من المتصفح أو من أي مكان غير كودك الخاص.
alter table site_content enable row level security;
alter table admin_users enable row level security;
alter table bookings enable row level security;

-- البيانات الأولية للموقع (يمكن تعديل كل شيء لاحقًا من لوحة التحكم)
insert into site_content (id, data) values (1, '{
  "colors": { "ink": "#22322C", "background": "#EFEDE6", "clay": "#B8734F", "sage": "#7C8B7A" },
  "font": { "display": "Markazi Text", "body": "Tajawal", "customFontUrl": null, "customFontName": null },
  "site": { "name": "عيادة تحدث" },
  "hero": {
    "title": "مساحة آمنة… ليبدأ الحديث",
    "subtitle": "عيادة تحدث تقدّم جلسات استشارات أسرية وزوجية عن بُعد، بإشراف مختصين معتمدين، في بيئة هادئة تحفظ خصوصيتك وتمنحك الوقت الكافي لتُسمَع.",
    "image": null
  },
  "privacy": {
    "title": "خصوصيتك أولويتنا",
    "body": "كل جلسة تعقد عبر منصتنا مشفّرة بالكامل من طرف إلى طرف، ولا يُحتفظ بأي تسجيل صوتي أو مرئي للجلسة بعد انتهائها."
  },
  "firstSession": {
    "title": "ماذا تتوقع في جلستك الأولى؟",
    "body": "الجلسة الأولى مخصصة للتعارف وفهم موقفك، دون أي ضغط أو أحكام مسبقة.",
    "steps": ["ترحيب قصير وشرح مبسّط لطريقة سير الجلسات القادمة.", "الاستماع إلى ما يشغلك بأسلوبك الخاص وبالوتيرة التي تناسبك.", "الاتفاق سويًا على أهداف واضحة لمسار الاستشارة."]
  },
  "faq": [
    { "q": "كيف تتم الجلسة عن بُعد؟", "a": "تتم الجلسة عبر مكالمة فيديو خاصة داخل الموقع مباشرة، دون الحاجة لأي تثبيت إضافي." },
    { "q": "هل أحتاج تطبيقًا معينًا؟", "a": "لا حاجة لتحميل أي تطبيق. يكفي متصفح الإنترنت مع اتصال مستقر." },
    { "q": "ماذا لو تأخرت عن الموعد؟", "a": "تبقى الغرفة متاحة لفترة محددة بعد بداية الموعد." },
    { "q": "ما سياسة الإلغاء أو التأجيل؟", "a": "يمكن الإلغاء أو التأجيل قبل الموعد بمدة كافية دون أي رسوم." }
  ],
  "hours": [
    { "label": "السبت – الأربعاء", "value": "٩ص – ٩م" },
    { "label": "الخميس", "value": "٩ص – ٥م" },
    { "label": "الجمعة", "value": "مغلق" }
  ],
  "payments": ["مدى", "Visa / Mastercard", "Apple Pay", "تحويل بنكي"],
  "certifications": [
    { "label": "هيئة التخصصات الصحية السعودية", "image": null },
    { "label": "الجمعية السعودية للعلوم النفسية", "image": null }
  ],
  "contact": {
    "phone": "+966500000000",
    "whatsapp": "+966555555555",
    "email": "info@tahaduth-clinic.sa",
    "address": "الرياض، حي العليا، طريق الملك فهد"
  },
  "counselors": [
    { "id": "c1", "name": "د. هند السالم", "role": "استشارية أسرية وزواجية", "credentials": "دكتوراه في الإرشاد الأسري", "image": null },
    { "id": "c2", "name": "أ. منيرة العتيبي", "role": "أخصائية علاقات أسرية", "credentials": "ماجستير إرشاد نفسي", "image": null }
  ]
}'::jsonb)
on conflict (id) do nothing;

-- حساب الدخول الأول (سوبر أدمن)
-- البريد: admin@tahaduth-clinic.sa
-- كلمة المرور المؤقتة: ChangeMe123!  (سيُطلب تغييرها فور أول دخول)
insert into admin_users (id, name, email, role, counselor_id, password_hash, must_change_password)
values (
  'u_admin_001',
  'المدير العام',
  'admin@tahaduth-clinic.sa',
  'super_admin',
  null,
  'b04961e194c74459d12a77baa12e525e:ea20bfb8253ab2b544ccd88e89089949564f7acad5942972fbc5f1ac4671684ef054651779969f84c022868ba7865ce6592527a76fa195f969b5b70b88817562',
  true
)
on conflict (email) do nothing;

-- ============================================================
-- تحديثات إضافية (نفّذ هذا الجزء أيضًا حتى لو كانت قاعدة البيانات
-- منشأة مسبقًا — كل الأوامر آمنة ولن تكرر أو تحذف أي بيانات موجودة)
-- ============================================================

-- أعمدة إضافية على جدول الحجوزات: ربط الحجز بمراجع محدد + ملاحظة عند الحجز
alter table bookings add column if not exists client_id text;
alter table bookings add column if not exists notes text;

-- جدول المراجعين (العملاء) الخاصين بكل مستشار
create table if not exists clients (
  id text primary key,
  name text not null,
  phone text not null,
  category text not null default 'عام',
  counselor_id text,
  created_at bigint not null
);

-- جدول ملاحظات المراجعين
create table if not exists client_notes (
  id text primary key,
  client_id text not null references clients(id) on delete cascade,
  title text not null,
  body text not null,
  created_at bigint not null
);

-- جدول أوقات إغلاق/انشغال المستشار (تُستخدم لمنع الحجز في هذه الأوقات)
create table if not exists availability_blocks (
  id text primary key,
  counselor_id text not null,
  date text not null,
  time text not null,
  created_at bigint not null,
  unique (counselor_id, date, time)
);

alter table clients enable row level security;
alter table client_notes enable row level security;
alter table availability_blocks enable row level security;

-- ============================================================
-- بعد تنفيذ هذا الملف، اذهب إلى: Storage → Create bucket
-- اسم الـ bucket: uploads   |  فعّل خيار "Public bucket"
-- ============================================================
