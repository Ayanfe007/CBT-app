-- Migration 004: allow 'abandoned' in test_sessions.submit_type check constraint
-- Safe to re-run.
do $$
declare
  constraint_name text;
begin
  -- Find existing check constraint on submit_type
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
