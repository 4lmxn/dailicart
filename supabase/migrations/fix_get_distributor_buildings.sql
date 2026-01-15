-- Fix: get_distributor_buildings should only return active assignments and proper unit/subscription counts
-- Also ensure debit_wallet function has proper permissions for distributor role

-- Drop existing function first
DROP FUNCTION IF EXISTS get_distributor_buildings(UUID);

-- Recreate with correct return columns
CREATE FUNCTION get_distributor_buildings(p_distributor_id UUID)
RETURNS TABLE(
    assignment_id UUID,
    society_id UUID,
    society_name TEXT,
    tower_id UUID,
    tower_name TEXT,
    floors INTEGER,
    is_active BOOLEAN,
    total_units BIGINT,
    active_subscriptions BIGINT
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        dba.id AS assignment_id,
        s.id AS society_id,
        s.name AS society_name,
        st.id AS tower_id,
        st.name AS tower_name,
        st.floors,
        dba.is_active,
        -- Count total units in this tower
        (SELECT COUNT(*) FROM tower_units tu WHERE tu.tower_id = st.id)::BIGINT AS total_units,
        -- Count active subscriptions for units in this tower
        (SELECT COUNT(DISTINCT sub.user_id) 
         FROM subscriptions sub
         JOIN addresses addr ON addr.user_id = sub.user_id
         JOIN tower_units tu ON tu.id = addr.unit_id
         WHERE tu.tower_id = st.id 
           AND sub.status = 'active'
           AND sub.end_date >= CURRENT_DATE
        )::BIGINT AS active_subscriptions
    FROM distributor_building_assignments dba
    JOIN society_towers st ON st.id = dba.tower_id
    JOIN societies s ON s.id = dba.society_id
    WHERE dba.distributor_id = p_distributor_id
      AND dba.is_active = TRUE  -- Only return active assignments
    ORDER BY s.name, st.name;
END;
$$;

-- Grant permissions for the debit_wallet function (fix mark delivered button)
GRANT EXECUTE ON FUNCTION debit_wallet TO authenticated;
