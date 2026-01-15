-- Migration: Add idempotency protection for financial operations
-- Prevents duplicate wallet debits, credits, and payments

-- =============================================================================
-- IDEMPOTENCY KEYS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS idempotency_keys (
    key TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours'),
    result JSONB,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires ON idempotency_keys(expires_at);
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_user ON idempotency_keys(user_id);

-- Cleanup old keys periodically (can be called by cron)
CREATE OR REPLACE FUNCTION cleanup_idempotency_keys()
RETURNS INT AS $$
DECLARE
    v_count INT;
BEGIN
    DELETE FROM idempotency_keys WHERE expires_at < now();
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- UPDATED DEBIT_WALLET FUNCTION WITH IDEMPOTENCY
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
    v_existing_key RECORD;
BEGIN
    -- Check idempotency key first
    SELECT * INTO v_existing_key FROM idempotency_keys 
    WHERE key = p_idempotency_key;
    
    IF FOUND THEN
        -- Return cached result if exists
        IF v_existing_key.result IS NOT NULL THEN
            RETURN v_existing_key.result;
        END IF;
        -- Key exists but no result - operation in progress, reject
        RAISE EXCEPTION 'Operation already in progress for this idempotency key';
    END IF;
    
    -- Insert idempotency key to claim this operation
    BEGIN
        INSERT INTO idempotency_keys (key, user_id) VALUES (p_idempotency_key, p_user_id);
    EXCEPTION WHEN unique_violation THEN
        -- Another request beat us, reject
        RAISE EXCEPTION 'Duplicate request detected';
    END;
    
    -- Validate amount
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Amount must be positive';
    END IF;

    -- Get customer and lock the row for update
    SELECT id, wallet_balance INTO v_customer_id, v_current_balance
    FROM customers
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Customer not found';
    END IF;

    -- Check sufficient balance
    IF v_current_balance < p_amount THEN
        RAISE EXCEPTION 'Insufficient balance. Required: %, Available: %', p_amount, v_current_balance;
    END IF;

    -- Calculate new balance
    v_new_balance := v_current_balance - p_amount;

    -- Update customer balance
    UPDATE customers
    SET wallet_balance = v_new_balance,
        updated_at = now()
    WHERE id = v_customer_id;

    -- Create ledger entry
    INSERT INTO wallet_ledger (
        user_id,
        transaction_type,
        amount,
        balance_before,
        balance_after,
        reference_type,
        reference_id,
        description,
        idempotency_key
    ) VALUES (
        p_user_id,
        'debit',
        p_amount,
        v_current_balance,
        v_new_balance,
        p_reference_type,
        p_reference_id,
        COALESCE(p_description, 'Wallet debit'),
        p_idempotency_key
    ) RETURNING id INTO v_ledger_id;

    -- Store result in idempotency key
    UPDATE idempotency_keys 
    SET result = jsonb_build_object(
        'success', true,
        'ledger_id', v_ledger_id,
        'new_balance', v_new_balance,
        'amount_debited', p_amount
    )
    WHERE key = p_idempotency_key;

    RETURN jsonb_build_object(
        'success', true,
        'ledger_id', v_ledger_id,
        'new_balance', v_new_balance,
        'amount_debited', p_amount
    );
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- UPDATED CREDIT_WALLET FUNCTION WITH IDEMPOTENCY
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
    v_existing_key RECORD;
BEGIN
    -- Check idempotency key first
    SELECT * INTO v_existing_key FROM idempotency_keys 
    WHERE key = p_idempotency_key;
    
    IF FOUND THEN
        -- Return cached result if exists
        IF v_existing_key.result IS NOT NULL THEN
            RETURN v_existing_key.result;
        END IF;
        RAISE EXCEPTION 'Operation already in progress for this idempotency key';
    END IF;
    
    -- Insert idempotency key to claim this operation
    BEGIN
        INSERT INTO idempotency_keys (key, user_id) VALUES (p_idempotency_key, p_user_id);
    EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION 'Duplicate request detected';
    END;
    
    -- Validate amount
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Amount must be positive';
    END IF;

    -- Get customer and lock the row for update
    SELECT id, wallet_balance INTO v_customer_id, v_current_balance
    FROM customers
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Customer not found';
    END IF;

    -- Calculate new balance
    v_new_balance := v_current_balance + p_amount;

    -- Update customer balance
    UPDATE customers
    SET wallet_balance = v_new_balance,
        updated_at = now()
    WHERE id = v_customer_id;

    -- Create ledger entry
    INSERT INTO wallet_ledger (
        user_id,
        transaction_type,
        amount,
        balance_before,
        balance_after,
        reference_type,
        reference_id,
        description,
        idempotency_key
    ) VALUES (
        p_user_id,
        'credit',
        p_amount,
        v_current_balance,
        v_new_balance,
        p_reference_type,
        p_reference_id,
        COALESCE(p_description, 'Wallet credit'),
        p_idempotency_key
    ) RETURNING id INTO v_ledger_id;

    -- Store result in idempotency key
    UPDATE idempotency_keys 
    SET result = jsonb_build_object(
        'success', true,
        'ledger_id', v_ledger_id,
        'new_balance', v_new_balance,
        'amount_credited', p_amount
    )
    WHERE key = p_idempotency_key;

    RETURN jsonb_build_object(
        'success', true,
        'ledger_id', v_ledger_id,
        'new_balance', v_new_balance,
        'amount_credited', p_amount
    );
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Add idempotency_key column to wallet_ledger if not exists
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'wallet_ledger' AND column_name = 'idempotency_key'
    ) THEN
        ALTER TABLE wallet_ledger ADD COLUMN idempotency_key TEXT;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_ledger_idempotency ON wallet_ledger(idempotency_key) WHERE idempotency_key IS NOT NULL;
    END IF;
END $$;

COMMENT ON TABLE idempotency_keys IS 'Stores idempotency keys to prevent duplicate financial operations';
COMMENT ON FUNCTION debit_wallet IS 'Atomic wallet debit with idempotency protection';
COMMENT ON FUNCTION credit_wallet IS 'Atomic wallet credit with idempotency protection';
