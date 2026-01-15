-- =============================================================================
-- PRODUCTION SECURITY MIGRATION
-- Enable Row Level Security + Fix Function Search Paths + Missing Functions
-- =============================================================================
-- 
-- This migration MUST be applied before going to production.
-- It enables RLS on all tables and fixes security vulnerabilities.
--
-- Run with: supabase db push
-- Or manually in SQL Editor in Supabase Dashboard
-- =============================================================================

-- =============================================================================
-- STEP 1: ENABLE ROW LEVEL SECURITY ON ALL TABLES
-- =============================================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE distributors ENABLE ROW LEVEL SECURITY;
ALTER TABLE distributor_activation_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE societies ENABLE ROW LEVEL SECURITY;
ALTER TABLE society_towers ENABLE ROW LEVEL SECURITY;
ALTER TABLE tower_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE distributor_building_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE distributor_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE distributor_stock_handover ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE photo_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_requests ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- STEP 2: DROP CONFLICTING FUNCTIONS
-- =============================================================================

DROP FUNCTION IF EXISTS get_distributor_buildings(UUID);
DROP FUNCTION IF EXISTS get_distributor_todays_deliveries(UUID, DATE);
DROP FUNCTION IF EXISTS get_wallet_balance(UUID);
DROP FUNCTION IF EXISTS calculate_distributor_stock(UUID, DATE);
DROP FUNCTION IF EXISTS upsert_stock_collection(UUID, DATE);

-- =============================================================================
-- STEP 3: RECREATE FUNCTIONS WITH PROPER SEARCH_PATH (Security vulnerability)
-- =============================================================================
-- All functions need explicit search_path to prevent schema injection attacks

-- Fix credit_wallet
CREATE OR REPLACE FUNCTION credit_wallet(
    p_user_id UUID,
    p_amount NUMERIC,
    p_reference_type TEXT,
    p_reference_id UUID DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_created_by UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_customer customers%ROWTYPE;
    v_ledger_id UUID;
    v_idem_key TEXT;
BEGIN
    -- Generate idempotency key if not provided
    v_idem_key := COALESCE(p_idempotency_key, 'credit-' || p_user_id || '-' || p_reference_type || '-' || COALESCE(p_reference_id::TEXT, '') || '-' || NOW()::TEXT);
    
    -- Check for existing transaction with same idempotency key
    SELECT id INTO v_ledger_id FROM wallet_ledger WHERE idempotency_key = v_idem_key;
    IF v_ledger_id IS NOT NULL THEN
        RETURN v_ledger_id; -- Already processed
    END IF;
    
    -- Get customer with lock
    SELECT * INTO v_customer FROM customers WHERE user_id = p_user_id FOR UPDATE;
    IF v_customer.id IS NULL THEN
        RAISE EXCEPTION 'Customer not found for user %', p_user_id;
    END IF;
    
    IF v_customer.is_wallet_locked THEN
        RAISE EXCEPTION 'Wallet is locked';
    END IF;
    
    -- Insert ledger entry
    INSERT INTO wallet_ledger (
        user_id, entry_type, amount, balance_before, balance_after,
        reference_type, reference_id, idempotency_key, description, created_by
    ) VALUES (
        p_user_id, 'credit', p_amount, v_customer.wallet_balance, 
        v_customer.wallet_balance + p_amount,
        p_reference_type, p_reference_id, v_idem_key, 
        COALESCE(p_description, 'Credit: ' || p_reference_type), p_created_by
    ) RETURNING id INTO v_ledger_id;
    
    -- Update customer balance with optimistic locking
    UPDATE customers 
    SET wallet_balance = wallet_balance + p_amount,
        wallet_version = wallet_version + 1,
        updated_at = NOW()
    WHERE user_id = p_user_id AND wallet_version = v_customer.wallet_version;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Concurrent wallet modification detected';
    END IF;
    
    RETURN v_ledger_id;
END;
$$;

-- Fix debit_wallet
CREATE OR REPLACE FUNCTION debit_wallet(
    p_user_id UUID,
    p_amount NUMERIC,
    p_reference_type TEXT,
    p_reference_id UUID DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_created_by UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_customer customers%ROWTYPE;
    v_ledger_id UUID;
    v_idem_key TEXT;
BEGIN
    v_idem_key := COALESCE(p_idempotency_key, 'debit-' || p_user_id || '-' || p_reference_type || '-' || COALESCE(p_reference_id::TEXT, '') || '-' || NOW()::TEXT);
    
    SELECT id INTO v_ledger_id FROM wallet_ledger WHERE idempotency_key = v_idem_key;
    IF v_ledger_id IS NOT NULL THEN
        RETURN v_ledger_id;
    END IF;
    
    SELECT * INTO v_customer FROM customers WHERE user_id = p_user_id FOR UPDATE;
    IF v_customer.id IS NULL THEN
        RAISE EXCEPTION 'Customer not found for user %', p_user_id;
    END IF;
    
    IF v_customer.is_wallet_locked THEN
        RAISE EXCEPTION 'Wallet is locked';
    END IF;
    
    IF v_customer.wallet_balance < p_amount THEN
        RAISE EXCEPTION 'Insufficient balance. Available: %, Required: %', v_customer.wallet_balance, p_amount;
    END IF;
    
    INSERT INTO wallet_ledger (
        user_id, entry_type, amount, balance_before, balance_after,
        reference_type, reference_id, idempotency_key, description, created_by
    ) VALUES (
        p_user_id, 'debit', p_amount, v_customer.wallet_balance, 
        v_customer.wallet_balance - p_amount,
        p_reference_type, p_reference_id, v_idem_key, 
        COALESCE(p_description, 'Debit: ' || p_reference_type), p_created_by
    ) RETURNING id INTO v_ledger_id;
    
    UPDATE customers 
    SET wallet_balance = wallet_balance - p_amount,
        wallet_version = wallet_version + 1,
        lifetime_spent = lifetime_spent + p_amount,
        updated_at = NOW()
    WHERE user_id = p_user_id AND wallet_version = v_customer.wallet_version;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Concurrent wallet modification detected';
    END IF;
    
    RETURN v_ledger_id;
END;
$$;

-- Fix get_wallet_balance
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
DECLARE
    v_balance NUMERIC;
    v_held NUMERIC;
    v_locked BOOLEAN;
BEGIN
    SELECT c.wallet_balance, c.is_wallet_locked 
    INTO v_balance, v_locked
    FROM customers c WHERE c.user_id = p_user_id;
    
    IF v_balance IS NULL THEN
        v_balance := 0;
        v_locked := FALSE;
    END IF;
    
    SELECT COALESCE(SUM(amount), 0) INTO v_held
    FROM wallet_holds 
    WHERE user_id = p_user_id AND status = 'active' AND expires_at > NOW();
    
    RETURN QUERY SELECT v_balance, v_held, v_balance + v_held, v_locked;
END;
$$;

-- Fix set_updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Fix set_order_number
CREATE OR REPLACE FUNCTION set_order_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.order_number IS NULL THEN
        NEW.order_number := 'ORD-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');
    END IF;
    RETURN NEW;
END;
$$;

-- Fix set_ticket_number
CREATE OR REPLACE FUNCTION set_ticket_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.ticket_number IS NULL THEN
        NEW.ticket_number := 'TKT-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');
    END IF;
    RETURN NEW;
END;
$$;

-- Fix set_po_number
CREATE OR REPLACE FUNCTION set_po_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.po_number IS NULL THEN
        NEW.po_number := 'PO-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');
    END IF;
    RETURN NEW;
END;
$$;

-- Fix prevent_ledger_mutation
CREATE OR REPLACE FUNCTION prevent_ledger_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'Wallet ledger entries cannot be modified. Create a reversal entry instead.';
    ELSIF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Wallet ledger entries cannot be deleted. This is required for financial compliance.';
    END IF;
    RETURN NULL;
END;
$$;

-- Fix check_rate_limit
CREATE OR REPLACE FUNCTION check_rate_limit(
    p_identifier TEXT,
    p_action TEXT,
    p_max_requests INT DEFAULT 10,
    p_window_seconds INT DEFAULT 60
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_record rate_limits%ROWTYPE;
    v_window_start TIMESTAMPTZ;
BEGIN
    v_window_start := NOW() - (p_window_seconds || ' seconds')::INTERVAL;
    
    SELECT * INTO v_record 
    FROM rate_limits 
    WHERE identifier = p_identifier AND action = p_action
    FOR UPDATE;
    
    IF v_record.blocked_until IS NOT NULL AND v_record.blocked_until > NOW() THEN
        RETURN FALSE;
    END IF;
    
    IF v_record.id IS NULL THEN
        INSERT INTO rate_limits (identifier, action, window_start, request_count)
        VALUES (p_identifier, p_action, NOW(), 1);
        RETURN TRUE;
    ELSIF v_record.window_start < v_window_start THEN
        UPDATE rate_limits 
        SET window_start = NOW(), request_count = 1, blocked_until = NULL
        WHERE id = v_record.id;
        RETURN TRUE;
    ELSIF v_record.request_count >= p_max_requests THEN
        UPDATE rate_limits 
        SET blocked_until = NOW() + (p_window_seconds || ' seconds')::INTERVAL
        WHERE id = v_record.id;
        RETURN FALSE;
    ELSE
        UPDATE rate_limits 
        SET request_count = request_count + 1
        WHERE id = v_record.id;
        RETURN TRUE;
    END IF;
END;
$$;

-- Fix get_distributor_buildings
CREATE OR REPLACE FUNCTION get_distributor_buildings(p_distributor_id UUID)
RETURNS TABLE(
    assignment_id UUID,
    society_id UUID,
    society_name TEXT,
    tower_id UUID,
    tower_name TEXT,
    floors INT,
    units_count BIGINT,
    active_subscriptions BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        dba.id AS assignment_id,
        s.id AS society_id,
        s.name AS society_name,
        st.id AS tower_id,
        st.name AS tower_name,
        st.floors,
        (SELECT COUNT(*) FROM tower_units tu WHERE tu.tower_id = st.id AND tu.is_active = TRUE) AS units_count,
        (SELECT COUNT(*) FROM subscriptions sub
         JOIN addresses addr ON addr.user_id = sub.user_id
         JOIN tower_units tu ON tu.id = addr.unit_id
         WHERE tu.tower_id = st.id 
           AND sub.status = 'active'
           AND (sub.end_date IS NULL OR sub.end_date >= CURRENT_DATE)
        ) AS active_subscriptions
    FROM distributor_building_assignments dba
    JOIN society_towers st ON st.id = dba.tower_id
    JOIN societies s ON s.id = dba.society_id
    WHERE dba.distributor_id = p_distributor_id
      AND dba.is_active = TRUE
    ORDER BY s.name, st.name;
END;
$$;

-- Fix get_distributor_todays_deliveries
CREATE OR REPLACE FUNCTION get_distributor_todays_deliveries(p_distributor_id UUID, p_date DATE DEFAULT CURRENT_DATE)
RETURNS TABLE(
    order_id UUID,
    order_number TEXT,
    user_id UUID,
    customer_name TEXT,
    customer_phone TEXT,
    wallet_balance NUMERIC,
    society_name TEXT,
    tower_name TEXT,
    unit_number TEXT,
    floor INT,
    product_name TEXT,
    quantity NUMERIC,
    unit TEXT,
    total_amount NUMERIC,
    status order_status,
    delivery_instructions TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        o.id, o.order_number, o.user_id,
        u.name, u.phone, c.wallet_balance,
        COALESCE(s.name, a.society_name),
        st.name, tu.number, tu.floor,
        p.name, o.quantity, p.unit, o.total_amount,
        o.status, a.delivery_instructions
    FROM orders o
    JOIN users u ON u.id = o.user_id
    JOIN customers c ON c.user_id = o.user_id
    JOIN addresses a ON a.id = o.address_id
    LEFT JOIN societies s ON s.id = a.society_id
    LEFT JOIN society_towers st ON st.id = a.tower_id
    LEFT JOIN tower_units tu ON tu.id = a.unit_id
    JOIN products p ON p.id = o.product_id
    JOIN distributor_building_assignments dba ON dba.tower_id = a.tower_id 
        AND dba.distributor_id = p_distributor_id 
        AND dba.is_active = TRUE
    WHERE o.assigned_distributor_id = p_distributor_id 
      AND o.delivery_date = p_date
    ORDER BY s.name, st.name, tu.floor, tu.number;
END;
$$;

-- =============================================================================
-- STEP 3: FIX MISSING upsert_stock_collection FUNCTION
-- =============================================================================

-- First create helper function to calculate distributor stock
CREATE OR REPLACE FUNCTION calculate_distributor_stock(p_distributor_id UUID, p_date DATE DEFAULT CURRENT_DATE)
RETURNS TABLE(
    product_id UUID,
    product_name TEXT,
    total_quantity NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        o.product_id,
        p.name AS product_name,
        SUM(o.quantity) AS total_quantity
    FROM orders o
    JOIN products p ON p.id = o.product_id
    WHERE o.assigned_distributor_id = p_distributor_id
      AND o.delivery_date = p_date
      AND o.status IN ('scheduled', 'pending', 'assigned')
    GROUP BY o.product_id, p.name
    ORDER BY p.name;
END;
$$;

-- Create/fix upsert_stock_collection with correct parameter order
-- NOTE: The screen calls it as (p_date, p_distributor_id) but migration had (p_distributor_id, p_date)
-- Creating with named parameters to support both call patterns
CREATE OR REPLACE FUNCTION upsert_stock_collection(
    p_distributor_id UUID,
    p_date DATE DEFAULT CURRENT_DATE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_handover_id UUID;
    v_stock RECORD;
    v_items JSONB := '[]'::JSONB;
BEGIN
    -- Calculate stock needed
    FOR v_stock IN 
        SELECT * FROM calculate_distributor_stock(p_distributor_id, p_date)
    LOOP
        v_items := v_items || jsonb_build_object(
            'product_id', v_stock.product_id,
            'product_name', v_stock.product_name,
            'quantity', v_stock.total_quantity
        );
    END LOOP;
    
    -- Skip if no items needed
    IF jsonb_array_length(v_items) = 0 THEN
        RETURN NULL;
    END IF;
    
    -- Upsert handover record (only update if not yet given)
    INSERT INTO distributor_stock_handover (distributor_id, handover_date, stock_given)
    VALUES (p_distributor_id, p_date, v_items)
    ON CONFLICT (distributor_id, handover_date) 
    DO UPDATE SET 
        stock_given = EXCLUDED.stock_given,
        updated_at = NOW()
    WHERE distributor_stock_handover.given_at IS NULL
    RETURNING id INTO v_handover_id;
    
    RETURN v_handover_id;
END;
$$;

-- Ensure unique constraint exists for upsert
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'distributor_stock_handover_distributor_date_unique'
    ) THEN
        ALTER TABLE distributor_stock_handover 
        ADD CONSTRAINT distributor_stock_handover_distributor_date_unique 
        UNIQUE (distributor_id, handover_date);
    END IF;
EXCEPTION
    WHEN duplicate_object THEN
        NULL; -- Constraint already exists
END;
$$;

-- =============================================================================
-- STEP 4: GRANT EXECUTE ON FUNCTIONS TO authenticated ROLE
-- =============================================================================

GRANT EXECUTE ON FUNCTION credit_wallet TO authenticated;
GRANT EXECUTE ON FUNCTION debit_wallet TO authenticated;
GRANT EXECUTE ON FUNCTION get_wallet_balance TO authenticated;
GRANT EXECUTE ON FUNCTION check_rate_limit TO authenticated;
GRANT EXECUTE ON FUNCTION get_distributor_buildings TO authenticated;
GRANT EXECUTE ON FUNCTION get_distributor_todays_deliveries TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_stock_collection TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_distributor_stock TO authenticated;

-- =============================================================================
-- SUCCESS MESSAGE
-- =============================================================================

DO $$ 
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════════';
    RAISE NOTICE '✅ PRODUCTION SECURITY MIGRATION COMPLETED';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════════';
    RAISE NOTICE '';
    RAISE NOTICE '🔒 Row Level Security: ENABLED on all tables';
    RAISE NOTICE '🔧 Function search_path: FIXED for all financial functions';
    RAISE NOTICE '📦 upsert_stock_collection: CREATED/FIXED';
    RAISE NOTICE '🎫 Grants: APPLIED for authenticated users';
    RAISE NOTICE '';
    RAISE NOTICE '⚠️  IMPORTANT: Your existing RLS policies are now ACTIVE!';
    RAISE NOTICE '    Make sure policies exist for all tables before production use.';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════════';
END $$;
