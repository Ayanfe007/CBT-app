-- Migration 006: Delete all test data (test_results first, then test_sessions).
-- All current data is test data produced by the broken shuffle logic.
-- Run this yourself ONLY after you confirm you want to clear all sessions/results.
-- Do NOT try to regrade existing data.

delete from test_results;
delete from test_sessions;
