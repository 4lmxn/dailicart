-- =============================================================================
-- Server-side RPC functions for delivery skip/unskip operations
-- Moves business logic from client to server for better reliability & security
-- =============================================================================

-- Skip delivery for a specific date
-- Returns: success boolean, message text
CREATE OR REPLACE FUNCTION skip_delivery(
    p_user_id UUID,
    p_delivery_date DATE,
    p_reason TEXT DEFAULT 'Skipped by customer'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_today DATE := CURRENT_DATE;
    v_cutoff_hour INT := 4; -- 4 AM cutoff for same-day modifications
    v_current_hour INT;
    v_existing_orders RECORD;
    v_orders_updated INT := 0;
    v_orders_created INT := 0;
BEGIN
    -- Validation: Check if date is in the past
    IF p_delivery_date < v_today THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'PAST_DATE',
            'message', 'Cannot skip a past delivery'
        );
    END IF;
    
    -- Validation: Check same-day cutoff (4 AM)
    IF p_delivery_date = v_today THEN
        SELECT EXTRACT(HOUR FROM NOW() AT TIME ZONE 'Asia/Kolkata') INTO v_current_hour;
        IF v_current_hour >= v_cutoff_hour THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'CUTOFF_PASSED',
                'message', 'Same-day modifications not allowed after 4 AM'
            );
        END IF;
    END IF;
    
    -- Check if orders already exist for this date
    SELECT 
        COUNT(*) FILTER (WHERE status = 'skipped') as skipped_count,
        COUNT(*) as total_count
    INTO v_existing_orders
    FROM orders
    WHERE user_id = p_user_id AND delivery_date = p_delivery_date;
    
    -- If all orders already skipped, return early
    IF v_existing_orders.total_count > 0 AND v_existing_orders.skipped_count = v_existing_orders.total_count THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'ALREADY_SKIPPED',
            'message', 'This day is already skipped'
        );
    END IF;
    
    -- Update existing orders that can be skipped
    IF v_existing_orders.total_count > 0 THEN
        UPDATE orders
        SET 
            status = 'skipped',
            skip_reason = p_reason,
            updated_at = NOW()
        WHERE user_id = p_user_id
          AND delivery_date = p_delivery_date
          AND status IN ('scheduled', 'pending', 'assigned', 'in_transit');
        
        GET DIAGNOSTICS v_orders_updated = ROW_COUNT;
    ELSE
        -- No orders exist yet - create skipped orders from active subscriptions
        INSERT INTO orders (
            order_number,
            user_id,
            address_id,
            product_id,
            quantity,
            unit_price,
            total_amount,
            delivery_date,
            status,
            subscription_id,
            skip_reason
        )
        SELECT 
            'ORD-' || TO_CHAR(NOW(), 'YYYYMMDDHH24MISS') || '-' || 
                LPAD((ROW_NUMBER() OVER())::TEXT, 3, '0') || '-' ||
                SUBSTR(MD5(RANDOM()::TEXT), 1, 6),
            s.user_id,
            s.address_id,
            s.product_id,
            s.quantity,
            p.price,
            s.quantity * p.price,
            p_delivery_date,
            'skipped'::order_status,
            s.id,
            p_reason
        FROM subscriptions s
        JOIN products p ON p.id = s.product_id
        WHERE s.user_id = p_user_id
          AND s.status = 'active';
        
        GET DIAGNOSTICS v_orders_created = ROW_COUNT;
    END IF;
    
    RETURN jsonb_build_object(
        'success', true,
        'orders_updated', v_orders_updated,
        'orders_created', v_orders_created,
        'message', 'Delivery skipped successfully'
    );
END;
$$;

-- Unskip (resume) delivery for a specific date
CREATE OR REPLACE FUNCTION unskip_delivery(
    p_user_id UUID,
    p_delivery_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_today DATE := CURRENT_DATE;
    v_cutoff_hour INT := 4;
    v_current_hour INT;
    v_orders_updated INT := 0;
BEGIN
    -- Validation: Check if date is in the past
    IF p_delivery_date < v_today THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'PAST_DATE',
            'message', 'Cannot resume a past delivery'
        );
    END IF;
    
    -- Validation: Check same-day cutoff (4 AM)
    IF p_delivery_date = v_today THEN
        SELECT EXTRACT(HOUR FROM NOW() AT TIME ZONE 'Asia/Kolkata') INTO v_current_hour;
        IF v_current_hour >= v_cutoff_hour THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'CUTOFF_PASSED',
                'message', 'Same-day modifications not allowed after 4 AM'
            );
        END IF;
    END IF;
    
    -- Update skipped orders back to scheduled
    UPDATE orders
    SET 
        status = 'scheduled',
        skip_reason = NULL,
        updated_at = NOW()
    WHERE user_id = p_user_id
      AND delivery_date = p_delivery_date
      AND status = 'skipped';
    
    GET DIAGNOSTICS v_orders_updated = ROW_COUNT;
    
    IF v_orders_updated = 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'NO_SKIPPED_ORDERS',
            'message', 'No skipped orders found for this date'
        );
    END IF;
    
    RETURN jsonb_build_object(
        'success', true,
        'orders_updated', v_orders_updated,
        'message', 'Delivery resumed successfully'
    );
END;
$$;

-- Apply vacation (skip multiple dates)
CREATE OR REPLACE FUNCTION apply_vacation(
    p_user_id UUID,
    p_start_date DATE,
    p_end_date DATE,
    p_reason TEXT DEFAULT 'On vacation'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_today DATE := CURRENT_DATE;
    v_cutoff_hour INT := 4;
    v_current_hour INT;
    v_current_date DATE;
    v_total_skipped INT := 0;
    v_result JSONB;
BEGIN
    -- Validation: Start date must be today or future
    IF p_start_date < v_today THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'PAST_DATE',
            'message', 'Vacation start date cannot be in the past'
        );
    END IF;
    
    -- Validation: End date must be >= start date
    IF p_end_date < p_start_date THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'INVALID_RANGE',
            'message', 'End date must be after start date'
        );
    END IF;
    
    -- Validation: Max 30 days vacation
    IF p_end_date - p_start_date > 30 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'TOO_LONG',
            'message', 'Vacation cannot exceed 30 days'
        );
    END IF;
    
    -- If start date is today, check cutoff
    IF p_start_date = v_today THEN
        SELECT EXTRACT(HOUR FROM NOW() AT TIME ZONE 'Asia/Kolkata') INTO v_current_hour;
        IF v_current_hour >= v_cutoff_hour THEN
            -- Start from tomorrow instead
            p_start_date := v_today + 1;
        END IF;
    END IF;
    
    -- Skip each day in the range
    v_current_date := p_start_date;
    WHILE v_current_date <= p_end_date LOOP
        -- Call skip_delivery for each date
        SELECT skip_delivery(p_user_id, v_current_date, p_reason) INTO v_result;
        
        IF (v_result->>'success')::boolean THEN
            v_total_skipped := v_total_skipped + 1;
        END IF;
        
        v_current_date := v_current_date + 1;
    END LOOP;
    
    RETURN jsonb_build_object(
        'success', true,
        'days_skipped', v_total_skipped,
        'start_date', p_start_date,
        'end_date', p_end_date,
        'message', format('Vacation applied: %s days skipped', v_total_skipped)
    );
END;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION skip_delivery(UUID, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION unskip_delivery(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION apply_vacation(UUID, DATE, DATE, TEXT) TO authenticated;

-- Add comments for documentation
COMMENT ON FUNCTION skip_delivery IS 'Skip delivery for a specific date. Handles both existing orders and creates skipped orders from subscriptions.';
COMMENT ON FUNCTION unskip_delivery IS 'Resume a previously skipped delivery.';
COMMENT ON FUNCTION apply_vacation IS 'Skip deliveries for a date range (max 30 days).';
