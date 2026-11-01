-- Migration 002: idempotent column additions for offline/pause support
-- Run this in Supabase SQL Editor. Safe to re-run.

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

-- test_sessions.last_heartbeat_at
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name='test_sessions' and column_name='last_heartbeat_at'
  ) then
    alter table test_sessions add column last_heartbeat_at timestamptz;
  end if;
end $$;

-- test_sessions.paused_seconds
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name='test_sessions' and column_name='paused_seconds'
  ) then
    alter table test_sessions add column paused_seconds int not null default 0;
  end if;
end $$;

-- test_sessions.disconnect_count
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name='test_sessions' and column_name='disconnect_count'
  ) then
    alter table test_sessions add column disconnect_count int not null default 0;
  end if;
end $$;

-- test_sessions.last_client_seq
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name='test_sessions' and column_name='last_client_seq'
  ) then
    alter table test_sessions add column last_client_seq int not null default 0;
  end if;
end $$;

-- test_results.paused_seconds
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name='test_results' and column_name='paused_seconds'
  ) then
    alter table test_results add column paused_seconds int;
  end if;
end $$;

-- test_results.disconnect_count
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name='test_results' and column_name='disconnect_count'
  ) then
    alter table test_results add column disconnect_count int;
  end if;
end $$;
