-- ============================================================================
-- Computer-Based Testing (CBT) — Supabase PostgreSQL schema
-- Paste the whole file into the Supabase SQL Editor and run it.
-- Dialect: PostgreSQL (NOT MySQL)
-- ============================================================================

-- gen_random_uuid() comes from pgcrypto
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- students: admin-created only. PINs are stored bcrypt-hashed.
-- ----------------------------------------------------------------------------
create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  login_id text unique not null,
  pin_hash text not null,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- courses: each course has its own questions, timer, and settings.
-- ----------------------------------------------------------------------------
create table if not exists courses (
  id uuid primary key default gen_random_uuid(),
  course_code text unique not null,
  title text,
  duration_minutes int not null default 30,
  questions_per_test int, -- null = use all questions
  pass_mark_percent int default 50,
  max_attempts int default 1,
  is_active boolean default true,
  show_result_to_student boolean default true,
  show_review_to_student boolean default true,
  max_pause_minutes int not null default 20,
  abandon_after_minutes int not null default 60,
  created_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- questions: four options A-D, exactly one correct (stored as letter).
-- ----------------------------------------------------------------------------
create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  question_text text not null,
  option_a text not null,
  option_b text not null,
  option_c text not null,
  option_d text not null,
  correct_option char(1) not null check (correct_option in ('A', 'B', 'C', 'D')),
  created_at timestamptz default now()
);

create index if not exists idx_questions_course_id on questions(course_id);

-- ----------------------------------------------------------------------------
-- course_assignments: which student may take which course.
-- ----------------------------------------------------------------------------
create table if not exists course_assignments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  attempts_override int,
  unique(student_id, course_id)
);

-- ----------------------------------------------------------------------------
-- test_sessions: one row per attempt. Shuffled question order is stored here
-- so refresh/reconnect restores the exact same test. option_orders is kept
-- for schema compatibility but is unused (options always display A-D).
-- ----------------------------------------------------------------------------
create table if not exists test_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  question_order jsonb not null default '[]'::jsonb,
  option_orders jsonb not null default '{}'::jsonb,
  answers jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  ends_at timestamptz,
  submitted_at timestamptz,
  submit_type text check (submit_type in ('manual', 'auto_timeout', 'admin_forced', 'abandoned')),
  tab_switch_count int default 0,
  last_heartbeat_at timestamptz,
  paused_seconds int not null default 0,
  disconnect_count int not null default 0,
  last_client_seq int not null default 0,
  created_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- test_results: one row per session (session_id unique). Graded server-side.
-- ----------------------------------------------------------------------------
create table if not exists test_results (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references test_sessions(id) on delete cascade unique,
  student_id uuid not null references students(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  score int not null,
  total_questions int not null,
  percentage numeric(5,2) not null,
  passed boolean not null,
  time_taken_seconds int not null,
  submit_type text not null,
  paused_seconds int,
  disconnect_count int,
  graded_at timestamptz default now()
);

-- ============================================================================
-- Row Level Security: enabled on ALL tables with NO public policies.
-- All access goes through server-side Next.js API routes using the
-- service-role key. The browser never talks to Supabase directly.
-- ============================================================================
alter table students enable row level security;
alter table courses enable row level security;
alter table questions enable row level security;
alter table course_assignments enable row level security;
alter table test_sessions enable row level security;
alter table test_results enable row level security;

-- ============================================================================
-- OPTIONAL: pg_cron job — auto-finalize expired sessions every minute.
-- ============================================================================
-- create extension if not exists pg_cron;
--
-- select cron.schedule(
--   'cbt-finalize-expired-sessions',
--   '* * * * *',
--   $$
--   select http_post(
--     'https://YOUR_VERCEL_URL.vercel.app/api/cron/finalize',
--     json_build_object('secret', '<YOUR_CRON_SECRET>')
--   );
--   $$
-- );
