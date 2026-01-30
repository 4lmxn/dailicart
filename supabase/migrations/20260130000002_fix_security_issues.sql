-- Fix generate_subscription_orders function search_path (security)
CREATE OR REPLACE FUNCTION public.generate_subscription_orders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  orders_created integer := 0;
  today date := CURRENT_DATE;
  v_subscription record;
  v_distributor_id uuid;
  v_address record;
  v_lock_acquired boolean;
BEGIN
  -- Try to acquire advisory lock to prevent concurrent execution
  SELECT pg_try_advisory_xact_lock(hashtext('generate_subscription_orders')) INTO v_lock_acquired;
  
  IF NOT v_lock_acquired THEN
    RAISE NOTICE 'Another order generation is in progress, skipping...';
    RETURN 0;
  END IF;

  FOR v_subscription IN
    SELECT s.id, s.user_id, s.product_id, s.quantity, s.address_id
    FROM subscriptions s
    WHERE s.status = 'active'
      AND s.next_delivery_date = today
      AND NOT EXISTS (
        SELECT 1 FROM orders o 
        WHERE o.subscription_id = s.id 
          AND o.delivery_date = today
          AND o.product_id = s.product_id
      )
  LOOP
    -- Get address info for distributor lookup
    SELECT a.tower_id INTO v_address
    FROM addresses a
    WHERE a.id = v_subscription.address_id;
    
    -- Find assigned distributor for the tower
    SELECT dba.distributor_id INTO v_distributor_id
    FROM distributor_building_assignments dba
    WHERE dba.tower_id = v_address.tower_id
      AND dba.is_active = true
    LIMIT 1;

    -- Insert order with ON CONFLICT to handle race conditions
    INSERT INTO orders (
      subscription_id,
      user_id,
      address_id,
      delivery_date,
      status,
      product_id,
      quantity,
      distributor_id
    ) VALUES (
      v_subscription.id,
      v_subscription.user_id,
      v_subscription.address_id,
      today,
      'pending',
      v_subscription.product_id,
      v_subscription.quantity,
      v_distributor_id
    )
    ON CONFLICT ON CONSTRAINT orders_subscription_date_product_unique DO NOTHING;
    
    IF FOUND THEN
      orders_created := orders_created + 1;
    END IF;
    
    -- Update next delivery date based on frequency
    UPDATE subscriptions
    SET next_delivery_date = 
      CASE frequency
        WHEN 'daily' THEN today + interval '1 day'
        WHEN 'weekly' THEN today + interval '7 days'
        WHEN 'biweekly' THEN today + interval '14 days'
        WHEN 'monthly' THEN today + interval '1 month'
        WHEN 'alternate_days' THEN today + interval '2 days'
        WHEN 'weekdays' THEN 
          CASE EXTRACT(DOW FROM today)
            WHEN 5 THEN today + interval '3 days'  -- Friday -> Monday
            WHEN 6 THEN today + interval '2 days'  -- Saturday -> Monday
            ELSE today + interval '1 day'
          END
        ELSE today + interval '1 day'
      END
    WHERE id = v_subscription.id;
  END LOOP;

  RETURN orders_created;
END;
$$;

-- Drop the overly permissive audit_log INSERT policy
DROP POLICY IF EXISTS "audit_log_service_insert" ON audit_log;

-- Drop duplicate constraint (keeps the index from unique constraint)
ALTER TABLE distributor_stock_handover DROP CONSTRAINT IF EXISTS distributor_stock_handover_distributor_date_unique;

COMMENT ON FUNCTION public.generate_subscription_orders() IS 'Generates daily orders from active subscriptions with race condition protection';
