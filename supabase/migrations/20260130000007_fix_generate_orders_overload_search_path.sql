-- Migration: Fix search_path for generate_subscription_orders overload
-- Applied: 2026-01-30
-- Purpose: Fix security warning for the (date, date, uuid) overload of generate_subscription_orders

CREATE OR REPLACE FUNCTION public.generate_subscription_orders(p_start date, p_end date, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(orders_created integer, orders_updated integer)
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
DECLARE
    rec RECORD;
    d DATE;
    weekday INT;
    created_count INT := 0;
    updated_count INT := 0;
    existing_order UUID;
    v_order_number TEXT;
    lock_key BIGINT;
BEGIN
    -- Advisory lock to prevent concurrent order generation
    -- Use a hash of user_id or 0 for all-users generation
    lock_key := COALESCE(hashtext(p_user_id::text), 0);
    
    -- Try to acquire advisory lock, fail if already running
    IF NOT pg_try_advisory_xact_lock(lock_key) THEN
        RAISE NOTICE 'Order generation already in progress for this scope';
        RETURN;
    END IF;

    FOR rec IN
        SELECT s.*, s.unit_price_locked as unit_price
        FROM subscriptions s
        WHERE s.status = 'active'
            AND (p_user_id IS NULL OR s.user_id = p_user_id)
    LOOP
        d := p_start;
        WHILE d <= p_end LOOP
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

            -- Check existing order (with FOR UPDATE to prevent race)
            SELECT id INTO existing_order 
            FROM orders 
            WHERE subscription_id = rec.id AND delivery_date = d AND product_id = rec.product_id
            FOR UPDATE SKIP LOCKED
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
                    rec.product_id, rec.quantity, rec.unit_price, 
                    ROUND(rec.quantity * rec.unit_price, 2), 
                    'scheduled', 'created', rec.assigned_distributor_id
                )
                ON CONFLICT (subscription_id, delivery_date, product_id) DO NOTHING;
                
                IF FOUND THEN
                    created_count := created_count + 1;
                END IF;
            ELSE
                updated_count := updated_count + 1;
            END IF;

            d := d + INTERVAL '1 day';
        END LOOP;
    END LOOP;

    RETURN QUERY SELECT created_count, updated_count;
END;$function$;
