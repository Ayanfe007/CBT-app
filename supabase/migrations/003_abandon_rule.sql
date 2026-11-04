-- Migration 003: abandon-after-inactivity rule
-- Run this in Supabase SQL Editor. Safe to re-run.

-- courses.abandon_after_minutes (default 60, 0 disables)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name='courses' and column_name='abandon_after_minutes'
  ) then
    alter table courses add column abandon_after_minutes int not null default 60;
  end if;
end $$;
