-- =============================================================================
-- FIX DUPLICATE ORDERS
-- =============================================================================
-- This migration:
-- 1. Removes duplicate orders (keeping the first by created_at)
-- 2. Adds a unique constraint to prevent future duplicates
-- =============================================================================

-- Step 1: Identify and delete duplicate orders (keep first created)
-- Duplicates are defined as same subscription_id + delivery_date + product_id
WITH duplicates AS (
    SELECT id, ROW_NUMBER() OVER (
        PARTITION BY subscription_id, delivery_date, product_id
        ORDER BY created_at ASC, id ASC
    ) as rn
    FROM orders
    WHERE subscription_id IS NOT NULL
)
DELETE FROM orders 
WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);

-- Step 2: Add unique constraint for subscription-based orders
-- This prevents the trigger from creating duplicate orders
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_subscription_date_product_unique 
ON orders (subscription_id, delivery_date, product_id) 
WHERE subscription_id IS NOT NULL AND status NOT IN ('cancelled', 'failed');

-- Step 3: Also add unique constraint for one-time orders (no subscription)
-- based on user_id + delivery_date + product_id + order_number uniqueness
-- (order_number is already unique so this is fine)

-- Output summary
DO $$
DECLARE
    v_count INT;
BEGIN
    SELECT COUNT(*) INTO v_count FROM orders;
    RAISE NOTICE 'Total orders after cleanup: %', v_count;
END $$;
