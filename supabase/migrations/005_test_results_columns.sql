-- Migration 005: Ensure test_results has all required columns and submit_type check allows all values.
-- Idempotent: safe to re-run. Run BEFORE deploying the updated app.

-- Ensure submit_type check constraint on test_sessions allows all four values.
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

-- Ensure test_results has all required columns.
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
