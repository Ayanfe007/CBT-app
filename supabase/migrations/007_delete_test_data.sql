-- Migration 007: Delete all test data (test_results then test_sessions)
-- Run this ONLY if you want to clear all existing sessions and results.
-- All current data is considered test data. Run this yourself.
-- WARNING: This permanently deletes all test_results and test_sessions rows.

delete from test_results;
delete from test_sessions;
