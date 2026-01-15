-- Fix remaining functions with mutable search_path
-- Applied: fix_remaining_search_paths_v3

DROP FUNCTION IF EXISTS trigger_generate_subscription_orders() CASCADE;
DROP FUNCTION IF EXISTS generate_activation_code();
DROP FUNCTION IF EXISTS create_activation_code(text, integer);
DROP FUNCTION IF EXISTS generate_orders_for_subscription(uuid, integer);

CREATE OR REPLACE FUNCTION trigger_generate_subscription_orders()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.status = 'active' AND (OLD IS NULL OR OLD.status != 'active') THEN
        PERFORM generate_orders_for_subscription(NEW.id, 7);
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION generate_activation_code()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_code TEXT;
    v_exists BOOLEAN;
BEGIN
    LOOP
        v_code := upper(substr(md5(random()::text), 1, 8));
        SELECT EXISTS(SELECT 1 FROM distributor_activation_codes WHERE code = v_code) INTO v_exists;
        EXIT WHEN NOT v_exists;
    END LOOP;
    RETURN v_code;
END;
$$;

CREATE OR REPLACE FUNCTION create_activation_code(
    p_notes TEXT DEFAULT NULL,
    p_expires_in_days INTEGER DEFAULT 30
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_code TEXT;
BEGIN
    v_code := generate_activation_code();
    INSERT INTO distributor_activation_codes (code, notes, expires_at)
    VALUES (v_code, p_notes, NOW() + (p_expires_in_days || ' days')::INTERVAL);
    RETURN v_code;
END;
$$;

CREATE OR REPLACE FUNCTION generate_orders_for_subscription(
    p_subscription_id UUID, 
    p_days_ahead INTEGER DEFAULT 7
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sub subscriptions%ROWTYPE;
    v_address addresses%ROWTYPE;
    v_product products%ROWTYPE;
    v_distributor_id UUID;
    v_order_count INT := 0;
    v_date DATE;
    v_day_of_week INT;
    v_end_date DATE;
    v_skip_date DATE;
BEGIN
    SELECT * INTO v_sub FROM subscriptions WHERE id = p_subscription_id;
    IF v_sub.id IS NULL OR v_sub.status != 'active' THEN
        RETURN 0;
    END IF;
    
    SELECT * INTO v_address FROM addresses WHERE user_id = v_sub.user_id AND is_default = TRUE LIMIT 1;
    IF v_address.id IS NULL THEN
        RETURN 0;
    END IF;
    
    SELECT * INTO v_product FROM products WHERE id = v_sub.product_id;
    IF v_product.id IS NULL THEN
        RETURN 0;
    END IF;
    
    SELECT distributor_id INTO v_distributor_id 
    FROM distributor_building_assignments 
    WHERE tower_id = v_address.tower_id AND is_active = TRUE 
    LIMIT 1;
    
    v_end_date := LEAST(CURRENT_DATE + p_days_ahead, COALESCE(v_sub.end_date, CURRENT_DATE + p_days_ahead));
    
    FOR v_date IN SELECT generate_series(CURRENT_DATE, v_end_date, '1 day'::interval)::date LOOP
        v_day_of_week := EXTRACT(DOW FROM v_date)::INT;
        
        IF NOT (v_sub.schedule ? v_day_of_week::text) THEN
            CONTINUE;
        END IF;
        
        IF v_sub.skip_dates IS NOT NULL THEN
            SELECT skip_date INTO v_skip_date 
            FROM jsonb_array_elements_text(v_sub.skip_dates) AS skip_date 
            WHERE skip_date::date = v_date 
            LIMIT 1;
            IF v_skip_date IS NOT NULL THEN
                CONTINUE;
            END IF;
        END IF;
        
        INSERT INTO orders (
            user_id, subscription_id, product_id, address_id,
            quantity, unit_price, total_amount, delivery_date,
            assigned_distributor_id, status
        ) VALUES (
            v_sub.user_id, v_sub.id, v_sub.product_id, v_address.id,
            (v_sub.schedule->v_day_of_week::text)::numeric,
            v_product.price,
            (v_sub.schedule->v_day_of_week::text)::numeric * v_product.price,
            v_date, v_distributor_id, 'scheduled'
        )
        ON CONFLICT (subscription_id, delivery_date) DO NOTHING;
        
        IF FOUND THEN
            v_order_count := v_order_count + 1;
        END IF;
    END LOOP;
    
    RETURN v_order_count;
END;
$$;

CREATE TRIGGER trg_generate_orders_on_subscription
    AFTER INSERT OR UPDATE OF status ON subscriptions
    FOR EACH ROW
    WHEN (NEW.status = 'active')
    EXECUTE FUNCTION trigger_generate_subscription_orders();

-- Add RLS policies for internal tables
CREATE POLICY "Service role only for otp_requests" ON otp_requests
    FOR ALL TO service_role USING (true);
CREATE POLICY "Deny all authenticated access to otp_requests" ON otp_requests
    FOR ALL TO authenticated USING (false);
CREATE POLICY "Service role only for rate_limits" ON rate_limits
    FOR ALL TO service_role USING (true);
CREATE POLICY "Deny all authenticated access to rate_limits" ON rate_limits
    FOR ALL TO authenticated USING (false);

GRANT EXECUTE ON FUNCTION trigger_generate_subscription_orders TO authenticated;
GRANT EXECUTE ON FUNCTION generate_activation_code TO authenticated;
GRANT EXECUTE ON FUNCTION create_activation_code TO authenticated;
GRANT EXECUTE ON FUNCTION generate_orders_for_subscription TO authenticated;
