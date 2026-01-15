# iDaily Project — Interview Documentation (Part 2: Database Schema & Data Models)

**Part 2 of 5**: Deep dive into database design, tables, relationships, and SQL implementation

---

## Table of Contents - Part 2
1. [Database Design Philosophy](#database-design-philosophy)
2. [Core Tables & Relationships](#core-tables--relationships)
3. [Financial System Design](#financial-system-design)
4. [Security & RLS Policies](#security--rls-policies)
5. [Constraints & Data Integrity](#constraints--data-integrity)
6. [Functions & Triggers](#functions--triggers)

---

## Database Design Philosophy

### Design Principles Applied

#### 1. **Financial-Grade Schema**
- **Immutable Financial Records**: Wallet ledger entries cannot be modified/deleted
- **Double-Entry Accounting**: Every transaction has offsetting credit and debit
- **Idempotency**: All operations can be safely retried without side effects
- **Row-Level Locking**: Prevents race conditions on balance updates
- **Audit Trail**: Complete history of all changes with timestamps

#### 2. **Normalization (3NF)**
- No redundant data storage
- Each table represents a single entity
- Foreign key relationships maintain referential integrity
- Computed values (like totals) recalculated rather than stored

#### 3. **Security by Default**
- Row Level Security (RLS) enabled on all tables
- Users can only access their own data
- Admin/distributor roles have expanded but controlled access
- Sensitive operations require function calls (no direct table access)

#### 4. **Soft Deletes**
- `is_deleted` flag instead of physical deletion
- Maintains referential integrity
- Allows data recovery and audit compliance
- `deleted_at` timestamp for tracking

---

## Core Tables & Relationships

### Entity Relationship Overview

```
┌─────────────┐         ┌─────────────┐
│    users    │◄───────►│  customers  │
│             │         │             │
│ - id (PK)   │         │ - id (PK)   │
│ - phone     │         │ - user_id   │
│ - role      │         │ - wallet_   │
│ - is_active │         │   balance   │
└──────┬──────┘         └──────┬──────┘
       │                       │
       │                       │
       │                       │ Has many
       │                       ▼
       │                ┌──────────────┐
       │                │  addresses   │
       │                │              │
       │                │ - id (PK)    │
       │                │ - customer   │
       │                │ - society    │
       │                │ - tower      │
       │                │ - unit       │
       │                └──────┬───────┘
       │                       │
       │                       │ References
       │                       ▼
       │                ┌──────────────┐      ┌──────────────┐
       │                │  societies   │      │    orders    │
       │                │              │      │              │
       │                │ - id (PK)    │      │ - id (PK)    │
       │                │ - name       │      │ - customer   │
       │                └──────┬───────┘      │ - total      │
       │                       │              │ - status     │
       │                       │ Has many     │ - delivery   │
       │                       ▼              │   _date      │
       │                ┌──────────────┐      └──────┬───────┘
       │                │    towers    │             │
       │                │              │             │ Has many
       │                │ - id (PK)    │             ▼
       │                │ - society_id │      ┌──────────────┐
       │                │ - name       │      │ order_items  │
       │                └──────┬───────┘      │ (line items) │
       │                       │              └──────────────┘
       │                       │ Has many
       │                       ▼
       │                ┌──────────────┐
       │                │    units     │
       │                │ (apartments) │
       │                └──────────────┘
       │
       │
       ├──────────────────────────┐
       │                          │
       │ if role=distributor      │ if role=admin
       ▼                          ▼
┌──────────────┐         ┌──────────────┐
│ distributors │         │    admins    │
│              │         │              │
│ - id (PK)    │         │              │
│ - user_id    │         └──────────────┘
│ - vehicle_#  │
│ - rating     │
└──────┬───────┘
       │
       │ Assigned to
       ▼
┌─────────────────────────┐
│ distributor_building_   │
│     assignments         │
│                         │
│ - distributor_id        │
│ - society_id            │
│ - tower_id (optional)   │
└─────────────────────────┘
```

### User & Auth Tables

#### **users** (Core user table)
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone TEXT NOT NULL,  -- Format: +919876543210
    name TEXT NOT NULL,
    email TEXT,
    role user_role NOT NULL DEFAULT 'customer',  -- ENUM
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    failed_login_attempts INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,  -- Account locking for security
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Constraints
    CONSTRAINT users_phone_format CHECK (phone ~ '^\+[0-9]{10,15}$'),
    CONSTRAINT users_email_format CHECK (email IS NULL OR email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT users_phone_unique UNIQUE (phone)
);
```

**Key Fields Explained**:
- `role`: ENUM('customer','distributor','admin','superadmin')
- `locked_until`: Implements account locking after failed login attempts
- `is_deleted`: Soft delete flag; deleted users kept for audit
- `phone`: Primary identifier; must be unique and E.164 format

**Indexes**:
- `idx_users_phone`: Fast lookups by phone
- `idx_users_role`: Filter active users by role
- `idx_users_email_unique`: Unique email constraint (only for active users)

#### **customers**
```sql
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id),
    wallet_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
    wallet_version INT NOT NULL DEFAULT 0,  -- Optimistic locking
    auto_deduct BOOLEAN NOT NULL DEFAULT FALSE,
    min_balance_alert NUMERIC(12,2) NOT NULL DEFAULT 100.00,
    is_wallet_locked BOOLEAN NOT NULL DEFAULT FALSE,
    wallet_locked_reason TEXT,
    wallet_locked_at TIMESTAMPTZ,
    lifetime_spent NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_orders INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    CONSTRAINT customers_balance_non_negative CHECK (wallet_balance >= 0),
    CONSTRAINT customers_lifetime_spent_non_negative CHECK (lifetime_spent >= 0)
);
```

**Key Concepts**:
- **wallet_version**: Implements optimistic locking to prevent concurrent balance updates
- **auto_deduct**: If TRUE, order payment automatically deducted from wallet
- **is_wallet_locked**: Admin can lock wallet to prevent transactions
- **lifetime_spent**: Aggregate metric; updated on successful orders

#### **distributors**
```sql
CREATE TABLE distributors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id),
    vehicle_number TEXT,
    license_number TEXT,
    assigned_areas JSONB,  -- Flexible storage for area metadata
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    rating NUMERIC(2,1) NOT NULL DEFAULT 5.0 CHECK (rating >= 0 AND rating <= 5),
    total_deliveries INT NOT NULL DEFAULT 0,
    joined_at DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Location Tables (Hierarchical)

#### **societies** (Apartment complexes/buildings)
```sql
CREATE TABLE societies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    pincode TEXT NOT NULL,
    latitude NUMERIC(10,7),
    longitude NUMERIC(10,7),
    total_units INT DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    CONSTRAINT societies_pincode_format CHECK (pincode ~ '^[0-9]{6}$')
);
```

#### **society_towers** (Buildings within a society)
```sql
CREATE TABLE society_towers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    society_id UUID NOT NULL REFERENCES societies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,  -- "A Block", "Tower 1", etc.
    floors INT NOT NULL DEFAULT 1,
    units_per_floor INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    CONSTRAINT towers_floors_positive CHECK (floors > 0),
    CONSTRAINT towers_units_positive CHECK (units_per_floor > 0),
    CONSTRAINT towers_society_name_unique UNIQUE (society_id, name)
);
```

#### **tower_units** (Individual apartments)
```sql
CREATE TABLE tower_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tower_id UUID NOT NULL REFERENCES society_towers(id) ON DELETE CASCADE,
    unit_number TEXT NOT NULL,  -- "101", "A-402", etc.
    floor INT NOT NULL,
    is_occupied BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    CONSTRAINT units_floor_positive CHECK (floor >= 0),
    CONSTRAINT units_tower_number_unique UNIQUE (tower_id, unit_number)
);
```

#### **addresses** (Customer delivery addresses)
```sql
CREATE TABLE addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    society_id UUID NOT NULL REFERENCES societies(id),
    tower_id UUID REFERENCES society_towers(id),
    unit_id UUID REFERENCES tower_units(id),
    address_line TEXT NOT NULL,  -- Full formatted address
    delivery_instructions TEXT,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Address Design Notes**:
- Hierarchical: Society → Tower → Unit
- `tower_id` and `unit_id` are optional (for standalone addresses)
- `is_default`: Customer's primary delivery address
- `is_verified`: Admin verification flag

### Product & Inventory Tables

#### **brands**
```sql
CREATE TABLE brands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    logo_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### **products**
```sql
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES brands(id),
    name TEXT NOT NULL,
    description TEXT,
    unit_size TEXT NOT NULL,  -- "500ml", "1L", "250g", etc.
    base_price NUMERIC(10,2) NOT NULL,
    category TEXT NOT NULL,  -- "dairy", "grocery", etc.
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    stock_quantity INT NOT NULL DEFAULT 0,
    low_stock_threshold INT NOT NULL DEFAULT 10,
    image_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    CONSTRAINT products_price_positive CHECK (base_price > 0),
    CONSTRAINT products_stock_non_negative CHECK (stock_quantity >= 0),
    CONSTRAINT products_threshold_positive CHECK (low_stock_threshold >= 0)
);
```

**Key Features**:
- `stock_quantity`: Real-time inventory tracking
- `low_stock_threshold`: Triggers reorder alerts
- `unit_size`: Flexible text field for various packaging formats

### Order Tables

#### **subscriptions** (Recurring orders)
```sql
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    address_id UUID NOT NULL REFERENCES addresses(id),
    quantity INT NOT NULL DEFAULT 1,
    frequency subscription_frequency NOT NULL,  -- ENUM: daily, alternate, custom
    status subscription_status NOT NULL DEFAULT 'active',  -- ENUM
    start_date DATE NOT NULL,
    end_date DATE,
    pause_start_date DATE,
    pause_end_date DATE,
    last_order_date DATE,
    next_order_date DATE,
    custom_days JSONB,  -- For custom frequency: [1,3,5] = Mon, Wed, Fri
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    CONSTRAINT subscriptions_quantity_positive CHECK (quantity > 0),
    CONSTRAINT subscriptions_date_logic CHECK (end_date IS NULL OR end_date >= start_date),
    CONSTRAINT subscriptions_pause_logic CHECK (
        (pause_start_date IS NULL AND pause_end_date IS NULL) OR
        (pause_start_date IS NOT NULL AND pause_end_date IS NOT NULL AND pause_end_date >= pause_start_date)
    )
);
```

**Subscription Logic**:
- `frequency`: 
  - `daily`: Every day
  - `alternate`: Every other day
  - `custom`: Specific days of week (stored in `custom_days` JSONB)
- `pause_start_date`/`pause_end_date`: Temporary pause range
- `next_order_date`: Calculated field; updated by order generation function

#### **orders** (One-time and subscription-generated)
```sql
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT UNIQUE,  -- Auto-generated: "ORD-20250110-0001"
    customer_id UUID NOT NULL REFERENCES customers(id),
    subscription_id UUID REFERENCES subscriptions(id),  -- NULL for one-time orders
    address_id UUID NOT NULL REFERENCES addresses(id),
    assigned_distributor_id UUID REFERENCES distributors(id),
    
    status order_status NOT NULL DEFAULT 'pending',  -- ENUM
    delivery_date DATE NOT NULL,
    delivery_slot TEXT,  -- "morning", "evening", etc.
    
    subtotal NUMERIC(10,2) NOT NULL,
    delivery_charge NUMERIC(10,2) NOT NULL DEFAULT 0,
    discount NUMERIC(10,2) NOT NULL DEFAULT 0,
    total_amount NUMERIC(10,2) NOT NULL,
    
    payment_id UUID REFERENCES payments(id),
    payment_status payment_status_enum NOT NULL DEFAULT 'created',
    
    notes TEXT,
    cancellation_reason TEXT,
    skip_reason TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    delivered_at TIMESTAMPTZ,
    
    CONSTRAINT orders_subtotal_non_negative CHECK (subtotal >= 0),
    CONSTRAINT orders_total_calculation CHECK (total_amount = subtotal + delivery_charge - discount),
    CONSTRAINT orders_amounts_non_negative CHECK (delivery_charge >= 0 AND discount >= 0)
);
```

**Order Status Flow**:
```
scheduled → pending → assigned → in_transit → delivered
                 ↓         ↓          ↓
            cancelled  skipped    missed
```

**Key Fields**:
- `order_number`: Human-readable; set by trigger
- `subscription_id`: Links to subscription if auto-generated
- `assigned_distributor_id`: Assigned via admin or algorithm
- `total_amount`: Calculated and verified with CHECK constraint

#### **order_items** (Line items)
```sql
-- Note: Simplified; actual schema has more fields
CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    quantity INT NOT NULL,
    unit_price NUMERIC(10,2) NOT NULL,
    line_total NUMERIC(10,2) NOT NULL,
    
    CONSTRAINT order_items_quantity_positive CHECK (quantity > 0),
    CONSTRAINT order_items_price_positive CHECK (unit_price >= 0),
    CONSTRAINT order_items_total_check CHECK (line_total = quantity * unit_price)
);
```

---

## Financial System Design

### Double-Entry Ledger System

#### **wallet_ledger** (Immutable financial record)
```sql
CREATE TABLE wallet_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id),
    entry_type ledger_entry_type NOT NULL,  -- ENUM: 'credit' or 'debit'
    amount NUMERIC(12,2) NOT NULL,
    balance_after NUMERIC(12,2) NOT NULL,
    transaction_id UUID REFERENCES wallet_transactions(id),
    description TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    CONSTRAINT ledger_amount_positive CHECK (amount > 0),
    CONSTRAINT ledger_balance_non_negative CHECK (balance_after >= 0)
);
```

**Immutability Enforced**:
```sql
-- Trigger prevents any UPDATE or DELETE on ledger
CREATE TRIGGER prevent_ledger_mutation_trigger
    BEFORE UPDATE OR DELETE ON wallet_ledger
    FOR EACH ROW EXECUTE FUNCTION prevent_ledger_mutation();
```

#### **wallet_transactions** (Transaction records)
```sql
CREATE TABLE wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id),
    tx_type wallet_tx_type NOT NULL,  -- credit, debit, hold, release
    status wallet_tx_status NOT NULL DEFAULT 'pending',  -- pending, completed, failed
    amount NUMERIC(12,2) NOT NULL,
    description TEXT NOT NULL,
    reference_type TEXT,  -- 'order', 'payment', 'refund', 'admin'
    reference_id UUID,
    idempotency_key TEXT UNIQUE,
    payment_id UUID REFERENCES payments(id),
    order_id UUID REFERENCES orders(id),
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    
    CONSTRAINT wallet_tx_amount_positive CHECK (amount > 0)
);
```

**Transaction Flow**:
1. Create transaction record with `status='pending'`
2. Execute `credit_wallet()` or `debit_wallet()` function
3. Function updates customer balance atomically
4. Function creates immutable ledger entries
5. Update transaction `status='completed'`

#### **Wallet Functions** (Financial Operations)

```sql
-- Credit wallet (add funds)
CREATE OR REPLACE FUNCTION credit_wallet(
    p_customer_id UUID,
    p_amount NUMERIC,
    p_description TEXT,
    p_transaction_id UUID DEFAULT NULL,
    p_reference_type TEXT DEFAULT NULL,
    p_reference_id TEXT DEFAULT NULL,
    p_idempotency_key UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_new_balance NUMERIC;
    v_customer_version INT;
BEGIN
    -- Check idempotency
    IF p_idempotency_key IS NOT NULL THEN
        PERFORM 1 FROM idempotency_keys WHERE key = p_idempotency_key::TEXT;
        IF FOUND THEN
            RETURN jsonb_build_object('already_processed', true);
        END IF;
    END IF;
    
    -- Row-level lock and version check
    SELECT wallet_balance, wallet_version INTO v_new_balance, v_customer_version
    FROM customers
    WHERE id = p_customer_id
    FOR UPDATE;  -- Lock row for duration of transaction
    
    -- Update balance
    v_new_balance := v_new_balance + p_amount;
    
    UPDATE customers
    SET wallet_balance = v_new_balance,
        wallet_version = wallet_version + 1,
        updated_at = now()
    WHERE id = p_customer_id;
    
    -- Create immutable ledger entry
    INSERT INTO wallet_ledger (
        customer_id, entry_type, amount, balance_after,
        transaction_id, description, metadata
    ) VALUES (
        p_customer_id, 'credit', p_amount, v_new_balance,
        p_transaction_id, p_description,
        jsonb_build_object('reference_type', p_reference_type, 'reference_id', p_reference_id)
    );
    
    -- Record idempotency
    IF p_idempotency_key IS NOT NULL THEN
        INSERT INTO idempotency_keys (key, operation_type, user_id, result)
        VALUES (p_idempotency_key::TEXT, 'credit_wallet', p_customer_id, 
                jsonb_build_object('balance', v_new_balance));
    END IF;
    
    RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$$ LANGUAGE plpgsql;
```

**Key Techniques**:
- `FOR UPDATE`: Row-level lock prevents concurrent modifications
- `wallet_version`: Optimistic locking alternative
- Idempotency check prevents duplicate transactions
- Atomic operation: All-or-nothing with transaction rollback on error

### Payment Integration

#### **payments**
```sql
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id),
    order_id UUID REFERENCES orders(id),
    
    razorpay_payment_id TEXT,
    razorpay_order_id TEXT,
    razorpay_signature TEXT,
    
    amount NUMERIC(10,2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'INR',
    status payment_status_enum NOT NULL DEFAULT 'created',
    
    payment_method TEXT,  -- 'card', 'upi', 'netbanking', 'wallet'
    
    idempotency_key TEXT UNIQUE,
    verified_at TIMESTAMPTZ,
    
    metadata JSONB,
    error_message TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    CONSTRAINT payments_amount_positive CHECK (amount > 0)
);
```

**Payment Verification Function** (Simplified):
```sql
-- Called by mobile app after Razorpay payment
CREATE OR REPLACE FUNCTION verify_razorpay_payment(
    p_payment_id TEXT,
    p_order_id TEXT,
    p_signature TEXT,
    p_idempotency_key TEXT
) RETURNS JSONB AS $$
DECLARE
    v_payment payments;
    v_expected_signature TEXT;
BEGIN
    -- Idempotency check
    PERFORM 1 FROM idempotency_keys WHERE key = p_idempotency_key;
    IF FOUND THEN
        RETURN jsonb_build_object('already_processed', true);
    END IF;
    
    -- Find payment record
    SELECT * INTO v_payment FROM payments 
    WHERE razorpay_order_id = p_order_id
    FOR UPDATE;
    
    -- Verify HMAC signature (actual implementation uses secret key)
    v_expected_signature := encode(
        hmac(p_order_id || '|' || p_payment_id, 'RAZORPAY_SECRET', 'sha256'),
        'hex'
    );
    
    IF v_expected_signature = p_signature THEN
        -- Update payment status
        UPDATE payments
        SET status = 'captured',
            razorpay_payment_id = p_payment_id,
            verified_at = now()
        WHERE id = v_payment.id;
        
        -- Credit wallet
        PERFORM credit_wallet(
            v_payment.customer_id,
            v_payment.amount,
            'Payment received',
            v_payment.id,
            'payment',
            v_payment.id::TEXT,
            p_idempotency_key::UUID
        );
        
        RETURN jsonb_build_object('success', true, 'verified', true);
    ELSE
        UPDATE payments SET status = 'failed', error_message = 'Signature mismatch'
        WHERE id = v_payment.id;
        
        RETURN jsonb_build_object('success', false, 'error', 'Invalid signature');
    END IF;
END;
$$ LANGUAGE plpgsql;
```

---

**End of Part 2**

**Next**: Part 3 - Code Implementation Examples
