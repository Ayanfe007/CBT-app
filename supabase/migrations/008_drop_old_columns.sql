-- Migration 008: Drop old letter-based columns from questions
-- Run this ONLY AFTER you confirm migration 006 data is correct.
-- Safe to re-run (uses if-exists checks).

alter table questions drop column if exists option_a;
alter table questions drop column if exists option_b;
alter table questions drop column if exists option_c;
alter table questions drop column if exists option_d;
alter table questions drop column if exists correct_option;
