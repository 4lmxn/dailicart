-- Debug query to check distributor data structure
-- Run this in Supabase SQL Editor to diagnose the "My Buildings" issue

-- 1. Check if distributor exists
SELECT 'Distributor Check' as step, d.id, d.user_id, u.email, u.name
FROM distributors d
JOIN users u ON u.id = d.user_id
LIMIT 5;

-- 2. Check distributor_building_assignments
SELECT 'Assignments Check' as step, 
  dba.id, 
  dba.distributor_id, 
  dba.tower_id, 
  dba.society_id,
  dba.is_active,
  s.name as society_name,
  st.name as tower_name
FROM distributor_building_assignments dba
LEFT JOIN societies s ON s.id = dba.society_id
LEFT JOIN society_towers st ON st.id = dba.tower_id
LIMIT 10;

-- 3. Check if towers have units
SELECT 'Tower Units Check' as step,
  st.id as tower_id,
  st.name as tower_name,
  s.name as society_name,
  COUNT(tu.id) as unit_count
FROM society_towers st
LEFT JOIN societies s ON s.id = st.society_id
LEFT JOIN tower_units tu ON tu.tower_id = st.id
GROUP BY st.id, st.name, s.name
LIMIT 10;

-- 4. Check if units have subscriptions
SELECT 'Subscriptions Check' as step,
  tu.tower_id,
  st.name as tower_name,
  COUNT(DISTINCT sub.user_id) as active_subscription_count
FROM tower_units tu
LEFT JOIN society_towers st ON st.id = tu.tower_id
LEFT JOIN addresses addr ON addr.unit_id = tu.id
LEFT JOIN subscriptions sub ON sub.user_id = addr.user_id AND sub.status = 'active'
GROUP BY tu.tower_id, st.name
LIMIT 10;

-- 5. Test the function with a specific distributor
-- Replace the UUID with an actual distributor_id from step 1
-- SELECT * FROM get_distributor_buildings('YOUR-DISTRIBUTOR-ID-HERE');
