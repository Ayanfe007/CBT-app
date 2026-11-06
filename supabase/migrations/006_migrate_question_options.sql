-- Migration 006: Migrate existing questions to question_options
-- Run this in Supabase SQL Editor AFTER migration 005.
-- Safe to re-run.

-- Create question_options rows from old option_a..option_d columns.
-- is_correct is set where the old correct_option letter matches.
do $$
declare
  q record;
  opt_letter text;
  opt_text text;
  opt_sort smallint;
begin
  for q in
    select id, option_a, option_b, option_c, option_d, correct_option
    from questions
  loop
    opt_sort := 1;
    for opt_letter, opt_text in
      values ('A', q.option_a), ('B', q.option_b), ('C', q.option_c), ('D', q.option_d)
    loop
      insert into question_options (question_id, option_text, is_correct, sort_order)
      values (q.id, opt_text, (q.correct_option = opt_letter), opt_sort)
      on conflict do nothing;
      opt_sort := opt_sort + 1;
    end loop;
  end loop;
end $$;

-- Report any question that does not have exactly 4 options and exactly 1 correct option.
select
  q.id as question_id,
  q.question_text,
  count(qo.id) as option_count,
  count(qo.id) filter (where qo.is_correct) as correct_count
from questions q
left join question_options qo on qo.question_id = q.id
group by q.id, q.question_text
having count(qo.id) <> 4
   or count(qo.id) filter (where qo.is_correct) <> 1
order by q.id;
