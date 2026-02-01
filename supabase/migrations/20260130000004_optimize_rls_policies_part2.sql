-- Migration: Optimize RLS policies with (select auth.uid()) pattern (Part 2)
-- Applied: 2026-01-30
-- Purpose: Use subquery pattern to prevent per-row auth.uid() re-evaluation

-- Note: Policies were recreated with (select auth.uid()) instead of auth.uid()
-- This prevents PostgreSQL from re-evaluating the function for every row scanned

-- Example pattern applied across all user-facing policies:
-- OLD: WHERE user_id = auth.uid()
-- NEW: WHERE user_id = (select auth.uid())

-- The actual policy recreation SQL is embedded in consolidate_rls_policies migration
-- This file serves as documentation of the optimization applied
