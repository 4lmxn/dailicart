-- Migration: Create view and index for pending address change requests
-- Part 2 of address_change category setup (enum must be committed first)

-- Create view for pending address change requests (for admin dashboard)
CREATE OR REPLACE VIEW pending_address_changes AS
SELECT 
    t.id AS ticket_id,
    t.ticket_number,
    t.user_id,
    u.name AS customer_name,
    u.phone AS customer_phone,
    t.subject,
    t.description,
    t.status,
    t.priority,
    t.created_at,
    a.id AS current_address_id,
    s.name AS current_society,
    st.name AS current_tower,
    tu.number AS current_unit
FROM support_tickets t
JOIN users u ON u.id = t.user_id
LEFT JOIN addresses a ON a.user_id = t.user_id AND a.is_default = true
LEFT JOIN societies s ON s.id = a.society_id
LEFT JOIN society_towers st ON st.id = a.tower_id
LEFT JOIN tower_units tu ON tu.id = a.unit_id
WHERE t.category = 'address_change'
  AND t.status NOT IN ('resolved', 'closed');

-- Add index for faster address change ticket lookups
CREATE INDEX IF NOT EXISTS idx_support_tickets_address_change 
    ON support_tickets(category, status) 
    WHERE category = 'address_change' AND status NOT IN ('resolved', 'closed');

-- Comment for documentation
COMMENT ON VIEW pending_address_changes IS 'Shows pending address change requests from customers. Admin uses this to review and process address modifications.';
