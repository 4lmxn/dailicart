-- =============================================================================
-- REAL-TIME ORDER GENERATION
-- =============================================================================
-- This migration adds triggers for automatic order generation when:
-- 1. A new subscription is created
-- 2. A subscription is updated (quantity, frequency, etc.)
-- 3. A subscription is paused/resumed
-- 
-- Also adds a function to auto-calculate stock collections for distributors
-- =============================================================================

-- Function to generate orders for a single subscription for the next N days
CREATE OR REPLACE FUNCTION generate_orders_for_subscription(
    p_subscription_id UUID,
    p_days_ahead INT DEFAULT 30
)
RETURNS INT AS $$
DECLARE
    rec RECORD;
    d DATE;
    weekday INT;
    created_count INT := 0;
    existing_order UUID;
    v_order_number TEXT;
    start_date DATE := CURRENT_DATE;
    end_date DATE := CURRENT_DATE + p_days_ahead;
BEGIN
    -- Get subscription details
    SELECT * INTO rec FROM subscriptions WHERE id = p_subscription_id AND status = 'active';
    
    IF rec IS NULL THEN
        RETURN 0;
    END IF;

    d := start_date;
    WHILE d <= end_date LOOP
        -- Skip paused dates
        IF rec.pause_start_date IS NOT NULL AND rec.pause_end_date IS NOT NULL 
            AND d BETWEEN rec.pause_start_date AND rec.pause_end_date THEN
            d := d + INTERVAL '1 day';
            CONTINUE;
        END IF;

        weekday := EXTRACT(DOW FROM d);
        
        -- Frequency check
        IF rec.frequency = 'alternate' THEN
            IF MOD((d - rec.start_date)::INT, 2) <> 0 THEN
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

        -- Check existing order for this subscription + date + product
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
        ELSE
            -- Update existing order if subscription details changed (but not if already delivered/skipped)
            UPDATE orders 
            SET quantity = rec.quantity,
                total_amount = ROUND(rec.quantity * unit_price, 2),
                assigned_distributor_id = COALESCE(rec.assigned_distributor_id, assigned_distributor_id)
            WHERE id = existing_order 
              AND status IN ('scheduled', 'pending');
        END IF;

        d := d + INTERVAL '1 day';
    END LOOP;

    RETURN created_count;
END;
$$ LANGUAGE plpgsql;


-- Trigger function for subscription changes
CREATE OR REPLACE FUNCTION trigger_generate_subscription_orders()
RETURNS TRIGGER AS $$
DECLARE
    orders_created INT;
BEGIN
    -- Only generate for active subscriptions
    IF NEW.status = 'active' THEN
        -- Generate orders for next 30 days
        SELECT generate_orders_for_subscription(NEW.id, 30) INTO orders_created;
        RAISE NOTICE 'Generated % orders for subscription %', orders_created, NEW.id;
    END IF;
    
    -- If subscription was paused, update existing scheduled orders to 'skipped'
    IF NEW.pause_start_date IS NOT NULL AND NEW.pause_end_date IS NOT NULL THEN
        UPDATE orders 
        SET status = 'skipped', skip_reason = 'Vacation mode'
        WHERE subscription_id = NEW.id 
          AND delivery_date BETWEEN NEW.pause_start_date AND NEW.pause_end_date
          AND status IN ('scheduled', 'pending');
    END IF;
    
    -- If subscription was cancelled, cancel future orders
    IF NEW.status = 'cancelled' AND (TG_OP = 'UPDATE' AND OLD.status != 'cancelled') THEN
        UPDATE orders 
        SET status = 'cancelled'
        WHERE subscription_id = NEW.id 
          AND delivery_date >= CURRENT_DATE
          AND status IN ('scheduled', 'pending');
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trg_subscription_generate_orders ON subscriptions;

-- Create trigger for subscription INSERT and UPDATE
CREATE TRIGGER trg_subscription_generate_orders
    AFTER INSERT OR UPDATE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION trigger_generate_subscription_orders();


-- =============================================================================
-- STOCK COLLECTION AUTO-CALCULATION
-- =============================================================================

-- Function to calculate stock needed for a distributor on a date
CREATE OR REPLACE FUNCTION calculate_distributor_stock(
    p_distributor_id UUID,
    p_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(product_id UUID, product_name TEXT, total_quantity INT) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        o.product_id,
        p.name AS product_name,
        SUM(o.quantity)::INT AS total_quantity
    FROM orders o
    JOIN products p ON p.id = o.product_id
    WHERE o.assigned_distributor_id = p_distributor_id
      AND o.delivery_date = p_date
      AND o.status IN ('scheduled', 'pending', 'assigned', 'in_transit')
    GROUP BY o.product_id, p.name
    ORDER BY p.name;
END;
$$ LANGUAGE plpgsql;


-- Function to auto-create/update stock handover record
CREATE OR REPLACE FUNCTION upsert_stock_collection(
    p_distributor_id UUID,
    p_date DATE DEFAULT CURRENT_DATE
)
RETURNS UUID AS $$
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
    WHERE distributor_stock_handover.given_at IS NULL  -- Only update if stock not yet given
    RETURNING id INTO v_handover_id;
    
    RETURN v_handover_id;
END;
$$ LANGUAGE plpgsql;


-- Trigger function for order changes to update stock handover
CREATE OR REPLACE FUNCTION trigger_update_stock_collection()
RETURNS TRIGGER AS $$
DECLARE
    v_distributor_id UUID;
    v_date DATE;
BEGIN
    -- Get distributor and date from the order
    IF TG_OP = 'DELETE' THEN
        v_distributor_id := OLD.assigned_distributor_id;
        v_date := OLD.delivery_date;
    ELSE
        v_distributor_id := NEW.assigned_distributor_id;
        v_date := NEW.delivery_date;
    END IF;
    
    -- Only update stock for future/today dates
    IF v_date >= CURRENT_DATE AND v_distributor_id IS NOT NULL THEN
        PERFORM upsert_stock_collection(v_distributor_id, v_date);
    END IF;
    
    -- If distributor changed, also update old distributor's stock
    IF TG_OP = 'UPDATE' AND OLD.assigned_distributor_id IS DISTINCT FROM NEW.assigned_distributor_id THEN
        IF OLD.assigned_distributor_id IS NOT NULL AND OLD.delivery_date >= CURRENT_DATE THEN
            PERFORM upsert_stock_collection(OLD.assigned_distributor_id, OLD.delivery_date);
        END IF;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;


-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trg_order_update_stock ON orders;

-- Create trigger for order changes
CREATE TRIGGER trg_order_update_stock
    AFTER INSERT OR UPDATE OR DELETE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION trigger_update_stock_collection();


-- =============================================================================
-- DAILY ORDER GENERATION (for cron job or scheduled function)
-- =============================================================================
-- This should be called daily via pg_cron or Supabase scheduled function
-- to ensure orders are always generated 30 days ahead

CREATE OR REPLACE FUNCTION daily_order_generation()
RETURNS TABLE(subscription_id UUID, orders_created INT) AS $$
DECLARE
    rec RECORD;
    created INT;
BEGIN
    FOR rec IN 
        SELECT id FROM subscriptions WHERE status = 'active'
    LOOP
        SELECT generate_orders_for_subscription(rec.id, 30) INTO created;
        IF created > 0 THEN
            subscription_id := rec.id;
            orders_created := created;
            RETURN NEXT;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;


-- =============================================================================
-- INITIAL BACKFILL
-- =============================================================================
-- Run this once to generate orders for all existing active subscriptions

DO $$
DECLARE
    rec RECORD;
    total_created INT := 0;
    sub_created INT;
BEGIN
    FOR rec IN SELECT id FROM subscriptions WHERE status = 'active'
    LOOP
        SELECT generate_orders_for_subscription(rec.id, 30) INTO sub_created;
        total_created := total_created + sub_created;
    END LOOP;
    RAISE NOTICE 'Backfill complete: % orders created', total_created;
END $$;
