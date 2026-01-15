-- Migration: Comprehensive Idempotency and Security Fixes
-- This migration adds proper idempotency protection for all financial operations
-- and fixes potential race conditions and data integrity issues.
-- 
-- Run this AFTER reviewing your current database state.
-- Safe to run multiple times (uses IF NOT EXISTS / CREATE OR REPLACE)

-- =============================================================================
-- 1. IDEMPOTENCY KEYS TABLE (for tracking all idempotent operations)
-- =============================================================================

CREATE TABLE IF NOT EXISTS idempotency_keys (
    key TEXT PRIMARY KEY,
    operation_type TEXT NOT NULL, -- 'debit_wallet', 'credit_wallet', 'delivery', 'payment', 'skip_order'
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    result JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires ON idempotency_keys(expires_at);
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_user ON idempotency_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_operation ON idempotency_keys(operation_type);

COMMENT ON TABLE idempotency_keys IS 'Tracks idempotent operations to prevent duplicates (24hr expiry)';

-- =============================================================================
-- 2. DROP EXISTING WALLET FUNCTIONS (to avoid signature conflicts)
-- =============================================================================

-- Use DO block to drop ALL overloads of these functions dynamically
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Drop all debit_wallet functions
    FOR r IN 
        SELECT oid::regprocedure::text AS func_sig
        FROM pg_proc
        WHERE proname = 'debit_wallet'
        AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_sig || ' CASCADE';
    END LOOP;
    
    -- Drop all credit_wallet functions
    FOR r IN 
        SELECT oid::regprocedure::text AS func_sig
        FROM pg_proc
        WHERE proname = 'credit_wallet'
        AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_sig || ' CASCADE';
    END LOOP;
    
    -- Drop all mark_order_delivered functions
    FOR r IN 
        SELECT oid::regprocedure::text AS func_sig
        FROM pg_proc
        WHERE proname = 'mark_order_delivered'
        AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_sig || ' CASCADE';
    END LOOP;
    
    -- Drop all skip_order functions
    FOR r IN 
        SELECT oid::regprocedure::text AS func_sig
        FROM pg_proc
        WHERE proname = 'skip_order'
        AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_sig || ' CASCADE';
    END LOOP;
    
    -- Drop all auto_pause_low_balance_subscriptions functions
    FOR r IN 
        SELECT oid::regprocedure::text AS func_sig
        FROM pg_proc
        WHERE proname = 'auto_pause_low_balance_subscriptions'
        AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_sig || ' CASCADE';
    END LOOP;
    
    -- Drop all daily_maintenance functions
    FOR r IN 
        SELECT oid::regprocedure::text AS func_sig
        FROM pg_proc
        WHERE proname = 'daily_maintenance'
        AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_sig || ' CASCADE';
    END LOOP;
    
    -- Drop all cleanup_idempotency_keys functions
    FOR r IN 
        SELECT oid::regprocedure::text AS func_sig
        FROM pg_proc
        WHERE proname = 'cleanup_idempotency_keys'
        AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_sig || ' CASCADE';
    END LOOP;
END $$;

-- =============================================================================
-- 3. CLEANUP FUNCTION FOR EXPIRED KEYS
-- =============================================================================

CREATE OR REPLACE FUNCTION cleanup_idempotency_keys()
RETURNS INT AS $$
DECLARE
    v_count INT;
BEGIN
    DELETE FROM idempotency_keys WHERE expires_at < now();
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 3. ATOMIC DEBIT_WALLET FUNCTION WITH FULL IDEMPOTENCY
-- =============================================================================

CREATE OR REPLACE FUNCTION debit_wallet(
    p_user_id UUID,
    p_amount NUMERIC,
    p_reference_type TEXT,
    p_reference_id UUID,
    p_idempotency_key TEXT,
    p_description TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_customer_id UUID;
    v_current_balance NUMERIC;
    v_new_balance NUMERIC;
    v_ledger_id UUID;
    v_existing RECORD;
    v_result JSONB;
BEGIN
    -- 1. Check for existing idempotency key
    SELECT * INTO v_existing FROM idempotency_keys WHERE key = p_idempotency_key;
    
    IF FOUND THEN
        -- Already processed - return cached result
        IF v_existing.result IS NOT NULL THEN
            RETURN v_existing.result;
        END IF;
        -- In progress by another request
        RAISE EXCEPTION 'IDEMPOTENCY_IN_PROGRESS: Operation already in progress';
    END IF;
    
    -- 2. Also check wallet_ledger for this idempotency key (double safety)
    IF EXISTS (SELECT 1 FROM wallet_ledger WHERE idempotency_key = p_idempotency_key) THEN
        SELECT jsonb_build_object(
            'success', true,
            'message', 'Already processed',
            'ledger_id', id,
            'balance_after', balance_after
        ) INTO v_result
        FROM wallet_ledger WHERE idempotency_key = p_idempotency_key;
        RETURN v_result;
    END IF;
    
    -- 3. Claim this operation by inserting idempotency key
    BEGIN
        INSERT INTO idempotency_keys (key, operation_type, user_id)
        VALUES (p_idempotency_key, 'debit_wallet', p_user_id);
    EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION 'DUPLICATE_REQUEST: This operation was already submitted';
    END;
    
    -- 4. Validate amount
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT: Amount must be positive, got %', p_amount;
    END IF;

    -- 5. Get customer with row lock (prevents concurrent modifications)
    SELECT id, wallet_balance INTO v_customer_id, v_current_balance
    FROM customers
    WHERE user_id = p_user_id
    FOR UPDATE NOWAIT; -- Fail immediately if locked by another transaction

    IF NOT FOUND THEN
        RAISE EXCEPTION 'CUSTOMER_NOT_FOUND: No customer record for user %', p_user_id;
    END IF;

    -- 6. Check sufficient balance
    IF v_current_balance < p_amount THEN
        RAISE EXCEPTION 'INSUFFICIENT_BALANCE: Required %, available %', p_amount, v_current_balance;
    END IF;

    -- 7. Calculate and update balance
    v_new_balance := v_current_balance - p_amount;

    UPDATE customers
    SET wallet_balance = v_new_balance,
        wallet_version = wallet_version + 1,
        lifetime_spent = lifetime_spent + p_amount,
        updated_at = now()
    WHERE id = v_customer_id;

    -- 8. Create ledger entry (immutable audit trail)
    INSERT INTO wallet_ledger (
        user_id,
        entry_type,
        amount,
        balance_before,
        balance_after,
        reference_type,
        reference_id,
        idempotency_key,
        description
    ) VALUES (
        p_user_id,
        'debit',
        p_amount,
        v_current_balance,
        v_new_balance,
        p_reference_type,
        p_reference_id,
        p_idempotency_key,
        COALESCE(p_description, 'Wallet debit for ' || p_reference_type)
    ) RETURNING id INTO v_ledger_id;

    -- 9. Build and cache result
    v_result := jsonb_build_object(
        'success', true,
        'ledger_id', v_ledger_id,
        'amount_debited', p_amount,
        'balance_before', v_current_balance,
        'balance_after', v_new_balance
    );
    
    UPDATE idempotency_keys SET result = v_result WHERE key = p_idempotency_key;

    RETURN v_result;
    
EXCEPTION WHEN lock_not_available THEN
    RAISE EXCEPTION 'CONCURRENT_UPDATE: Account is being modified by another transaction';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 4. ATOMIC CREDIT_WALLET FUNCTION WITH FULL IDEMPOTENCY
-- =============================================================================

CREATE OR REPLACE FUNCTION credit_wallet(
    p_user_id UUID,
    p_amount NUMERIC,
    p_reference_type TEXT,
    p_reference_id UUID,
    p_idempotency_key TEXT,
    p_description TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_customer_id UUID;
    v_current_balance NUMERIC;
    v_new_balance NUMERIC;
    v_ledger_id UUID;
    v_existing RECORD;
    v_result JSONB;
BEGIN
    -- 1. Check for existing idempotency key
    SELECT * INTO v_existing FROM idempotency_keys WHERE key = p_idempotency_key;
    
    IF FOUND THEN
        IF v_existing.result IS NOT NULL THEN
            RETURN v_existing.result;
        END IF;
        RAISE EXCEPTION 'IDEMPOTENCY_IN_PROGRESS: Operation already in progress';
    END IF;
    
    -- 2. Check wallet_ledger for this idempotency key
    IF EXISTS (SELECT 1 FROM wallet_ledger WHERE idempotency_key = p_idempotency_key) THEN
        SELECT jsonb_build_object(
            'success', true,
            'message', 'Already processed',
            'ledger_id', id,
            'balance_after', balance_after
        ) INTO v_result
        FROM wallet_ledger WHERE idempotency_key = p_idempotency_key;
        RETURN v_result;
    END IF;
    
    -- 3. Claim operation
    BEGIN
        INSERT INTO idempotency_keys (key, operation_type, user_id)
        VALUES (p_idempotency_key, 'credit_wallet', p_user_id);
    EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION 'DUPLICATE_REQUEST: This operation was already submitted';
    END;
    
    -- 4. Validate
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT: Amount must be positive';
    END IF;

    -- 5. Get customer with lock
    SELECT id, wallet_balance INTO v_customer_id, v_current_balance
    FROM customers
    WHERE user_id = p_user_id
    FOR UPDATE NOWAIT;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'CUSTOMER_NOT_FOUND: No customer record for user %', p_user_id;
    END IF;

    -- 6. Update balance
    v_new_balance := v_current_balance + p_amount;

    UPDATE customers
    SET wallet_balance = v_new_balance,
        wallet_version = wallet_version + 1,
        updated_at = now()
    WHERE id = v_customer_id;

    -- 7. Create ledger entry
    INSERT INTO wallet_ledger (
        user_id,
        entry_type,
        amount,
        balance_before,
        balance_after,
        reference_type,
        reference_id,
        idempotency_key,
        description
    ) VALUES (
        p_user_id,
        'credit',
        p_amount,
        v_current_balance,
        v_new_balance,
        p_reference_type,
        p_reference_id,
        p_idempotency_key,
        COALESCE(p_description, 'Wallet credit for ' || p_reference_type)
    ) RETURNING id INTO v_ledger_id;

    -- 8. Cache result
    v_result := jsonb_build_object(
        'success', true,
        'ledger_id', v_ledger_id,
        'amount_credited', p_amount,
        'balance_before', v_current_balance,
        'balance_after', v_new_balance
    );
    
    UPDATE idempotency_keys SET result = v_result WHERE key = p_idempotency_key;

    RETURN v_result;
    
EXCEPTION WHEN lock_not_available THEN
    RAISE EXCEPTION 'CONCURRENT_UPDATE: Account is being modified by another transaction';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 5. SAFE MARK_ORDER_DELIVERED FUNCTION (prevents double delivery)
-- =============================================================================

CREATE OR REPLACE FUNCTION mark_order_delivered(
    p_order_id UUID,
    p_distributor_id UUID,
    p_idempotency_key TEXT
) RETURNS JSONB AS $$
DECLARE
    v_order RECORD;
    v_customer_user_id UUID;
    v_debit_result JSONB;
    v_existing RECORD;
BEGIN
    -- 1. Check idempotency
    SELECT * INTO v_existing FROM idempotency_keys WHERE key = p_idempotency_key;
    IF FOUND AND v_existing.result IS NOT NULL THEN
        RETURN v_existing.result;
    END IF;
    
    -- 2. Lock and fetch order
    SELECT o.*, u.id as customer_user_id
    INTO v_order
    FROM orders o
    JOIN users u ON o.user_id = u.id
    WHERE o.id = p_order_id
    FOR UPDATE NOWAIT;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ORDER_NOT_FOUND: Order % does not exist', p_order_id;
    END IF;
    
    -- 3. Verify distributor is assigned
    IF v_order.assigned_distributor_id IS NULL OR v_order.assigned_distributor_id != p_distributor_id THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Order is not assigned to this distributor';
    END IF;
    
    -- 4. Check order status
    IF v_order.status = 'delivered' THEN
        RETURN jsonb_build_object(
            'success', true,
            'message', 'Order was already delivered',
            'delivered_at', v_order.delivered_at
        );
    END IF;
    
    IF v_order.status NOT IN ('scheduled', 'pending', 'assigned', 'in_transit') THEN
        RAISE EXCEPTION 'INVALID_STATUS: Cannot deliver order with status %', v_order.status;
    END IF;
    
    -- 5. Claim operation
    BEGIN
        INSERT INTO idempotency_keys (key, operation_type, user_id)
        VALUES (p_idempotency_key, 'delivery', v_order.user_id);
    EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION 'DUPLICATE_REQUEST: Delivery already being processed';
    END;
    
    -- 6. Debit wallet (uses its own idempotency)
    v_debit_result := debit_wallet(
        v_order.user_id,
        v_order.total_amount,
        'order',
        p_order_id,
        'delivery-debit-' || p_order_id::TEXT,
        'Delivery: Order #' || v_order.order_number
    );
    
    -- 7. Update order status
    UPDATE orders
    SET status = 'delivered',
        delivered_at = now(),
        payment_status = 'completed',
        updated_at = now()
    WHERE id = p_order_id;
    
    -- 8. Update distributor stats
    UPDATE distributors
    SET total_deliveries = total_deliveries + 1,
        updated_at = now()
    WHERE id = p_distributor_id;
    
    -- 9. Update customer stats
    UPDATE customers
    SET total_orders = total_orders + 1,
        updated_at = now()
    WHERE user_id = v_order.user_id;
    
    -- 10. Cache result
    UPDATE idempotency_keys 
    SET result = jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'amount_charged', v_order.total_amount,
        'delivered_at', now()
    )
    WHERE key = p_idempotency_key;
    
    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'amount_charged', v_order.total_amount,
        'new_balance', (v_debit_result->>'balance_after')::NUMERIC,
        'delivered_at', now()
    );
    
EXCEPTION WHEN lock_not_available THEN
    RAISE EXCEPTION 'CONCURRENT_UPDATE: Order is being modified by another transaction';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 6. SAFE SKIP_ORDER FUNCTION (prevents duplicate skips)
-- =============================================================================

CREATE OR REPLACE FUNCTION skip_order(
    p_order_id UUID,
    p_user_id UUID,
    p_reason TEXT DEFAULT 'Skipped by customer'
) RETURNS JSONB AS $$
DECLARE
    v_order RECORD;
    v_idempotency_key TEXT;
BEGIN
    v_idempotency_key := 'skip-order-' || p_order_id::TEXT;
    
    -- Check if already processed
    IF EXISTS (SELECT 1 FROM idempotency_keys WHERE key = v_idempotency_key) THEN
        RETURN jsonb_build_object('success', true, 'message', 'Order already skipped');
    END IF;
    
    -- Lock and fetch order
    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE NOWAIT;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ORDER_NOT_FOUND';
    END IF;
    
    -- Verify ownership
    IF v_order.user_id != p_user_id THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Order does not belong to this user';
    END IF;
    
    -- Check status
    IF v_order.status = 'skipped' THEN
        RETURN jsonb_build_object('success', true, 'message', 'Order was already skipped');
    END IF;
    
    IF v_order.status NOT IN ('scheduled', 'pending', 'assigned') THEN
        RAISE EXCEPTION 'INVALID_STATUS: Cannot skip order with status %', v_order.status;
    END IF;
    
    -- Record idempotency
    INSERT INTO idempotency_keys (key, operation_type, user_id)
    VALUES (v_idempotency_key, 'skip_order', p_user_id);
    
    -- Update order
    UPDATE orders
    SET status = 'skipped',
        skip_reason = p_reason,
        updated_at = now()
    WHERE id = p_order_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'message', 'Order skipped successfully'
    );
    
EXCEPTION WHEN lock_not_available THEN
    RAISE EXCEPTION 'CONCURRENT_UPDATE: Order is being modified';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 7. AUTO-PAUSE SUBSCRIPTIONS WHEN BALANCE IS LOW
-- =============================================================================

CREATE OR REPLACE FUNCTION auto_pause_low_balance_subscriptions(
    p_user_id UUID,
    p_minimum_balance NUMERIC DEFAULT 100
) RETURNS INT AS $$
DECLARE
    v_balance NUMERIC;
    v_count INT;
BEGIN
    -- Get current balance
    SELECT wallet_balance INTO v_balance
    FROM customers WHERE user_id = p_user_id;
    
    IF v_balance IS NULL OR v_balance >= p_minimum_balance THEN
        RETURN 0;
    END IF;
    
    -- Pause active subscriptions
    UPDATE subscriptions
    SET status = 'paused',
        pause_start_date = CURRENT_DATE,
        pause_end_date = NULL, -- Indefinite until recharged
        pause_reason = 'Auto-paused: Low wallet balance',
        updated_at = now()
    WHERE user_id = p_user_id
    AND status = 'active';
    
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 8. TRIGGER: Auto-pause subscriptions after wallet debit
-- =============================================================================

CREATE OR REPLACE FUNCTION trg_check_balance_after_debit()
RETURNS TRIGGER AS $$
BEGIN
    -- After a debit, check if balance fell below minimum
    PERFORM auto_pause_low_balance_subscriptions(NEW.user_id, 100);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS wallet_ledger_check_balance ON wallet_ledger;
CREATE TRIGGER wallet_ledger_check_balance
    AFTER INSERT ON wallet_ledger
    FOR EACH ROW
    WHEN (NEW.entry_type = 'debit')
    EXECUTE FUNCTION trg_check_balance_after_debit();

-- =============================================================================
-- 9. SCHEDULED CLEANUP (call via pg_cron or external scheduler)
-- =============================================================================

CREATE OR REPLACE FUNCTION daily_maintenance()
RETURNS JSONB AS $$
DECLARE
    v_keys_cleaned INT;
    v_holds_expired INT;
BEGIN
    -- Clean expired idempotency keys
    SELECT cleanup_idempotency_keys() INTO v_keys_cleaned;
    
    -- Expire old wallet holds
    UPDATE wallet_holds
    SET status = 'expired', released_at = now()
    WHERE status = 'active' AND expires_at < now();
    GET DIAGNOSTICS v_holds_expired = ROW_COUNT;
    
    RETURN jsonb_build_object(
        'idempotency_keys_cleaned', v_keys_cleaned,
        'wallet_holds_expired', v_holds_expired,
        'run_at', now()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 10. ADD MISSING INDEXES FOR PERFORMANCE
-- =============================================================================

-- Orders: Fast lookup for delivery processing
CREATE INDEX IF NOT EXISTS idx_orders_delivery_status 
    ON orders(delivery_date, status) 
    WHERE status IN ('scheduled', 'pending', 'assigned', 'in_transit');

CREATE INDEX IF NOT EXISTS idx_orders_user_date 
    ON orders(user_id, delivery_date);

CREATE INDEX IF NOT EXISTS idx_orders_distributor_status 
    ON orders(assigned_distributor_id, status, delivery_date)
    WHERE assigned_distributor_id IS NOT NULL;

-- Subscriptions: Fast active subscription lookup
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_active 
    ON subscriptions(user_id, status) 
    WHERE status = 'active';

-- Wallet ledger: Idempotency lookup
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_ledger_idempotency 
    ON wallet_ledger(idempotency_key) 
    WHERE idempotency_key IS NOT NULL;

-- Payments: Provider lookup
CREATE INDEX IF NOT EXISTS idx_payments_provider_id 
    ON payments(provider_payment_id) 
    WHERE provider_payment_id IS NOT NULL;

-- =============================================================================
-- 11. VALIDATION CONSTRAINTS (if not already present)
-- =============================================================================

-- Ensure orders can only be in valid status transitions
-- (This is informational - actual transitions should be enforced in application code)

COMMENT ON FUNCTION debit_wallet IS 'Atomic wallet debit with idempotency. Safe for concurrent calls.';
COMMENT ON FUNCTION credit_wallet IS 'Atomic wallet credit with idempotency. Safe for concurrent calls.';
COMMENT ON FUNCTION mark_order_delivered IS 'Marks order delivered, debits wallet, updates stats. Fully idempotent.';
COMMENT ON FUNCTION skip_order IS 'Skips an order with ownership verification. Idempotent.';
COMMENT ON FUNCTION auto_pause_low_balance_subscriptions IS 'Auto-pauses subscriptions when wallet balance is low.';
COMMENT ON FUNCTION daily_maintenance IS 'Daily cleanup of expired keys and holds. Call via scheduler.';

-- =============================================================================
-- DONE
-- =============================================================================

SELECT 'Migration complete: Idempotency protection and security fixes applied.' AS status;
