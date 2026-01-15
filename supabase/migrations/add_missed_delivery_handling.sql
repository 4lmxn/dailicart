-- Migration: Auto-mark missed deliveries and create admin alerts
-- Description: 
--   1. Function to mark past undelivered orders as 'missed'
--   2. Admin alerts table for missed deliveries
--   3. Trigger to auto-mark orders as missed at end of day

-- =============================================================================
-- ADMIN ALERTS TABLE (for missed delivery notifications)
-- =============================================================================

CREATE TABLE IF NOT EXISTS admin_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_type TEXT NOT NULL CHECK (alert_type IN ('missed_delivery', 'low_stock', 'payment_issue', 'customer_complaint', 'distributor_issue')),
    severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    
    -- References
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    distributor_id UUID REFERENCES distributors(id) ON DELETE SET NULL,
    building_id UUID REFERENCES society_towers(id) ON DELETE SET NULL,
    
    -- Status
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_by UUID REFERENCES users(id),
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_alerts_type ON admin_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_admin_alerts_unread ON admin_alerts(is_read) WHERE NOT is_read;
CREATE INDEX IF NOT EXISTS idx_admin_alerts_unresolved ON admin_alerts(is_resolved) WHERE NOT is_resolved;
CREATE INDEX IF NOT EXISTS idx_admin_alerts_created ON admin_alerts(created_at DESC);

-- =============================================================================
-- FUNCTION: Mark past orders as missed
-- =============================================================================

CREATE OR REPLACE FUNCTION mark_missed_deliveries()
RETURNS TABLE (
    orders_marked INT,
    alerts_created INT
) AS $$
DECLARE
    v_orders_marked INT := 0;
    v_alerts_created INT := 0;
    v_order RECORD;
    v_cutoff_time TIME := '14:00:00'; -- 2 PM cutoff for morning deliveries
BEGIN
    -- Find all orders that should have been delivered but weren't
    -- Criteria: delivery_date is before today, OR delivery_date is today but past cutoff time
    -- Status must be: scheduled, pending, assigned, or in_transit
    
    FOR v_order IN
        SELECT 
            o.id,
            o.order_number,
            o.delivery_date,
            o.assigned_distributor_id,
            o.status,
            u.name as customer_name,
            u.phone as customer_phone,
            d.id as dist_id,
            du.name as distributor_name,
            a.society_id,
            a.tower_id,
            s.name as society_name,
            t.name as tower_name
        FROM orders o
        JOIN users u ON o.user_id = u.id
        LEFT JOIN addresses a ON o.address_id = a.id
        LEFT JOIN societies s ON a.society_id = s.id
        LEFT JOIN society_towers t ON a.tower_id = t.id
        LEFT JOIN distributors d ON o.assigned_distributor_id = d.id
        LEFT JOIN users du ON d.user_id = du.id
        WHERE o.status IN ('scheduled', 'pending', 'assigned', 'in_transit')
        AND (
            -- Past dates
            o.delivery_date < CURRENT_DATE
            OR 
            -- Today but past cutoff (for morning slot)
            (o.delivery_date = CURRENT_DATE AND CURRENT_TIME > v_cutoff_time)
        )
    LOOP
        -- Mark order as missed
        UPDATE orders
        SET 
            status = 'missed',
            updated_at = now()
        WHERE id = v_order.id;
        
        v_orders_marked := v_orders_marked + 1;
        
        -- Create admin alert
        INSERT INTO admin_alerts (
            alert_type,
            severity,
            title,
            message,
            order_id,
            customer_id,
            distributor_id,
            building_id,
            metadata
        )
        SELECT
            'missed_delivery',
            CASE 
                WHEN v_order.delivery_date < CURRENT_DATE - INTERVAL '1 day' THEN 'critical'
                WHEN v_order.delivery_date < CURRENT_DATE THEN 'high'
                ELSE 'medium'
            END,
            'Missed Delivery: Order #' || v_order.order_number,
            'Order #' || v_order.order_number || ' for ' || COALESCE(v_order.customer_name, 'Unknown') || 
            ' at ' || COALESCE(v_order.society_name, '') || ' ' || COALESCE(v_order.tower_name, '') ||
            ' was not delivered on ' || to_char(v_order.delivery_date, 'DD Mon YYYY') ||
            CASE WHEN v_order.distributor_name IS NOT NULL 
                THEN '. Assigned to: ' || v_order.distributor_name 
                ELSE '. No distributor assigned!'
            END,
            v_order.id,
            (SELECT user_id FROM orders WHERE id = v_order.id),
            v_order.dist_id,
            v_order.tower_id,
            jsonb_build_object(
                'order_number', v_order.order_number,
                'delivery_date', v_order.delivery_date,
                'previous_status', v_order.status,
                'customer_phone', v_order.customer_phone,
                'society', v_order.society_name,
                'tower', v_order.tower_name
            )
        WHERE NOT EXISTS (
            -- Don't create duplicate alerts
            SELECT 1 FROM admin_alerts 
            WHERE order_id = v_order.id 
            AND alert_type = 'missed_delivery'
        );
        
        IF FOUND THEN
            v_alerts_created := v_alerts_created + 1;
        END IF;
    END LOOP;
    
    RETURN QUERY SELECT v_orders_marked, v_alerts_created;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- FUNCTION: Get admin alerts summary
-- =============================================================================

CREATE OR REPLACE FUNCTION get_admin_alerts_summary()
RETURNS TABLE (
    total_unread INT,
    missed_deliveries INT,
    critical_alerts INT,
    high_priority INT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*) FILTER (WHERE NOT is_read)::INT as total_unread,
        COUNT(*) FILTER (WHERE alert_type = 'missed_delivery' AND NOT is_resolved)::INT as missed_deliveries,
        COUNT(*) FILTER (WHERE severity = 'critical' AND NOT is_resolved)::INT as critical_alerts,
        COUNT(*) FILTER (WHERE severity = 'high' AND NOT is_resolved)::INT as high_priority
    FROM admin_alerts;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- FUNCTION: Skip orders for paused subscriptions
-- =============================================================================

CREATE OR REPLACE FUNCTION skip_orders_for_paused_subscriptions()
RETURNS INT AS $$
DECLARE
    v_count INT := 0;
BEGIN
    -- Mark orders as skipped if the subscription is paused for that date
    UPDATE orders o
    SET 
        status = 'skipped',
        skip_reason = 'Subscription paused by customer',
        updated_at = now()
    FROM subscriptions s
    WHERE o.subscription_id = s.id
    AND o.status IN ('scheduled', 'pending')
    AND s.status = 'paused'
    AND o.delivery_date >= COALESCE(s.pause_start_date, CURRENT_DATE)
    AND o.delivery_date <= COALESCE(s.pause_end_date, CURRENT_DATE + INTERVAL '30 days');
    
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- SCHEDULED JOB FUNCTION: Run daily to update order statuses
-- Call this via pg_cron or external scheduler
-- =============================================================================

CREATE OR REPLACE FUNCTION daily_order_status_update()
RETURNS JSONB AS $$
DECLARE
    v_skipped INT;
    v_missed RECORD;
    v_result JSONB;
BEGIN
    -- First, skip orders for paused subscriptions
    v_skipped := skip_orders_for_paused_subscriptions();
    
    -- Then, mark missed deliveries
    SELECT * INTO v_missed FROM mark_missed_deliveries();
    
    v_result := jsonb_build_object(
        'timestamp', now(),
        'orders_skipped_due_to_pause', v_skipped,
        'orders_marked_missed', v_missed.orders_marked,
        'alerts_created', v_missed.alerts_created
    );
    
    RAISE NOTICE 'Daily order status update: %', v_result;
    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE admin_alerts IS 'Stores alerts for admin dashboard - missed deliveries, issues, etc.';
COMMENT ON FUNCTION mark_missed_deliveries() IS 'Marks past undelivered orders as missed and creates admin alerts';
COMMENT ON FUNCTION skip_orders_for_paused_subscriptions() IS 'Automatically skips orders when subscription is paused';
COMMENT ON FUNCTION daily_order_status_update() IS 'Daily job to update all order statuses - call via scheduler';

-- =============================================================================
-- TRIGGER: Auto-update timestamps
-- =============================================================================

CREATE OR REPLACE FUNCTION update_admin_alerts_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_admin_alerts_timestamp ON admin_alerts;
CREATE TRIGGER trg_admin_alerts_timestamp
    BEFORE UPDATE ON admin_alerts
    FOR EACH ROW
    EXECUTE FUNCTION update_admin_alerts_timestamp();
