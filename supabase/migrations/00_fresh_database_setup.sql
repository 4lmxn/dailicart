-- =============================================================
-- iDaily COMPLETE FRESH DATABASE SETUP
-- Created: December 2024
-- 
-- This is a COMPLETE schema setup - run this on a fresh database
-- Includes all tables, functions, triggers, RLS policies, and
-- the distributor activation code system
-- =============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =========================
-- ENUMS
-- =========================

CREATE TYPE user_role AS ENUM ('customer','distributor','admin','superadmin');
CREATE TYPE subscription_frequency AS ENUM ('daily','alternate','weekly','custom');
CREATE TYPE subscription_status AS ENUM ('active','paused','cancelled','expired');
CREATE TYPE order_status AS ENUM ('scheduled','pending','assigned','in_transit','delivered','skipped','missed','cancelled','failed');
CREATE TYPE payment_status_enum AS ENUM ('created','authorized','captured','failed','refunded');
CREATE TYPE wallet_tx_type AS ENUM ('credit','debit','refund','adjustment','hold','release');
CREATE TYPE wallet_tx_status AS ENUM ('pending','completed','failed','reversed');
CREATE TYPE ledger_entry_type AS ENUM ('credit','debit');
CREATE TYPE inventory_movement_type AS ENUM ('purchase_in','transfer_in','return_in','adjustment_in','sale_out','transfer_out','damage_out','adjustment_out');
CREATE TYPE purchase_order_status AS ENUM ('draft','submitted','approved','partially_received','received','cancelled');
CREATE TYPE payout_status AS ENUM ('pending','processing','completed','failed');
CREATE TYPE ticket_status AS ENUM ('open','in_progress','waiting_customer','escalated','resolved','closed');
CREATE TYPE ticket_priority AS ENUM ('low','medium','high','urgent');
CREATE TYPE ticket_category AS ENUM ('delivery_issue','product_quality','billing','subscription','refund','other');
CREATE TYPE proof_type AS ENUM ('delivery_photo','damage_photo','stock_receipt','stock_return','customer_id','signature');

-- =========================
-- CORE TABLES
-- =========================

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE,
    name TEXT NOT NULL,
    phone TEXT UNIQUE,
    role user_role NOT NULL DEFAULT 'customer',
    avatar_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_users_email ON users(email) WHERE email IS NOT NULL;
CREATE INDEX idx_users_phone ON users(phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_users_role ON users(role);

-- Customers table
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
    wallet_balance NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (wallet_balance >= 0),
    wallet_version INT NOT NULL DEFAULT 0,
    is_wallet_locked BOOLEAN NOT NULL DEFAULT FALSE,
    lifetime_spent NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (lifetime_spent >= 0),
    auto_deduct BOOLEAN NOT NULL DEFAULT TRUE,
    preferred_delivery_time TEXT DEFAULT 'morning',
    referral_code TEXT UNIQUE,
    referred_by UUID REFERENCES customers(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_customers_user ON customers(user_id);

-- Distributors table
CREATE TABLE distributors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
    vehicle_number TEXT,
    assigned_areas TEXT[],
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    joined_at DATE NOT NULL DEFAULT CURRENT_DATE,
    commission_rate NUMERIC(5,2) NOT NULL DEFAULT 10.00 CHECK (commission_rate >= 0 AND commission_rate <= 100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================
-- DISTRIBUTOR ACTIVATION CODES (Admin generates for distributor registration)
-- =========================

CREATE TABLE distributor_activation_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(20) UNIQUE NOT NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    used BOOLEAN DEFAULT FALSE,
    used_by UUID REFERENCES users(id) ON DELETE SET NULL,
    used_at TIMESTAMPTZ,
    notes TEXT
);
CREATE INDEX idx_activation_codes_code ON distributor_activation_codes(code);
CREATE INDEX idx_activation_codes_used ON distributor_activation_codes(used);

-- Function to generate activation code
CREATE OR REPLACE FUNCTION generate_activation_code()
RETURNS VARCHAR(20) AS $$
DECLARE
    chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    result TEXT := '';
    i INT;
BEGIN
    FOR i IN 1..4 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    result := result || '-';
    FOR i IN 1..4 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    result := result || '-';
    FOR i IN 1..4 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function to create activation code (admin only)
CREATE OR REPLACE FUNCTION create_activation_code(
    p_notes TEXT DEFAULT NULL,
    p_expires_in_days INT DEFAULT 30
)
RETURNS TABLE(code VARCHAR, expires_at TIMESTAMPTZ) AS $$
DECLARE
    new_code VARCHAR(20);
    expiry TIMESTAMPTZ;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'superadmin')) THEN
        RAISE EXCEPTION 'Only admins can create activation codes';
    END IF;
    
    LOOP
        new_code := generate_activation_code();
        EXIT WHEN NOT EXISTS (SELECT 1 FROM distributor_activation_codes WHERE distributor_activation_codes.code = new_code);
    END LOOP;
    
    expiry := NOW() + (p_expires_in_days || ' days')::INTERVAL;
    
    INSERT INTO distributor_activation_codes (code, created_by, expires_at, notes)
    VALUES (new_code, auth.uid(), expiry, p_notes);
    
    RETURN QUERY SELECT new_code, expiry;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION create_activation_code TO authenticated;

-- =========================
-- LOCATION/ADDRESS TABLES
-- =========================

CREATE TABLE societies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    developer TEXT,
    area TEXT,
    city TEXT NOT NULL DEFAULT 'Bangalore',
    pincode TEXT CHECK (pincode IS NULL OR pincode ~ '^[0-9]{6}$'),
    address TEXT,
    slug TEXT UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_societies_area ON societies(area) WHERE is_active = TRUE;
CREATE INDEX idx_societies_pincode ON societies(pincode) WHERE is_active = TRUE;

CREATE TABLE society_towers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    society_id UUID NOT NULL REFERENCES societies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    floors INT NOT NULL CHECK (floors > 0 AND floors <= 100),
    units_per_floor INT DEFAULT 4,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(society_id, name)
);

CREATE TABLE tower_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tower_id UUID NOT NULL REFERENCES society_towers(id) ON DELETE CASCADE,
    number TEXT NOT NULL,
    floor INT NOT NULL CHECK (floor >= 0),
    is_occupied BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tower_id, number)
);
CREATE INDEX idx_tower_units_tower ON tower_units(tower_id) WHERE is_active = TRUE;

CREATE TABLE addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    society_id UUID REFERENCES societies(id) ON DELETE SET NULL,
    tower_id UUID REFERENCES society_towers(id) ON DELETE SET NULL,
    unit_id UUID REFERENCES tower_units(id) ON DELETE SET NULL,
    society_name TEXT,
    apartment_number TEXT,
    street_address TEXT,
    area TEXT,
    city TEXT NOT NULL DEFAULT 'Bangalore',
    pincode TEXT CHECK (pincode IS NULL OR pincode ~ '^[0-9]{6}$'),
    landmark TEXT,
    delivery_instructions TEXT,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT addresses_user_unit_unique UNIQUE (user_id, unit_id)
);
CREATE INDEX idx_addresses_user ON addresses(user_id);
CREATE INDEX idx_addresses_tower ON addresses(tower_id) WHERE tower_id IS NOT NULL;

-- =========================
-- PRODUCT TABLES
-- =========================

CREATE TABLE brands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    logo_url TEXT,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    sku TEXT UNIQUE,
    category TEXT NOT NULL,
    unit TEXT NOT NULL,
    price NUMERIC(10,2) NOT NULL CHECK (price > 0),
    mrp NUMERIC(10,2) CHECK (mrp IS NULL OR mrp >= price),
    cost_price NUMERIC(10,2) CHECK (cost_price IS NULL OR cost_price > 0),
    stock_quantity INT NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    min_stock_alert INT NOT NULL DEFAULT 10,
    max_order_quantity INT NOT NULL DEFAULT 10 CHECK (max_order_quantity > 0),
    image_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_category ON products(category) WHERE is_active = TRUE;
CREATE INDEX idx_products_brand ON products(brand_id) WHERE is_active = TRUE;

-- =========================
-- SUBSCRIPTION & ORDER TABLES
-- =========================

CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    address_id UUID NOT NULL REFERENCES addresses(id) ON DELETE RESTRICT,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity NUMERIC(10,2) NOT NULL CHECK (quantity > 0),
    unit_price_locked NUMERIC(10,2) NOT NULL CHECK (unit_price_locked > 0),
    frequency subscription_frequency NOT NULL,
    custom_days JSONB,
    start_date DATE NOT NULL,
    end_date DATE,
    status subscription_status NOT NULL DEFAULT 'active',
    pause_start_date DATE,
    pause_end_date DATE,
    pause_reason TEXT,
    assigned_distributor_id UUID REFERENCES distributors(id) ON DELETE SET NULL,
    next_delivery_date DATE,
    total_delivered INT NOT NULL DEFAULT 0,
    total_skipped INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT valid_date_range CHECK (end_date IS NULL OR end_date >= start_date),
    CONSTRAINT valid_pause_range CHECK (
        (pause_start_date IS NULL AND pause_end_date IS NULL) OR
        (pause_start_date IS NOT NULL AND pause_end_date IS NOT NULL AND pause_end_date >= pause_start_date)
    ),
    CONSTRAINT valid_custom_days CHECK (
        frequency != 'custom' OR (custom_days IS NOT NULL AND jsonb_typeof(custom_days) = 'array')
    )
);
CREATE INDEX idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_active ON subscriptions(status) WHERE status = 'active';
CREATE INDEX idx_subscriptions_distributor ON subscriptions(assigned_distributor_id) WHERE status = 'active';

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT NOT NULL UNIQUE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    address_id UUID NOT NULL REFERENCES addresses(id) ON DELETE RESTRICT,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    delivery_date DATE NOT NULL,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity NUMERIC(10,2) NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(10,2) NOT NULL CHECK (unit_price > 0),
    total_amount NUMERIC(10,2) NOT NULL CHECK (total_amount > 0),
    payment_status payment_status_enum NOT NULL DEFAULT 'created',
    status order_status NOT NULL DEFAULT 'scheduled',
    assigned_distributor_id UUID REFERENCES distributors(id) ON DELETE SET NULL,
    delivered_at TIMESTAMPTZ,
    delivery_notes TEXT,
    skip_reason TEXT,
    wallet_transaction_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT valid_total CHECK (ABS(total_amount - (quantity * unit_price)) < 0.01)
);
CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_delivery_date ON orders(delivery_date);
CREATE INDEX idx_orders_distributor_date ON orders(assigned_distributor_id, delivery_date) 
    WHERE status IN ('scheduled', 'pending', 'assigned', 'in_transit');
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_subscription ON orders(subscription_id) WHERE subscription_id IS NOT NULL;

-- Auto-generate order_number
CREATE OR REPLACE FUNCTION set_order_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.order_number IS NULL THEN
        NEW.order_number := 'ORD-' || to_char(now(), 'YYYYMMDD') || '-' || 
                           upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 8));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_orders_set_order_number BEFORE INSERT ON orders
FOR EACH ROW EXECUTE FUNCTION set_order_number();

-- =========================
-- FINANCIAL TABLES
-- =========================

CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    payment_provider TEXT NOT NULL,
    provider_order_id TEXT,
    provider_payment_id TEXT,
    idempotency_key TEXT NOT NULL UNIQUE,
    status payment_status_enum NOT NULL DEFAULT 'created',
    amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
    error_code TEXT,
    error_description TEXT,
    meta JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_user ON payments(user_id);
CREATE INDEX idx_payments_provider ON payments(provider_payment_id) WHERE provider_payment_id IS NOT NULL;
CREATE INDEX idx_payments_status ON payments(status);

-- Wallet Ledger (IMMUTABLE)
CREATE TABLE wallet_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    entry_type ledger_entry_type NOT NULL,
    amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    balance_before NUMERIC(10,2) NOT NULL,
    balance_after NUMERIC(10,2) NOT NULL,
    reference_type TEXT NOT NULL,
    reference_id UUID,
    idempotency_key TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT valid_balance_transition CHECK (
        (entry_type = 'credit' AND balance_after = balance_before + amount) OR
        (entry_type = 'debit' AND balance_after = balance_before - amount)
    ),
    CONSTRAINT balance_after_non_negative CHECK (balance_after >= 0)
);
CREATE INDEX idx_wallet_ledger_user ON wallet_ledger(user_id, created_at DESC);
CREATE INDEX idx_wallet_ledger_reference ON wallet_ledger(reference_type, reference_id);

-- Prevent ledger mutations
CREATE OR REPLACE FUNCTION prevent_ledger_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'wallet_ledger is immutable - updates and deletes are not allowed';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_wallet_ledger_immutable 
BEFORE UPDATE OR DELETE ON wallet_ledger
FOR EACH ROW EXECUTE FUNCTION prevent_ledger_mutation();

-- Wallet Holds
CREATE TABLE wallet_holds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'released', 'captured', 'expired')),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
    released_at TIMESTAMPTZ,
    idempotency_key TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_wallet_holds_user_active ON wallet_holds(user_id) WHERE status = 'active';

-- Legacy wallet_transactions (backward compatibility)
CREATE TABLE wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    ledger_entry_id UUID REFERENCES wallet_ledger(id),
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
    transaction_type wallet_tx_type NOT NULL,
    amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    balance_after NUMERIC(10,2),
    description TEXT,
    status wallet_tx_status NOT NULL DEFAULT 'pending',
    payment_method TEXT,
    meta JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_wallet_tx_user ON wallet_transactions(user_id, created_at DESC);

-- =========================
-- FINANCIAL FUNCTIONS
-- =========================

-- Credit wallet
CREATE OR REPLACE FUNCTION credit_wallet(
    p_user_id UUID,
    p_amount NUMERIC,
    p_reference_type TEXT,
    p_reference_id UUID,
    p_idempotency_key TEXT,
    p_description TEXT,
    p_created_by UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_customer_id UUID;
    v_current_balance NUMERIC;
    v_current_version INT;
    v_new_balance NUMERIC;
    v_ledger_id UUID;
    v_is_locked BOOLEAN;
BEGIN
    SELECT id INTO v_ledger_id FROM wallet_ledger WHERE idempotency_key = p_idempotency_key;
    IF v_ledger_id IS NOT NULL THEN
        RETURN v_ledger_id;
    END IF;
    
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
    
    INSERT INTO wallet_ledger (
        user_id, entry_type, amount, balance_before, balance_after,
        reference_type, reference_id, idempotency_key, description, created_by
    ) VALUES (
        p_user_id, 'credit', p_amount, v_current_balance, v_new_balance,
        p_reference_type, p_reference_id, p_idempotency_key, p_description, p_created_by
    ) RETURNING id INTO v_ledger_id;
    
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
$$ LANGUAGE plpgsql;

-- Debit wallet
CREATE OR REPLACE FUNCTION debit_wallet(
    p_user_id UUID,
    p_amount NUMERIC,
    p_reference_type TEXT,
    p_reference_id UUID,
    p_idempotency_key TEXT,
    p_description TEXT,
    p_created_by UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_customer_id UUID;
    v_current_balance NUMERIC;
    v_current_version INT;
    v_new_balance NUMERIC;
    v_ledger_id UUID;
    v_is_locked BOOLEAN;
BEGIN
    SELECT id INTO v_ledger_id FROM wallet_ledger WHERE idempotency_key = p_idempotency_key;
    IF v_ledger_id IS NOT NULL THEN
        RETURN v_ledger_id;
    END IF;
    
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
    
    INSERT INTO wallet_ledger (
        user_id, entry_type, amount, balance_before, balance_after,
        reference_type, reference_id, idempotency_key, description, created_by
    ) VALUES (
        p_user_id, 'debit', p_amount, v_current_balance, v_new_balance,
        p_reference_type, p_reference_id, p_idempotency_key, p_description, p_created_by
    ) RETURNING id INTO v_ledger_id;
    
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
$$ LANGUAGE plpgsql;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION credit_wallet TO authenticated;
GRANT EXECUTE ON FUNCTION debit_wallet TO authenticated;

-- Get wallet balance
CREATE OR REPLACE FUNCTION get_wallet_balance(p_user_id UUID)
RETURNS TABLE(
    available_balance NUMERIC,
    held_amount NUMERIC,
    total_balance NUMERIC,
    is_locked BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.wallet_balance AS available_balance,
        COALESCE((SELECT SUM(wh.amount) FROM wallet_holds wh WHERE wh.user_id = p_user_id AND wh.status = 'active'), 0) AS held_amount,
        c.wallet_balance + COALESCE((SELECT SUM(wh.amount) FROM wallet_holds wh WHERE wh.user_id = p_user_id AND wh.status = 'active'), 0) AS total_balance,
        c.is_wallet_locked
    FROM customers c
    WHERE c.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- =========================
-- DISTRIBUTOR MANAGEMENT TABLES
-- =========================

CREATE TABLE distributor_building_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    distributor_id UUID NOT NULL REFERENCES distributors(id) ON DELETE CASCADE,
    society_id UUID NOT NULL REFERENCES societies(id) ON DELETE CASCADE,
    tower_id UUID NOT NULL REFERENCES society_towers(id) ON DELETE CASCADE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    assigned_at DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(distributor_id, tower_id)
);
CREATE INDEX idx_dist_assignments_distributor ON distributor_building_assignments(distributor_id) WHERE is_active = TRUE;
CREATE INDEX idx_dist_assignments_tower ON distributor_building_assignments(tower_id);

CREATE TABLE distributor_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    distributor_id UUID NOT NULL REFERENCES distributors(id) ON DELETE RESTRICT,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    deliveries_count INT NOT NULL DEFAULT 0 CHECK (deliveries_count >= 0),
    base_earnings NUMERIC(12,2) NOT NULL DEFAULT 0,
    bonus_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    deductions NUMERIC(12,2) NOT NULL DEFAULT 0,
    final_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    status payout_status NOT NULL DEFAULT 'pending',
    payment_reference TEXT,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(distributor_id, period_start, period_end)
);

CREATE TABLE distributor_stock_handover (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    distributor_id UUID NOT NULL REFERENCES distributors(id) ON DELETE RESTRICT,
    handover_date DATE NOT NULL DEFAULT CURRENT_DATE,
    stock_given JSONB NOT NULL DEFAULT '[]',
    stock_given_photo_id UUID,
    given_at TIMESTAMPTZ,
    given_by UUID REFERENCES users(id),
    stock_returned JSONB,
    stock_returned_photo_id UUID,
    returned_at TIMESTAMPTZ,
    received_by UUID REFERENCES users(id),
    discrepancy_notes TEXT,
    discrepancy_amount NUMERIC(10,2) DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(distributor_id, handover_date)
);

-- =========================
-- DISTRIBUTOR FUNCTIONS
-- =========================

-- Get distributor buildings with unit counts
CREATE OR REPLACE FUNCTION get_distributor_buildings(p_distributor_id UUID)
RETURNS TABLE(
    assignment_id UUID,
    society_id UUID,
    society_name TEXT,
    tower_id UUID,
    tower_name TEXT,
    floors INTEGER,
    is_active BOOLEAN,
    total_units BIGINT,
    active_subscriptions BIGINT
) 
LANGUAGE plpgsql
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
        dba.is_active,
        (SELECT COUNT(*) FROM tower_units tu WHERE tu.tower_id = st.id)::BIGINT AS total_units,
        (SELECT COUNT(DISTINCT sub.user_id) 
         FROM subscriptions sub
         JOIN addresses addr ON addr.user_id = sub.user_id
         JOIN tower_units tu ON tu.id = addr.unit_id
         WHERE tu.tower_id = st.id 
           AND sub.status = 'active'
           AND (sub.end_date IS NULL OR sub.end_date >= CURRENT_DATE)
        )::BIGINT AS active_subscriptions
    FROM distributor_building_assignments dba
    JOIN society_towers st ON st.id = dba.tower_id
    JOIN societies s ON s.id = dba.society_id
    WHERE dba.distributor_id = p_distributor_id
      AND dba.is_active = TRUE
    ORDER BY s.name, st.name;
END;
$$;

GRANT EXECUTE ON FUNCTION get_distributor_buildings TO authenticated;

-- Get today's deliveries for distributor
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
) AS $$
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
    WHERE o.assigned_distributor_id = p_distributor_id
      AND o.delivery_date = p_date
      AND o.status IN ('scheduled', 'pending', 'assigned', 'in_transit', 'delivered')
    ORDER BY st.name, tu.floor, tu.number;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION get_distributor_todays_deliveries TO authenticated;

-- =========================
-- SUPPORT & STOCK TABLES
-- =========================

CREATE TABLE support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_number TEXT NOT NULL UNIQUE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    category ticket_category NOT NULL,
    priority ticket_priority NOT NULL DEFAULT 'medium',
    status ticket_status NOT NULL DEFAULT 'open',
    subject TEXT NOT NULL,
    description TEXT NOT NULL,
    assigned_admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
    resolution_notes TEXT,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    refund_amount NUMERIC(10,2),
    refund_approved BOOLEAN,
    refund_processed_at TIMESTAMPTZ,
    escalated_at TIMESTAMPTZ,
    escalation_reason TEXT,
    first_response_at TIMESTAMPTZ,
    sla_breached BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT valid_refund CHECK (refund_amount IS NULL OR refund_amount > 0)
);
CREATE INDEX idx_support_tickets_user ON support_tickets(user_id);
CREATE INDEX idx_support_tickets_status ON support_tickets(status) WHERE status NOT IN ('resolved', 'closed');

-- Ticket number auto-generation
CREATE OR REPLACE FUNCTION set_ticket_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.ticket_number IS NULL THEN
        NEW.ticket_number := 'TKT-' || to_char(now(), 'YYYYMMDD') || '-' || 
                            upper(substr(encode(gen_random_bytes(3), 'hex'), 1, 6));
    END IF;
    RETURN NEW;
END;$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_support_tickets_number BEFORE INSERT ON support_tickets
FOR EACH ROW EXECUTE FUNCTION set_ticket_number();

CREATE TABLE ticket_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    sender_role user_role NOT NULL,
    message TEXT NOT NULL,
    is_internal_note BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ticket_messages_ticket ON ticket_messages(ticket_id, created_at);

CREATE TABLE photo_proofs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    proof_type proof_type NOT NULL,
    reference_type TEXT NOT NULL,
    reference_id UUID NOT NULL,
    file_url TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size_bytes INT NOT NULL CHECK (file_size_bytes > 0 AND file_size_bytes <= 10485760),
    mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
    description TEXT,
    location_lat NUMERIC(10,6),
    location_lng NUMERIC(10,6),
    captured_at TIMESTAMPTZ,
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    verified_by UUID REFERENCES users(id),
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_photo_proofs_reference ON photo_proofs(reference_type, reference_id);

CREATE TABLE ticket_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    photo_proof_id UUID NOT NULL REFERENCES photo_proofs(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(ticket_id, photo_proof_id)
);

-- =========================
-- INVENTORY TABLES
-- =========================

CREATE TABLE suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    contact_name TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    gst_number TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_number TEXT NOT NULL UNIQUE,
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    order_date DATE NOT NULL DEFAULT CURRENT_DATE,
    expected_date DATE,
    status purchase_order_status NOT NULL DEFAULT 'draft',
    notes TEXT,
    total_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    created_by UUID REFERENCES users(id),
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION set_po_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.po_number IS NULL THEN
        NEW.po_number := 'PO-' || to_char(now(), 'YYYYMMDD') || '-' || 
                        upper(substr(encode(gen_random_bytes(3), 'hex'), 1, 6));
    END IF;
    RETURN NEW;
END;$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_po_number BEFORE INSERT ON purchase_orders
FOR EACH ROW EXECUTE FUNCTION set_po_number();

CREATE TABLE purchase_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity NUMERIC(12,2) NOT NULL CHECK (quantity > 0),
    unit_cost NUMERIC(12,2) NOT NULL CHECK (unit_cost > 0),
    total_cost NUMERIC(12,2) NOT NULL CHECK (total_cost > 0),
    received_quantity NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (received_quantity >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    movement_type inventory_movement_type NOT NULL,
    quantity NUMERIC(12,2) NOT NULL,
    unit_cost NUMERIC(12,2),
    batch_id TEXT,
    expiry_date DATE,
    reference_type TEXT,
    reference_id UUID,
    notes TEXT,
    created_by UUID REFERENCES users(id),
    photo_proof_id UUID REFERENCES photo_proofs(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_stock_movements_product ON stock_movements(product_id, created_at DESC);

-- =========================
-- AUDIT TABLES
-- =========================

CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name TEXT NOT NULL,
    record_id UUID NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    old_data JSONB,
    new_data JSONB,
    changed_fields TEXT[],
    changed_by UUID REFERENCES users(id),
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_log_table_record ON audit_log(table_name, record_id);
CREATE INDEX idx_audit_log_created ON audit_log(created_at DESC);

CREATE TABLE rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier TEXT NOT NULL,
    action TEXT NOT NULL,
    window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
    request_count INT NOT NULL DEFAULT 1,
    blocked_until TIMESTAMPTZ,
    UNIQUE(identifier, action)
);
CREATE INDEX idx_rate_limits_identifier ON rate_limits(identifier, action);

CREATE TABLE otp_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone TEXT NOT NULL,
    otp_hash TEXT NOT NULL,
    purpose TEXT NOT NULL DEFAULT 'login',
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 3,
    expires_at TIMESTAMPTZ NOT NULL,
    verified_at TIMESTAMPTZ,
    ip_address INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_otp_requests_phone ON otp_requests(phone, purpose);

-- =========================
-- TRIGGERS - Updated_at
-- =========================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
DO $$ 
DECLARE
    t TEXT;
    tables TEXT[] := ARRAY[
        'users', 'customers', 'distributors', 'societies', 'society_towers', 
        'tower_units', 'addresses', 'brands', 'products', 'subscriptions', 
        'orders', 'payments', 'wallet_transactions', 'purchase_orders',
        'distributor_building_assignments', 'distributor_payouts', 
        'support_tickets', 'distributor_stock_handover', 'suppliers'
    ];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS trg_%s_updated_at ON %s;
            CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %s
            FOR EACH ROW EXECUTE FUNCTION set_updated_at();
        ', t, t, t, t);
    END LOOP;
END $$;

-- =========================
-- RLS POLICIES
-- =========================

-- Enable RLS on all tables
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
ALTER TABLE photo_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Users can view their own data" ON users FOR SELECT TO authenticated
    USING (id = auth.uid() OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'superadmin')));
CREATE POLICY "Users can update their own data" ON users FOR UPDATE TO authenticated
    USING (id = auth.uid());
CREATE POLICY "Admins can manage users" ON users FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'superadmin')));

-- Customers policies
CREATE POLICY "Customers can view their own data" ON customers FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'superadmin', 'distributor')));
CREATE POLICY "Customers can update their own data" ON customers FOR UPDATE TO authenticated
    USING (user_id = auth.uid());
CREATE POLICY "Admins can manage customers" ON customers FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'superadmin')));

-- Distributors policies
CREATE POLICY "Distributors can view their own data" ON distributors FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'superadmin')));
CREATE POLICY "Admins can manage distributors" ON distributors FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'superadmin')));

-- Activation codes policies
CREATE POLICY "Admins can manage activation codes" ON distributor_activation_codes FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'superadmin')));
CREATE POLICY "Anyone can verify activation codes" ON distributor_activation_codes FOR SELECT TO authenticated
    USING (true);
CREATE POLICY "Users can use activation codes" ON distributor_activation_codes FOR UPDATE TO authenticated
    USING (used = false)
    WITH CHECK (used = true AND used_by = auth.uid());

-- Location policies (public read for active)
CREATE POLICY "Anyone can view active societies" ON societies FOR SELECT TO authenticated USING (is_active = true);
CREATE POLICY "Anyone can view active towers" ON society_towers FOR SELECT TO authenticated USING (is_active = true);
CREATE POLICY "Anyone can view active units" ON tower_units FOR SELECT TO authenticated USING (is_active = true);
CREATE POLICY "Admins can manage locations" ON societies FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'superadmin')));
CREATE POLICY "Admins can manage towers" ON society_towers FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'superadmin')));
CREATE POLICY "Admins can manage units" ON tower_units FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'superadmin')));

-- Addresses policies
CREATE POLICY "Users can manage their own addresses" ON addresses FOR ALL TO authenticated
    USING (user_id = auth.uid());
CREATE POLICY "Distributors can view addresses for deliveries" ON addresses FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'superadmin', 'distributor')));

-- Products policies (public read for active)
CREATE POLICY "Anyone can view active products" ON products FOR SELECT TO authenticated USING (is_active = true);
CREATE POLICY "Anyone can view active brands" ON brands FOR SELECT TO authenticated USING (is_active = true);
CREATE POLICY "Admins can manage products" ON products FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'superadmin')));
CREATE POLICY "Admins can manage brands" ON brands FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'superadmin')));

-- Subscriptions policies
CREATE POLICY "Users can manage their own subscriptions" ON subscriptions FOR ALL TO authenticated
    USING (user_id = auth.uid());
CREATE POLICY "Admins and distributors can view subscriptions" ON subscriptions FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'superadmin', 'distributor')));

-- Orders policies
CREATE POLICY "Users can view their own orders" ON orders FOR SELECT TO authenticated
    USING (user_id = auth.uid());
CREATE POLICY "Distributors can view and update assigned orders" ON orders FOR ALL TO authenticated
    USING (
        EXISTS (SELECT 1 FROM distributors WHERE user_id = auth.uid() AND id = assigned_distributor_id)
        OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
    );
CREATE POLICY "Admins can manage all orders" ON orders FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'superadmin')));

-- Financial policies
CREATE POLICY "Users can view their own payments" ON payments FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'superadmin')));
CREATE POLICY "Users can view their own ledger" ON wallet_ledger FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'superadmin')));
CREATE POLICY "Users can view their own holds" ON wallet_holds FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'superadmin')));
CREATE POLICY "Users can view their own transactions" ON wallet_transactions FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'superadmin')));

-- Distributor assignments policies
CREATE POLICY "Distributors can view their assignments" ON distributor_building_assignments FOR SELECT TO authenticated
    USING (
        EXISTS (SELECT 1 FROM distributors WHERE user_id = auth.uid() AND id = distributor_id)
        OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
    );
CREATE POLICY "Admins can manage assignments" ON distributor_building_assignments FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'superadmin')));

-- Distributor payouts policies
CREATE POLICY "Distributors can view their payouts" ON distributor_payouts FOR SELECT TO authenticated
    USING (
        EXISTS (SELECT 1 FROM distributors WHERE user_id = auth.uid() AND id = distributor_id)
        OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
    );
CREATE POLICY "Admins can manage payouts" ON distributor_payouts FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'superadmin')));

-- Stock handover policies
CREATE POLICY "Distributors can view their stock handover" ON distributor_stock_handover FOR SELECT TO authenticated
    USING (
        EXISTS (SELECT 1 FROM distributors WHERE user_id = auth.uid() AND id = distributor_id)
        OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
    );
CREATE POLICY "Distributors can update their stock handover" ON distributor_stock_handover FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM distributors WHERE user_id = auth.uid() AND id = distributor_id));
CREATE POLICY "Admins can manage stock handover" ON distributor_stock_handover FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'superadmin')));

-- Support tickets policies
CREATE POLICY "Users can manage their own tickets" ON support_tickets FOR ALL TO authenticated
    USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'superadmin')));
CREATE POLICY "Users can view their ticket messages" ON ticket_messages FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM support_tickets WHERE id = ticket_id AND user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'superadmin')));
CREATE POLICY "Users can add ticket messages" ON ticket_messages FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM support_tickets WHERE id = ticket_id AND user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'superadmin')));

-- Photo proofs policies
CREATE POLICY "Users can upload their own proofs" ON photo_proofs FOR INSERT TO authenticated
    WITH CHECK (uploaded_by = auth.uid());
CREATE POLICY "Users can view relevant proofs" ON photo_proofs FOR SELECT TO authenticated
    USING (uploaded_by = auth.uid() OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'superadmin', 'distributor')));

-- Inventory policies (admin only)
CREATE POLICY "Admins can manage suppliers" ON suppliers FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'superadmin')));
CREATE POLICY "Admins can manage purchase orders" ON purchase_orders FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'superadmin')));
CREATE POLICY "Admins can manage PO items" ON purchase_order_items FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'superadmin')));
CREATE POLICY "Admins can manage stock movements" ON stock_movements FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'superadmin')));

-- Audit log (admin only)
CREATE POLICY "Admins can view audit log" ON audit_log FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'superadmin')));

-- Ticket attachments
CREATE POLICY "Users can view ticket attachments" ON ticket_attachments FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM support_tickets WHERE id = ticket_id AND user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'superadmin')));

-- =========================
-- ORDER GENERATION FUNCTION
-- =========================

CREATE OR REPLACE FUNCTION generate_orders_for_subscription(
    p_subscription_id UUID,
    p_days_ahead INT DEFAULT 30
)
RETURNS INT AS $$
DECLARE
    rec RECORD;
    d DATE;
    weekday INT;
    existing_order UUID;
    v_order_number TEXT;
    created_count INT := 0;
BEGIN
    SELECT s.*, a.id AS addr_id
    INTO rec
    FROM subscriptions s
    JOIN addresses a ON a.id = s.address_id
    WHERE s.id = p_subscription_id AND s.status = 'active';
    
    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    d := GREATEST(rec.start_date, CURRENT_DATE);
    
    WHILE d <= CURRENT_DATE + p_days_ahead LOOP
        weekday := EXTRACT(DOW FROM d);
        
        -- Check pause period
        IF rec.pause_start_date IS NOT NULL AND rec.pause_end_date IS NOT NULL 
           AND d >= rec.pause_start_date AND d <= rec.pause_end_date THEN
            d := d + INTERVAL '1 day';
            CONTINUE;
        END IF;

        -- Check frequency
        IF rec.frequency = 'daily' THEN
            NULL; -- every day
        ELSIF rec.frequency = 'alternate' THEN
            IF (d - rec.start_date) % 2 != 0 THEN
                d := d + INTERVAL '1 day';
                CONTINUE;
            END IF;
        ELSIF rec.frequency = 'weekly' THEN
            IF weekday != 0 THEN -- Sunday
                d := d + INTERVAL '1 day';
                CONTINUE;
            END IF;
        ELSIF rec.frequency = 'custom' THEN
            IF rec.custom_days IS NULL OR NOT (rec.custom_days ? weekday::text) THEN
                d := d + INTERVAL '1 day';
                CONTINUE;
            END IF;
        END IF;

        -- Date window check
        IF d < rec.start_date OR (rec.end_date IS NOT NULL AND d > rec.end_date) THEN
            d := d + INTERVAL '1 day';
            CONTINUE;
        END IF;

        -- Check existing order
        SELECT id INTO existing_order 
        FROM orders 
        WHERE subscription_id = rec.id AND delivery_date = d AND product_id = rec.product_id
        LIMIT 1;

        IF existing_order IS NULL THEN
            v_order_number := 'ORD-' || to_char(d, 'YYYYMMDD') || '-' || 
                             upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 8));
            
            INSERT INTO orders (
                order_number, user_id, address_id, subscription_id, delivery_date, 
                product_id, quantity, unit_price, total_amount, status, payment_status, 
                assigned_distributor_id
            ) VALUES (
                v_order_number, rec.user_id, rec.address_id, rec.id, d, 
                rec.product_id, rec.quantity, 
                COALESCE(rec.unit_price_locked, (SELECT price FROM products WHERE id = rec.product_id)), 
                ROUND(rec.quantity * COALESCE(rec.unit_price_locked, (SELECT price FROM products WHERE id = rec.product_id)), 2), 
                'scheduled', 'created', rec.assigned_distributor_id
            );
            created_count := created_count + 1;
        END IF;

        d := d + INTERVAL '1 day';
    END LOOP;

    RETURN created_count;
END;
$$ LANGUAGE plpgsql;

-- Trigger for subscription order generation
CREATE OR REPLACE FUNCTION trigger_generate_subscription_orders()
RETURNS TRIGGER AS $$
DECLARE
    orders_created INT;
BEGIN
    IF NEW.status = 'active' THEN
        SELECT generate_orders_for_subscription(NEW.id, 30) INTO orders_created;
        RAISE NOTICE 'Generated % orders for subscription %', orders_created, NEW.id;
    END IF;
    
    IF NEW.pause_start_date IS NOT NULL AND NEW.pause_end_date IS NOT NULL THEN
        UPDATE orders 
        SET status = 'skipped', skip_reason = 'Subscription paused'
        WHERE subscription_id = NEW.id 
          AND delivery_date >= NEW.pause_start_date 
          AND delivery_date <= NEW.pause_end_date
          AND status IN ('scheduled', 'pending');
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_subscription_generate_orders
AFTER INSERT OR UPDATE ON subscriptions
FOR EACH ROW EXECUTE FUNCTION trigger_generate_subscription_orders();

-- =========================
-- FINAL GRANTS
-- =========================

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Print success message
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '===========================================';
    RAISE NOTICE 'iDaily Database Setup Complete!';
    RAISE NOTICE '===========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'Tables created: 30+';
    RAISE NOTICE 'Functions created: 10+';
    RAISE NOTICE 'RLS policies applied: 50+';
    RAISE NOTICE '';
    RAISE NOTICE 'Features included:';
    RAISE NOTICE '  ✓ Distributor activation codes';
    RAISE NOTICE '  ✓ get_distributor_buildings with unit counts';
    RAISE NOTICE '  ✓ debit_wallet / credit_wallet with idempotency';
    RAISE NOTICE '  ✓ Order generation from subscriptions';
    RAISE NOTICE '  ✓ Complete RLS policies';
    RAISE NOTICE '===========================================';
END $$;
