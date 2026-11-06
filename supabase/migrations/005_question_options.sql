-- Migration 005: Option identity, not position
-- Run this in Supabase SQL Editor. Safe to re-run.

-- New table: question_options. Each option has a permanent UUID.
-- "Correct" is is_correct on the option row, never a letter/position.
create table if not exists question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions(id) on delete cascade,
  option_text text not null,
  is_correct boolean not null default false,
  sort_order smallint not null default 0,
  pin_last boolean not null default false,
  created_at timestamptz default now()
);

create index if not exists idx_question_options_question_id on question_options(question_id);

-- Partial unique index: exactly one correct option per question.
create unique index if not exists uni_question_options_one_correct
  on question_options(question_id) where is_correct;

-- Ensure submit_type check constraint allows all four values.
do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  where rel.relname = 'test_sessions'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) like '%submit_type%';

  if constraint_name is not null then
    execute format('alter table test_sessions drop constraint %I', constraint_name);
  end if;

  alter table test_sessions
    add constraint test_sessions_submit_type_check
    check (submit_type in ('manual', 'auto_timeout', 'admin_forced', 'abandoned'));
end $$;

-- Ensure test_results has all required columns (add if not exists).
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name='test_results' and column_name='submit_type'
  ) then
    alter table test_results add column submit_type text not null default 'manual';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_name='test_results' and column_name='paused_seconds'
  ) then
    alter table test_results add column paused_seconds int;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_name='test_results' and column_name='disconnect_count'
  ) then
    alter table test_results add column disconnect_count int;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_name='test_results' and column_name='graded_at'
  ) then
    alter table test_results add column graded_at timestamptz default now();
  end if;
end $$;

-- Enable RLS on question_options (no public policies — server-only access).
alter table question_options enable row level security;
