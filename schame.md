<!--
  School Manager — مخطط قاعدة البيانات (PostgreSQL / Supabase)
  ملف مرجعي: نفّذ السكربت على قاعدة جديدة، أو استخرج منه أجزاء للترقية التدريجية.
  المحتوى التالي هو SQL صالح؛ التعليقات بـ --
-->

-- ============================================================
-- School Manager SaaS — Database schema (canonical)
-- Multi-tenant · RLS · حضور · مالية (أقساط، دفعات، مصروفات، إيرادات)
-- ============================================================

-- ------------------------------------------------------------
-- 0) إعداد أولي
-- ------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1) الأنواع المعدّلة (ENUMs)
-- ------------------------------------------------------------
do $$ begin
  create type public.user_role as enum ('owner', 'staff');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.subscription_type as enum ('trial', 'basic', 'pro', 'enterprise');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.gender_type as enum ('male', 'female');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.student_status as enum ('active', 'withdrawn');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.attendance_status as enum ('present', 'absent');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.expense_type as enum ('salary', 'general');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------
-- 2) الجداول — الهوية والمستأجر (Tenant)
-- ------------------------------------------------------------

-- المدرسة: كل البيانات التشغيلية مرتبطة بـ school_id
create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users (id) on delete restrict,
  subscription_plan public.subscription_type not null default 'trial',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ملف المستخدم داخل التطبيق: نفس معرف Supabase Auth
create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  role public.user_role not null default 'staff',
  school_id uuid not null references public.schools (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 3) الجداول — أكاديمي
-- ------------------------------------------------------------

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  name text not null,
  stage text,
  description text,
  created_at timestamptz not null default now(),
  unique (id, school_id),
  unique (school_id, name)
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  first_name text not null,
  last_name text not null,
  father_name text,
  mother_name text,
  full_name text not null,
  class_id uuid references public.classes (id) on delete set null,
  gender public.gender_type not null,
  birth_place text,
  birth_date date,
  registry_place text,
  registry_date date,
  enrollment_date date,
  previous_school text,
  base_tuition numeric(12, 2) not null default 0 check (base_tuition >= 0),
  guardian_phone text,
  address text,
  status public.student_status not null default 'active',
  created_at timestamptz not null default now(),
  unique (id, school_id)
);

create table if not exists public.teachers (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  full_name text not null,
  academic_qualification text,
  certificate_obtained_date date,
  certificate_source text,
  years_of_experience integer check (years_of_experience >= 0),
  phone text,
  salary numeric(12, 2) not null default 0 check (salary >= 0),
  subject text,
  created_at timestamptz not null default now(),
  unique (id, school_id)
);

-- ------------------------------------------------------------
-- 4) الجداول — مالية (أقساط طلاب، دفعات طلاب، أقساط رواتب معلمين، دفعات رواتب، مصروفات، إيرادات)
-- ------------------------------------------------------------

create table if not exists public.installments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  total_amount numeric(12, 2) not null check (total_amount > 0),
  due_date date not null,
  created_at timestamptz not null default now(),
  unique (id, school_id)
);

-- دفعات الطلاب: تُحسب ضمن إجمالي الإيرادات في v_financial_summary
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  installment_id uuid references public.installments (id) on delete set null,
  amount numeric(12, 2) not null check (amount > 0),
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (id, school_id)
);

-- أقساط رواتب المعلمين (فترات استحقاق) + دفعات الصرف المرتبطة بها — تُحسب دفعات المعلمين ضمن total_expenses في v_financial_summary
create table if not exists public.teacher_installments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  total_amount numeric(12, 2) not null check (total_amount > 0),
  due_date date not null,
  created_at timestamptz not null default now(),
  unique (id, school_id)
);

create table if not exists public.teacher_payments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  installment_id uuid references public.teacher_installments (id) on delete set null,
  amount numeric(12, 2) not null check (amount > 0),
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (id, school_id)
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  title text not null,
  amount numeric(12, 2) not null check (amount > 0),
  type public.expense_type not null,
  expense_date date not null default current_date,
  created_at timestamptz not null default now(),
  unique (id, school_id)
);

-- إيرادات غير دفعات الطلاب (تبرعات، دعم، إيجار، …) تُجمع مع payments في الملخص المالي
create table if not exists public.revenues (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  title text not null,
  amount numeric(12, 2) not null check (amount > 0),
  revenue_date date not null default current_date,
  created_at timestamptz not null default now(),
  unique (id, school_id)
);

-- ------------------------------------------------------------
-- 5) الجداول — حضور
-- ------------------------------------------------------------

create table if not exists public.student_attendance (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  attendance_date date not null,
  status public.attendance_status not null,
  created_at timestamptz not null default now(),
  unique (school_id, student_id, attendance_date)
);

create table if not exists public.teacher_attendance (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  attendance_date date not null,
  status public.attendance_status not null,
  created_at timestamptz not null default now(),
  unique (school_id, teacher_id, attendance_date)
);

-- ------------------------------------------------------------
-- 6) قيود تكامل المستأجر (نفس المدرسة عبر المفتاح المركّب)
-- ------------------------------------------------------------

alter table public.students
  drop constraint if exists students_class_school_fk;
alter table public.students
  add constraint students_class_school_fk
  foreign key (class_id, school_id)
  references public.classes (id, school_id)
  on delete set null;

alter table public.installments
  drop constraint if exists installments_student_school_fk;
alter table public.installments
  add constraint installments_student_school_fk
  foreign key (student_id, school_id)
  references public.students (id, school_id)
  on delete cascade;

alter table public.payments
  drop constraint if exists payments_student_school_fk;
alter table public.payments
  add constraint payments_student_school_fk
  foreign key (student_id, school_id)
  references public.students (id, school_id)
  on delete cascade;

alter table public.payments
  drop constraint if exists payments_installment_school_fk;
alter table public.payments
  add constraint payments_installment_school_fk
  foreign key (installment_id, school_id)
  references public.installments (id, school_id)
  on delete set null;

alter table public.student_attendance
  drop constraint if exists student_attendance_student_school_fk;
alter table public.student_attendance
  add constraint student_attendance_student_school_fk
  foreign key (student_id, school_id)
  references public.students (id, school_id)
  on delete cascade;

alter table public.teacher_attendance
  drop constraint if exists teacher_attendance_teacher_school_fk;
alter table public.teacher_attendance
  add constraint teacher_attendance_teacher_school_fk
  foreign key (teacher_id, school_id)
  references public.teachers (id, school_id)
  on delete cascade;

alter table public.teacher_installments
  drop constraint if exists teacher_installments_teacher_school_fk;
alter table public.teacher_installments
  add constraint teacher_installments_teacher_school_fk
  foreign key (teacher_id, school_id)
  references public.teachers (id, school_id)
  on delete cascade;

alter table public.teacher_payments
  drop constraint if exists teacher_payments_teacher_school_fk;
alter table public.teacher_payments
  add constraint teacher_payments_teacher_school_fk
  foreign key (teacher_id, school_id)
  references public.teachers (id, school_id)
  on delete cascade;

alter table public.teacher_payments
  drop constraint if exists teacher_payments_installment_school_fk;
alter table public.teacher_payments
  add constraint teacher_payments_installment_school_fk
  foreign key (installment_id, school_id)
  references public.teacher_installments (id, school_id)
  on delete set null;

-- ------------------------------------------------------------
-- 7) فهارس
-- ------------------------------------------------------------

create index if not exists idx_users_school on public.users (school_id);
create index if not exists idx_users_email on public.users (email) where email is not null;

create index if not exists idx_classes_school on public.classes (school_id);

create index if not exists idx_students_school on public.students (school_id);
create index if not exists idx_students_class on public.students (class_id);
create index if not exists idx_students_status on public.students (school_id, status);

create index if not exists idx_teachers_school on public.teachers (school_id);

create index if not exists idx_installments_school_due on public.installments (school_id, due_date);
create index if not exists idx_installments_student on public.installments (student_id);
create index if not exists idx_installments_school_student on public.installments (school_id, student_id);

create index if not exists idx_payments_school_date on public.payments (school_id, paid_at desc);
create index if not exists idx_payments_student on public.payments (student_id);
create index if not exists idx_payments_installment on public.payments (installment_id) where installment_id is not null;

create index if not exists idx_teacher_installments_school_due on public.teacher_installments (school_id, due_date);
create index if not exists idx_teacher_installments_teacher on public.teacher_installments (teacher_id);
create index if not exists idx_teacher_installments_school_teacher on public.teacher_installments (school_id, teacher_id);
create index if not exists idx_teacher_payments_school_date on public.teacher_payments (school_id, paid_at desc);
create index if not exists idx_teacher_payments_teacher on public.teacher_payments (teacher_id);
create index if not exists idx_teacher_payments_installment on public.teacher_payments (installment_id) where installment_id is not null;

create index if not exists idx_st_att_school_date on public.student_attendance (school_id, attendance_date);
create index if not exists idx_tc_att_school_date on public.teacher_attendance (school_id, attendance_date);

create index if not exists idx_expenses_school_date on public.expenses (school_id, expense_date);
create index if not exists idx_revenues_school_date on public.revenues (school_id, revenue_date);

-- ------------------------------------------------------------
-- 8) دوال مساعدة لـ RLS (تقرأ من public.users)
-- ------------------------------------------------------------

create or replace function public.current_user_school_id()
returns uuid
language sql
stable
set search_path = public
as $$
  select u.school_id
  from public.users u
  where u.id = auth.uid()
  limit 1;
$$;

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
set search_path = public
as $$
  select u.role
  from public.users u
  where u.id = auth.uid()
  limit 1;
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(public.current_user_role() = 'owner', false);
$$;

-- ------------------------------------------------------------
-- 9) Row Level Security — تفعيل وسياسات
-- ------------------------------------------------------------

alter table public.schools enable row level security;
alter table public.users enable row level security;
alter table public.classes enable row level security;
alter table public.students enable row level security;
alter table public.teachers enable row level security;
alter table public.installments enable row level security;
alter table public.payments enable row level security;
alter table public.student_attendance enable row level security;
alter table public.teacher_attendance enable row level security;
alter table public.expenses enable row level security;
alter table public.revenues enable row level security;
alter table public.teacher_installments enable row level security;
alter table public.teacher_payments enable row level security;

-- schools
drop policy if exists schools_select_policy on public.schools;
create policy schools_select_policy on public.schools
  for select using (id = public.current_user_school_id());

drop policy if exists schools_insert_policy on public.schools;
create policy schools_insert_policy on public.schools
  for insert with check (auth.uid() is not null and owner_id = auth.uid());

drop policy if exists schools_update_owner_policy on public.schools;
create policy schools_update_owner_policy on public.schools
  for update using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- users
drop policy if exists users_select_policy on public.users;
create policy users_select_policy on public.users
  for select using (school_id = public.current_user_school_id());

drop policy if exists users_update_self_policy on public.users;
create policy users_update_self_policy on public.users
  for update using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists users_owner_insert_policy on public.users;
create policy users_owner_insert_policy on public.users
  for insert with check (
    public.is_owner() and school_id = public.current_user_school_id()
  );

drop policy if exists users_owner_update_policy on public.users;
create policy users_owner_update_policy on public.users
  for update using (
    public.is_owner() and school_id = public.current_user_school_id()
  )
  with check (
    public.is_owner() and school_id = public.current_user_school_id()
  );

-- tenant tables (نفس المدرسة)
drop policy if exists classes_all_tenant_policy on public.classes;
create policy classes_all_tenant_policy on public.classes
  for all using (school_id = public.current_user_school_id())
  with check (school_id = public.current_user_school_id());

drop policy if exists students_all_tenant_policy on public.students;
create policy students_all_tenant_policy on public.students
  for all using (school_id = public.current_user_school_id())
  with check (school_id = public.current_user_school_id());

drop policy if exists teachers_all_tenant_policy on public.teachers;
create policy teachers_all_tenant_policy on public.teachers
  for all using (school_id = public.current_user_school_id())
  with check (school_id = public.current_user_school_id());

drop policy if exists installments_all_tenant_policy on public.installments;
create policy installments_all_tenant_policy on public.installments
  for all using (school_id = public.current_user_school_id())
  with check (school_id = public.current_user_school_id());

drop policy if exists payments_all_tenant_policy on public.payments;
create policy payments_all_tenant_policy on public.payments
  for all using (school_id = public.current_user_school_id())
  with check (school_id = public.current_user_school_id());

drop policy if exists student_attendance_all_tenant_policy on public.student_attendance;
create policy student_attendance_all_tenant_policy on public.student_attendance
  for all using (school_id = public.current_user_school_id())
  with check (school_id = public.current_user_school_id());

drop policy if exists teacher_attendance_all_tenant_policy on public.teacher_attendance;
create policy teacher_attendance_all_tenant_policy on public.teacher_attendance
  for all using (school_id = public.current_user_school_id())
  with check (school_id = public.current_user_school_id());

drop policy if exists expenses_all_tenant_policy on public.expenses;
create policy expenses_all_tenant_policy on public.expenses
  for all using (school_id = public.current_user_school_id())
  with check (school_id = public.current_user_school_id());

drop policy if exists revenues_all_tenant_policy on public.revenues;
create policy revenues_all_tenant_policy on public.revenues
  for all using (school_id = public.current_user_school_id())
  with check (school_id = public.current_user_school_id());

drop policy if exists teacher_installments_all_tenant_policy on public.teacher_installments;
create policy teacher_installments_all_tenant_policy on public.teacher_installments
  for all using (school_id = public.current_user_school_id())
  with check (school_id = public.current_user_school_id());

drop policy if exists teacher_payments_all_tenant_policy on public.teacher_payments;
create policy teacher_payments_all_tenant_policy on public.teacher_payments
  for all using (school_id = public.current_user_school_id())
  with check (school_id = public.current_user_school_id());

-- ------------------------------------------------------------
-- 10) إجراءات مخزّنة (RPC) — إنشاء مدرسة + صف المالك
-- ------------------------------------------------------------

create or replace function public.create_school_for_owner(
  p_school_name text,
  p_plan public.subscription_type default 'trial'
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid;
  v_school_id uuid;
  v_email text;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if exists (select 1 from public.users u where u.id = v_user_id) then
    raise exception 'User row already exists for this user';
  end if;

  select au.email into v_email from auth.users au where au.id = v_user_id limit 1;

  insert into public.schools (name, owner_id, subscription_plan)
  values (p_school_name, v_user_id, p_plan)
  returning id into v_school_id;

  insert into public.users (id, email, full_name, role, school_id)
  values (v_user_id, v_email, null, 'owner', v_school_id);

  return v_school_id;
end;
$$;

revoke all on function public.create_school_for_owner(text, public.subscription_type) from public;
grant execute on function public.create_school_for_owner(text, public.subscription_type) to authenticated;

-- ------------------------------------------------------------
-- 11) مناظر (Views) — أقساط، متأخرون، ملخص مالي
-- ------------------------------------------------------------

create or replace view public.v_installment_status as
select
  i.id as installment_id,
  i.school_id,
  i.student_id,
  i.total_amount,
  i.due_date,
  coalesce(sum(p.amount), 0)::numeric(12, 2) as total_paid,
  (i.total_amount - coalesce(sum(p.amount), 0))::numeric(12, 2) as remaining,
  case
    when (i.total_amount - coalesce(sum(p.amount), 0)) <= 0 then 'paid_full'
    when coalesce(sum(p.amount), 0) > 0 and (i.total_amount - coalesce(sum(p.amount), 0)) > 0 then 'paid_partial'
    when coalesce(sum(p.amount), 0) = 0 and i.due_date < current_date then 'late'
    else 'unpaid'
  end as payment_status
from public.installments i
left join public.payments p
  on p.installment_id = i.id
 and p.school_id = i.school_id
group by i.id, i.school_id, i.student_id, i.total_amount, i.due_date;

-- يُستخدم من التطبيق (صفحة أقساط الطلاب): من سدّد قسطه والمتبقي عبر الدفعات المرتبطة بـ installment_id

create or replace view public.v_teacher_installment_status as
select
  ti.id as installment_id,
  ti.school_id,
  ti.teacher_id,
  ti.total_amount,
  ti.due_date,
  coalesce(sum(tp.amount), 0)::numeric(12, 2) as total_paid,
  (ti.total_amount - coalesce(sum(tp.amount), 0))::numeric(12, 2) as remaining,
  case
    when (ti.total_amount - coalesce(sum(tp.amount), 0)) <= 0 then 'paid_full'
    when coalesce(sum(tp.amount), 0) > 0 and (ti.total_amount - coalesce(sum(tp.amount), 0)) > 0 then 'paid_partial'
    when coalesce(sum(tp.amount), 0) = 0 and ti.due_date < current_date then 'late'
    else 'unpaid'
  end as payment_status
from public.teacher_installments ti
left join public.teacher_payments tp
  on tp.installment_id = ti.id
 and tp.school_id = ti.school_id
group by ti.id, ti.school_id, ti.teacher_id, ti.total_amount, ti.due_date;

create or replace view public.v_late_students as
select
  s.id as student_id,
  s.school_id,
  s.full_name,
  c.name as class_name,
  vis.installment_id,
  vis.due_date,
  vis.total_amount,
  vis.total_paid,
  vis.remaining
from public.v_installment_status vis
join public.students s
  on s.id = vis.student_id and s.school_id = vis.school_id
left join public.classes c
  on c.id = s.class_id and c.school_id = s.school_id
where vis.payment_status = 'late'
  and s.status = 'active';

-- total_income = دفعات الطلاب (payments) + إيرادات إضافية (revenues)
-- total_expenses = مصروفات (expenses) + دفعات رواتب المعلمين (teacher_payments)
-- net_profit = total_income - total_expenses
create or replace view public.v_financial_summary as
select
  s.id as school_id,
  (
    coalesce((select sum(p.amount) from public.payments p where p.school_id = s.id), 0)
    + coalesce((select sum(r.amount) from public.revenues r where r.school_id = s.id), 0)
  )::numeric(12, 2) as total_income,
  (
    coalesce((select sum(e.amount) from public.expenses e where e.school_id = s.id), 0)
    + coalesce((select sum(tp.amount) from public.teacher_payments tp where tp.school_id = s.id), 0)
  )::numeric(12, 2) as total_expenses,
  (
    coalesce((select sum(p.amount) from public.payments p where p.school_id = s.id), 0)
    + coalesce((select sum(r.amount) from public.revenues r where r.school_id = s.id), 0)
    - coalesce((select sum(e.amount) from public.expenses e where e.school_id = s.id), 0)
    - coalesce((select sum(tp.amount) from public.teacher_payments tp where tp.school_id = s.id), 0)
  )::numeric(12, 2) as net_profit
from public.schools s;

-- ------------------------------------------------------------
-- 12) ملاحظات ترقية (قواعد موجودة مسبقاً)
-- ------------------------------------------------------------
-- • إن وُجد عمود updated_at لأول مرة على schools، أضفه يدوياً أو عطّل السطور أعلاه إن لم تُستخدم.
-- • مناظر PostgREST: فعّل تعريف المنظر في لوحة Supabase (API) إن لزم؛ v_installment_status و v_teacher_installment_status يُقرآن من الواجهة.
-- • قواعد قديمة بلا teacher_installments/teacher_payments: نفّذ أقسام الجداول/القيود/الفهارس/RLS/المناظر أعلاه ثم أعد إنشاء v_financial_summary.
-- • لا تُشغّل السكربت كاملاً على قاعدة فيها بيانات إن كان تعريف الجداول يختلف؛ استخدم مقارنة يدوية أو أدوات migration.
