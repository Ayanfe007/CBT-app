-- Migration 001: pause-when-offline support
-- Run this on existing projects created with the original schema.sql.
-- Safe to re-run (uses IF NOT EXISTS / IF NOT EXISTS column pattern where
-- supported; Postgres lacks ADD COLUMN IF NOT EXISTS in older versions, so
-- we guard via DO blocks).

-- courses.max_pause_minutes
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name='courses' and column_name='max_pause_minutes'
  ) then
    alter table courses add column max_pause_minutes int not null default 20;
  end if;
end $$;

-- test_sessions columns
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name='test_sessions' and column_name='last_heartbeat_at'
  ) then
    alter table test_sessions add column last_heartbeat_at timestamptz;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name='test_sessions' and column_name='paused_seconds'
  ) then
    alter table test_sessions add column paused_seconds int not null default 0;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name='test_sessions' and column_name='disconnect_count'
  ) then
    alter table test_sessions add column disconnect_count int not null default 0;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name='test_sessions' and column_name='last_client_seq'
  ) then
    alter table test_sessions add column last_client_seq int not null default 0;
  end if;
end $$;

-- test_results columns
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name='test_results' and column_name='paused_seconds'
  ) then
    alter table test_results add column paused_seconds int;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name='test_results' and column_name='disconnect_count'
  ) then
    alter table test_results add column disconnect_count int;
  end if;
end $$;
