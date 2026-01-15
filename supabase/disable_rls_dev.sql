-- =============================================================
-- DEVELOPMENT ONLY: Disable RLS + Grant Full Access
-- ⚠️  DO NOT USE IN PRODUCTION
-- =============================================================
-- Purpose: Remove Row Level Security friction during development
-- Run this after schema.sql to disable RLS on all tables
-- =============================================================
-- How to run:
--   Supabase Dashboard -> SQL Editor -> paste & run
--   OR: psql $DATABASE_URL -f disable_rls_dev.sql
-- =============================================================

-- =============================================================
-- STEP 1: Grant permissions to all roles
-- =============================================================
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;

-- Grant full access on ALL existing tables
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon;

-- Grant access to sequences (for auto-increment IDs)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;

-- Grant execute on functions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO postgres, anon, authenticated, service_role;

-- Future tables (default privileges)
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO postgres, anon, authenticated, service_role;

-- =============================================================
-- STEP 2: Disable RLS on all public tables
-- =============================================================
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', r.tablename);
        RAISE NOTICE 'Disabled RLS on: %', r.tablename;
    END LOOP;
END $$;

-- Also drop all existing policies (optional - uncomment if needed)
-- DO $$
-- DECLARE
--     r RECORD;
-- BEGIN
--     FOR r IN 
--         SELECT schemaname, tablename, policyname 
--         FROM pg_policies 
--         WHERE schemaname = 'public'
--     LOOP
--         EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
--         RAISE NOTICE 'Dropped policy: % on %', r.policyname, r.tablename;
--     END LOOP;
-- END $$;

-- =============================================================
-- Verification: Check RLS status on all tables
-- =============================================================
SELECT 
    c.relname AS table_name,
    CASE WHEN c.relrowsecurity THEN '🔒 ENABLED' ELSE '🔓 DISABLED' END AS rls_status
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY c.relname;

-- =============================================================
-- ✅ RLS DISABLED FOR DEVELOPMENT
-- =============================================================
-- To re-enable RLS later, run:
--   ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;
-- And recreate your policies from rls_policies_location.sql
-- =============================================================
