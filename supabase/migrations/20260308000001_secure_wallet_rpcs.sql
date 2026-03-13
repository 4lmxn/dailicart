-- Migration: Secure wallet RPC functions against direct client-side abuse
-- Applied: 2026-03-08
-- Fixes:
--   1. Revoke EXECUTE on credit_wallet from authenticated/anon (only service_role can call it)
--   2. Add auth.uid() ownership check to debit_wallet
--   3. Add p_amount > 0 validation to both credit_wallet and debit_wallet
--   4. Pin search_path on all wallet functions to prevent search_path injection
--   5. Add auth.uid() check to get_wallet_balance so users can only query their own balance

-- =============================================================================
-- 1. Recreate credit_wallet with SECURITY DEFINER, search_path, and amount check
-- =============================================================================

CREATE OR REPLACE FUNCTION credit_wallet(
    p_user_id UUID,
    p_amount NUMERIC,
    p_reference_type TEXT,
    p_reference_id UUID,
    p_idempotency_key TEXT,
    p_description TEXT,
    p_created_by UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_customer_id UUID;
    v_current_balance NUMERIC;
    v_current_version INT;
    v_new_balance NUMERIC;
    v_ledger_id UUID;
    v_is_locked BOOLEAN;
    v_rate_allowed BOOLEAN;
BEGIN
    -- Validate amount is positive
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'Amount must be a positive number, got: %', p_amount;
    END IF;

    -- Check idempotency first
    SELECT id INTO v_ledger_id FROM wallet_ledger WHERE idempotency_key = p_idempotency_key;
    IF v_ledger_id IS NOT NULL THEN
        RETURN v_ledger_id;
    END IF;
    
    -- Check rate limit (10 credits per minute per user)
    SELECT check_rate_limit(p_user_id::TEXT, 'wallet_credit', 10, 60) INTO v_rate_allowed;
    IF NOT v_rate_allowed THEN
        RAISE EXCEPTION 'Rate limit exceeded. Please try again later.';
    END IF;
    
    -- Lock the customer row for update
    SELECT id, wallet_balance, wallet_version, is_wallet_locked 
    INTO v_customer_id, v_current_balance, v_current_version, v_is_locked
    FROM customers
    WHERE user_id = p_user_id
    FOR UPDATE;
    
    IF v_customer_id IS NULL THEN
        RAISE EXCEPTION 'Customer not found for user %', p_user_id;
    END IF;
    
    IF v_is_locked THEN
        RAISE EXCEPTION 'Wallet is locked for user %', p_user_id;
    END IF;
    
    v_new_balance := v_current_balance + p_amount;
    
    -- Insert ledger entry
    INSERT INTO wallet_ledger (
        user_id, entry_type, amount, balance_before, balance_after,
        reference_type, reference_id, idempotency_key, description, created_by
    ) VALUES (
        p_user_id, 'credit', p_amount, v_current_balance, v_new_balance,
        p_reference_type, p_reference_id, p_idempotency_key, p_description, p_created_by
    ) RETURNING id INTO v_ledger_id;
    
    -- Update balance with version check
    UPDATE customers 
    SET wallet_balance = v_new_balance,
        wallet_version = wallet_version + 1,
        updated_at = now()
    WHERE id = v_customer_id AND wallet_version = v_current_version;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Concurrent wallet update detected, please retry';
    END IF;
    
    RETURN v_ledger_id;
END;
$$;

-- Revoke ALL access, then grant only to service_role (Edge Functions)
REVOKE EXECUTE ON FUNCTION credit_wallet(UUID, NUMERIC, TEXT, UUID, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION credit_wallet(UUID, NUMERIC, TEXT, UUID, TEXT, TEXT, UUID) TO service_role;

-- =============================================================================
-- 2. Recreate debit_wallet with ownership check, amount validation, search_path
-- =============================================================================

CREATE OR REPLACE FUNCTION debit_wallet(
    p_user_id UUID,
    p_amount NUMERIC,
    p_reference_type TEXT,
    p_reference_id UUID,
    p_idempotency_key TEXT,
    p_description TEXT,
    p_created_by UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_customer_id UUID;
    v_current_balance NUMERIC;
    v_current_version INT;
    v_new_balance NUMERIC;
    v_ledger_id UUID;
    v_is_locked BOOLEAN;
    v_rate_allowed BOOLEAN;
    v_caller_role TEXT;
BEGIN
    -- Validate amount is positive
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'Amount must be a positive number, got: %', p_amount;
    END IF;

    -- Authorization: only the wallet owner or service_role can debit
    v_caller_role := current_setting('request.jwt.claim.role', true);
    IF v_caller_role IS DISTINCT FROM 'service_role' THEN
        -- Called by an end-user: ensure they can only debit their own wallet
        IF auth.uid() IS NULL THEN
            RAISE EXCEPTION 'Authentication required';
        END IF;
        IF auth.uid() != p_user_id THEN
            RAISE EXCEPTION 'Not authorized to debit another user''s wallet';
        END IF;
    END IF;

    -- Check idempotency first
    SELECT id INTO v_ledger_id FROM wallet_ledger WHERE idempotency_key = p_idempotency_key;
    IF v_ledger_id IS NOT NULL THEN
        RETURN v_ledger_id;
    END IF;
    
    -- Check rate limit (15 debits per minute per user)
    SELECT check_rate_limit(p_user_id::TEXT, 'wallet_debit', 15, 60) INTO v_rate_allowed;
    IF NOT v_rate_allowed THEN
        RAISE EXCEPTION 'Rate limit exceeded. Please try again later.';
    END IF;
    
    -- Lock the customer row
    SELECT id, wallet_balance, wallet_version, is_wallet_locked 
    INTO v_customer_id, v_current_balance, v_current_version, v_is_locked
    FROM customers
    WHERE user_id = p_user_id
    FOR UPDATE;
    
    IF v_customer_id IS NULL THEN
        RAISE EXCEPTION 'Customer not found for user %', p_user_id;
    END IF;
    
    IF v_is_locked THEN
        RAISE EXCEPTION 'Wallet is locked for user %', p_user_id;
    END IF;
    
    v_new_balance := v_current_balance - p_amount;
    
    IF v_new_balance < 0 THEN
        RAISE EXCEPTION 'Insufficient wallet balance. Available: ₹%, Required: ₹%', v_current_balance, p_amount;
    END IF;
    
    -- Insert ledger entry
    INSERT INTO wallet_ledger (
        user_id, entry_type, amount, balance_before, balance_after,
        reference_type, reference_id, idempotency_key, description, created_by
    ) VALUES (
        p_user_id, 'debit', p_amount, v_current_balance, v_new_balance,
        p_reference_type, p_reference_id, p_idempotency_key, p_description, p_created_by
    ) RETURNING id INTO v_ledger_id;
    
    -- Update balance with version check
    UPDATE customers 
    SET wallet_balance = v_new_balance,
        wallet_version = wallet_version + 1,
        lifetime_spent = lifetime_spent + p_amount,
        updated_at = now()
    WHERE id = v_customer_id AND wallet_version = v_current_version;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Concurrent wallet update detected, please retry';
    END IF;
    
    RETURN v_ledger_id;
END;
$$;

-- Restrict to authenticated + service_role only (function enforces auth.uid() ownership)
REVOKE EXECUTE ON FUNCTION debit_wallet(UUID, NUMERIC, TEXT, UUID, TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION debit_wallet(UUID, NUMERIC, TEXT, UUID, TEXT, TEXT, UUID) TO authenticated, service_role;

-- =============================================================================
-- 3. Recreate get_wallet_balance with ownership check and search_path
-- =============================================================================

CREATE OR REPLACE FUNCTION get_wallet_balance(p_user_id UUID)
RETURNS TABLE(
    available_balance NUMERIC,
    held_amount NUMERIC,
    total_balance NUMERIC,
    is_locked BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Authorization: users can only query their own balance (service_role can query any)
    IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
        IF auth.uid() IS NULL THEN
            RAISE EXCEPTION 'Authentication required';
        END IF;
        IF auth.uid() != p_user_id THEN
            RAISE EXCEPTION 'Not authorized to view another user''s wallet balance';
        END IF;
    END IF;

    RETURN QUERY
    SELECT 
        c.wallet_balance AS available_balance,
        COALESCE((
            SELECT SUM(h.amount) 
            FROM wallet_holds h 
            WHERE h.user_id = p_user_id AND h.status = 'active'
        ), 0) AS held_amount,
        c.wallet_balance + COALESCE((
            SELECT SUM(h.amount) 
            FROM wallet_holds h 
            WHERE h.user_id = p_user_id AND h.status = 'active'
        ), 0) AS total_balance,
        c.is_wallet_locked AS is_locked
    FROM customers c
    WHERE c.user_id = p_user_id;
END;
$$;

-- Restrict to authenticated + service_role only (function enforces auth.uid() ownership)
REVOKE EXECUTE ON FUNCTION get_wallet_balance(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_wallet_balance(UUID) TO authenticated, service_role;

-- =============================================================================
-- Verification
-- =============================================================================

DO $$ BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════════';
    RAISE NOTICE '✅ WALLET SECURITY HARDENING APPLIED';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════════';
    RAISE NOTICE '';
    RAISE NOTICE '🔒 credit_wallet:';
    RAISE NOTICE '   • SECURITY DEFINER + SET search_path = public';
    RAISE NOTICE '   • EXECUTE revoked from anon & authenticated roles';
    RAISE NOTICE '   • Only callable via service_role (Edge Functions)';
    RAISE NOTICE '   • Amount must be > 0 (rejects negative/zero)';
    RAISE NOTICE '';
    RAISE NOTICE '🔒 debit_wallet:';
    RAISE NOTICE '   • SECURITY DEFINER + SET search_path = public';
    RAISE NOTICE '   • auth.uid() must match p_user_id (or service_role)';
    RAISE NOTICE '   • Amount must be > 0 (rejects negative/zero)';
    RAISE NOTICE '';
    RAISE NOTICE '🔒 get_wallet_balance:';
    RAISE NOTICE '   • SECURITY DEFINER + SET search_path = public';
    RAISE NOTICE '   • auth.uid() must match p_user_id (or service_role)';
    RAISE NOTICE '';
    RAISE NOTICE '⚠️  If you have other functions that call credit_wallet,';
    RAISE NOTICE '   ensure they run as service_role or grant EXECUTE explicitly.';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════════';
END $$;
