-- Quick fix: Mark all past scheduled orders as missed
-- Run this directly in Supabase SQL Editor

-- First, let's see what orders will be affected
SELECT 
    id, 
    order_number, 
    delivery_date, 
    status 
FROM orders 
WHERE status IN ('scheduled', 'pending', 'assigned', 'in_transit')
AND delivery_date < CURRENT_DATE;

-- Now update them to 'missed'
UPDATE orders
SET 
    status = 'missed',
    updated_at = now()
WHERE status IN ('scheduled', 'pending', 'assigned', 'in_transit')
AND delivery_date < CURRENT_DATE;

-- Check how many were updated
-- Should show: UPDATE X (where X is the number of orders marked as missed)
