-- =============================================================
-- iDaily SEED DATA V3 - Edge Cases & Test Scenarios
-- Run AFTER 00_fresh_database_setup.sql
-- =============================================================

-- =============================================================================
-- 1. USERS - Using generate_series for efficiency
-- =============================================================================

-- Admins (3)
INSERT INTO users (id, phone, name, email, role) VALUES
    ('10000000000000000000000000000001', '+919999900001', 'Super Admin', 'superadmin@idaily.in', 'superadmin'),
    ('10000000000000000000000000000002', '+919999900002', 'Admin User', 'admin@idaily.in', 'admin'),
    ('10000000000000000000000000000003', '+919999900003', 'Support Admin', 'support@idaily.in', 'admin');

-- Distributors (4) - Including edge cases
INSERT INTO users (id, phone, name, email, role, is_active) VALUES
    ('20000000000000000000000000000001', '+919888800001', 'Ramesh Kumar', 'ramesh@idaily.in', 'distributor', true),
    ('20000000000000000000000000000002', '+919888800002', 'Suresh Patil', 'suresh@idaily.in', 'distributor', true),
    ('20000000000000000000000000000003', '+919888800003', 'Mahesh Gowda', 'mahesh@idaily.in', 'distributor', true),
    ('20000000000000000000000000000004', '+919888800004', 'Inactive Dist', 'inactive@idaily.in', 'distributor', false); -- EDGE: Inactive

-- Customers (15) - Various edge cases
INSERT INTO users (id, phone, name, email, role, is_active) VALUES
    ('30000000000000000000000000000001', '+919777700001', 'Priya Sharma', 'priya@gmail.com', 'customer', true),
    ('30000000000000000000000000000002', '+919777700002', 'Rahul Verma', 'rahul@gmail.com', 'customer', true),
    ('30000000000000000000000000000003', '+919777700003', 'Anjali Reddy', 'anjali@gmail.com', 'customer', true),
    ('30000000000000000000000000000004', '+919777700004', 'Vikram Singh', 'vikram@gmail.com', 'customer', true),
    ('30000000000000000000000000000005', '+919777700005', 'Sneha Nair', 'sneha@gmail.com', 'customer', true),
    ('30000000000000000000000000000006', '+919777700006', 'Amit Patel', 'amit@gmail.com', 'customer', true),
    ('30000000000000000000000000000007', '+919777700007', 'Kavitha Rao', 'kavitha@gmail.com', 'customer', true),
    ('30000000000000000000000000000008', '+919777700008', 'Deepak Joshi', 'deepak@gmail.com', 'customer', true),
    ('30000000000000000000000000000009', '+919777700009', 'Meera Iyer', 'meera@gmail.com', 'customer', true),
    ('30000000000000000000000000000010', '+919777700010', 'Arjun Menon', 'arjun@gmail.com', 'customer', true),
    ('30000000000000000000000000000011', '+919777700011', 'Zero Balance', 'zero@gmail.com', 'customer', true),      -- EDGE: Zero wallet
    ('30000000000000000000000000000012', '+919777700012', 'Locked Wallet', 'locked@gmail.com', 'customer', true),   -- EDGE: Locked wallet
    ('30000000000000000000000000000013', '+919777700013', 'No Address', 'noaddr@gmail.com', 'customer', true),      -- EDGE: No address
    ('30000000000000000000000000000014', '+919777700014', 'Multi Addr', 'multi@gmail.com', 'customer', true),       -- EDGE: Multiple addresses
    ('30000000000000000000000000000015', '+919777700015', 'Inactive Cust', 'inactive.cust@gmail.com', 'customer', false); -- EDGE: Inactive

-- =============================================================================
-- 2. CUSTOMERS TABLE - Wallet edge cases
-- =============================================================================

INSERT INTO customers (id, user_id, wallet_balance, auto_deduct, is_wallet_locked) VALUES
    ('40000000000000000000000000000001', '30000000000000000000000000000001', 500.00, true, false),
    ('40000000000000000000000000000002', '30000000000000000000000000000002', 1200.00, true, false),
    ('40000000000000000000000000000003', '30000000000000000000000000000003', 350.00, false, false),    -- EDGE: Auto-deduct OFF
    ('40000000000000000000000000000004', '30000000000000000000000000000004', 25.00, true, false),      -- EDGE: Exactly one delivery's worth
    ('40000000000000000000000000000005', '30000000000000000000000000000005', 10.00, true, false),      -- EDGE: Insufficient for delivery
    ('40000000000000000000000000000006', '30000000000000000000000000000006', 2500.00, true, false),
    ('40000000000000000000000000000007', '30000000000000000000000000000007', 150.00, true, false),
    ('40000000000000000000000000000008', '30000000000000000000000000000008', 600.00, false, false),
    ('40000000000000000000000000000009', '30000000000000000000000000000009', 1000.00, true, false),
    ('40000000000000000000000000000010', '30000000000000000000000000000010', 450.00, true, false),
    ('40000000000000000000000000000011', '30000000000000000000000000000011', 0.00, true, false),       -- EDGE: Zero balance
    ('40000000000000000000000000000012', '30000000000000000000000000000012', 1000.00, true, true),     -- EDGE: Locked wallet
    ('40000000000000000000000000000013', '30000000000000000000000000000013', 500.00, true, false),
    ('40000000000000000000000000000014', '30000000000000000000000000000014', 800.00, true, false),
    ('40000000000000000000000000000015', '30000000000000000000000000000015', 100.00, true, false);

-- =============================================================================
-- 3. DISTRIBUTORS
-- =============================================================================

INSERT INTO distributors (id, user_id, vehicle_number, is_active, commission_rate) VALUES
    ('50000000000000000000000000000001', '20000000000000000000000000000001', 'KA-01-AB-1234', true, 10.00),
    ('50000000000000000000000000000002', '20000000000000000000000000000002', 'KA-01-CD-5678', true, 12.50),
    ('50000000000000000000000000000003', '20000000000000000000000000000003', 'KA-01-EF-9012', true, 10.00),
    ('50000000000000000000000000000004', '20000000000000000000000000000004', 'KA-01-GH-3456', false, 10.00); -- EDGE: Inactive

-- =============================================================================
-- 4. BRANDS & PRODUCTS - Including inactive
-- =============================================================================

INSERT INTO brands (id, name, description, is_active) VALUES
    ('60000000000000000000000000000001', 'Nandini', 'Karnataka Milk Federation', true),
    ('60000000000000000000000000000002', 'Amul', 'Gujarat Cooperative', true),
    ('60000000000000000000000000000003', 'Heritage', 'Heritage Foods', true),
    ('60000000000000000000000000000004', 'Discontinued Brand', 'No longer available', false); -- EDGE: Inactive brand

INSERT INTO products (id, brand_id, name, sku, category, unit, price, mrp, cost_price, stock_quantity, is_active) VALUES
    ('70000000000000000000000000000001', '60000000000000000000000000000001', 'Nandini Toned Milk', 'NAN-TM-500', 'milk', '500ml', 25.00, 26.00, 22.00, 500, true),
    ('70000000000000000000000000000002', '60000000000000000000000000000001', 'Nandini Full Cream', 'NAN-FC-500', 'milk', '500ml', 32.00, 34.00, 28.00, 400, true),
    ('70000000000000000000000000000003', '60000000000000000000000000000001', 'Nandini Curd', 'NAN-CRD-400', 'curd', '400g', 35.00, 38.00, 30.00, 200, true),
    ('70000000000000000000000000000004', '60000000000000000000000000000002', 'Amul Gold', 'AMU-GLD-500', 'milk', '500ml', 34.00, 36.00, 30.00, 350, true),
    ('70000000000000000000000000000005', '60000000000000000000000000000002', 'Amul Dahi', 'AMU-DH-400', 'curd', '400g', 40.00, 42.00, 35.00, 180, true),
    ('70000000000000000000000000000006', '60000000000000000000000000000003', 'Heritage Milk', 'HER-TM-500', 'milk', '500ml', 26.00, 28.00, 23.00, 280, true),
    ('70000000000000000000000000000007', '60000000000000000000000000000001', 'Out of Stock Milk', 'NAN-OOS-500', 'milk', '500ml', 28.00, 30.00, 25.00, 0, true),      -- EDGE: Zero stock
    ('70000000000000000000000000000008', '60000000000000000000000000000004', 'Discontinued Product', 'DIS-PRD-500', 'milk', '500ml', 30.00, 32.00, 26.00, 50, false); -- EDGE: Inactive

-- =============================================================================
-- 5. SOCIETIES, TOWERS, UNITS
-- =============================================================================

INSERT INTO societies (id, name, area, city, pincode, is_active) VALUES
    ('80000000000000000000000000000001', 'Prestige Lakeside', 'Whitefield', 'Bangalore', '560066', true),
    ('80000000000000000000000000000002', 'Brigade Gateway', 'Rajajinagar', 'Bangalore', '560055', true),
    ('80000000000000000000000000000003', 'Sobha Dream Acres', 'Panathur', 'Bangalore', '560103', true),
    ('80000000000000000000000000000004', 'Unassigned Society', 'HSR Layout', 'Bangalore', '560102', true),   -- EDGE: No distributor
    ('80000000000000000000000000000005', 'Inactive Society', 'Koramangala', 'Bangalore', '560034', false);   -- EDGE: Inactive

-- Towers
INSERT INTO society_towers (id, society_id, name, floors, units_per_floor, is_active) VALUES
    ('90000000000000000000000000000001', '80000000000000000000000000000001', 'Tower A', 20, 4, true),
    ('90000000000000000000000000000002', '80000000000000000000000000000001', 'Tower B', 20, 4, true),
    ('90000000000000000000000000000003', '80000000000000000000000000000002', 'Orion Block', 15, 6, true),
    ('90000000000000000000000000000004', '80000000000000000000000000000003', 'Jasmine', 25, 4, true),
    ('90000000000000000000000000000005', '80000000000000000000000000000004', 'Unassigned Tower', 10, 4, true), -- EDGE: No distributor
    ('90000000000000000000000000000006', '80000000000000000000000000000001', 'Inactive Tower', 10, 4, false); -- EDGE: Inactive tower

-- Units (15 for customers + extras)
INSERT INTO tower_units (id, tower_id, number, floor, is_occupied, is_active) VALUES
    ('a0000000000000000000000000000001', '90000000000000000000000000000001', 'A-101', 1, true, true),
    ('a0000000000000000000000000000002', '90000000000000000000000000000001', 'A-102', 1, true, true),
    ('a0000000000000000000000000000003', '90000000000000000000000000000001', 'A-201', 2, true, true),
    ('a0000000000000000000000000000004', '90000000000000000000000000000001', 'A-301', 3, true, true),
    ('a0000000000000000000000000000005', '90000000000000000000000000000002', 'B-101', 1, true, true),
    ('a0000000000000000000000000000006', '90000000000000000000000000000002', 'B-202', 2, true, true),
    ('a0000000000000000000000000000007', '90000000000000000000000000000003', 'O-101', 1, true, true),
    ('a0000000000000000000000000000008', '90000000000000000000000000000003', 'O-301', 3, true, true),
    ('a0000000000000000000000000000009', '90000000000000000000000000000004', 'J-401', 4, true, true),
    ('a0000000000000000000000000000010', '90000000000000000000000000000004', 'J-501', 5, true, true),
    ('a0000000000000000000000000000011', '90000000000000000000000000000005', 'U-101', 1, true, true),   -- EDGE: Unassigned tower
    ('a0000000000000000000000000000012', '90000000000000000000000000000001', 'A-401', 4, false, true),  -- EDGE: Unoccupied
    ('a0000000000000000000000000000013', '90000000000000000000000000000001', 'A-501', 5, true, true),   -- Multi-address user
    ('a0000000000000000000000000000014', '90000000000000000000000000000001', 'A-502', 5, true, true);   -- Multi-address user 2nd

-- =============================================================================
-- 6. ADDRESSES - Including edge cases
-- =============================================================================

INSERT INTO addresses (id, user_id, society_id, tower_id, unit_id, society_name, apartment_number, area, city, pincode, is_default, is_verified) VALUES
    ('b0000000000000000000000000000001', '30000000000000000000000000000001', '80000000000000000000000000000001', '90000000000000000000000000000001', 'a0000000000000000000000000000001', 'Prestige Lakeside', 'A-101', 'Whitefield', 'Bangalore', '560066', true, true),
    ('b0000000000000000000000000000002', '30000000000000000000000000000002', '80000000000000000000000000000001', '90000000000000000000000000000001', 'a0000000000000000000000000000002', 'Prestige Lakeside', 'A-102', 'Whitefield', 'Bangalore', '560066', true, true),
    ('b0000000000000000000000000000003', '30000000000000000000000000000003', '80000000000000000000000000000001', '90000000000000000000000000000001', 'a0000000000000000000000000000003', 'Prestige Lakeside', 'A-201', 'Whitefield', 'Bangalore', '560066', true, true),
    ('b0000000000000000000000000000004', '30000000000000000000000000000004', '80000000000000000000000000000001', '90000000000000000000000000000001', 'a0000000000000000000000000000004', 'Prestige Lakeside', 'A-301', 'Whitefield', 'Bangalore', '560066', true, true),
    ('b0000000000000000000000000000005', '30000000000000000000000000000005', '80000000000000000000000000000001', '90000000000000000000000000000002', 'a0000000000000000000000000000005', 'Prestige Lakeside', 'B-101', 'Whitefield', 'Bangalore', '560066', true, true),
    ('b0000000000000000000000000000006', '30000000000000000000000000000006', '80000000000000000000000000000001', '90000000000000000000000000000002', 'a0000000000000000000000000000006', 'Prestige Lakeside', 'B-202', 'Whitefield', 'Bangalore', '560066', true, true),
    ('b0000000000000000000000000000007', '30000000000000000000000000000007', '80000000000000000000000000000002', '90000000000000000000000000000003', 'a0000000000000000000000000000007', 'Brigade Gateway', 'O-101', 'Rajajinagar', 'Bangalore', '560055', true, true),
    ('b0000000000000000000000000000008', '30000000000000000000000000000008', '80000000000000000000000000000002', '90000000000000000000000000000003', 'a0000000000000000000000000000008', 'Brigade Gateway', 'O-301', 'Rajajinagar', 'Bangalore', '560055', true, true),
    ('b0000000000000000000000000000009', '30000000000000000000000000000009', '80000000000000000000000000000003', '90000000000000000000000000000004', 'a0000000000000000000000000000009', 'Sobha Dream Acres', 'J-401', 'Panathur', 'Bangalore', '560103', true, true),
    ('b0000000000000000000000000000010', '30000000000000000000000000000010', '80000000000000000000000000000003', '90000000000000000000000000000004', 'a0000000000000000000000000000010', 'Sobha Dream Acres', 'J-501', 'Panathur', 'Bangalore', '560103', true, true),
    ('b0000000000000000000000000000011', '30000000000000000000000000000011', '80000000000000000000000000000004', '90000000000000000000000000000005', 'a0000000000000000000000000000011', 'Unassigned Society', 'U-101', 'HSR Layout', 'Bangalore', '560102', true, true), -- EDGE: No distributor assigned
    ('b0000000000000000000000000000012', '30000000000000000000000000000012', '80000000000000000000000000000001', '90000000000000000000000000000001', 'a0000000000000000000000000000013', 'Prestige Lakeside', 'A-501', 'Whitefield', 'Bangalore', '560066', true, false), -- EDGE: Unverified
    -- Customer 13 has NO address (edge case)
    -- Customer 14 has MULTIPLE addresses
    ('b0000000000000000000000000000014', '30000000000000000000000000000014', '80000000000000000000000000000001', '90000000000000000000000000000001', 'a0000000000000000000000000000013', 'Prestige Lakeside', 'A-501', 'Whitefield', 'Bangalore', '560066', true, true),
    ('b0000000000000000000000000000015', '30000000000000000000000000000014', '80000000000000000000000000000002', '90000000000000000000000000000003', NULL, 'Brigade Gateway', 'O-501', 'Rajajinagar', 'Bangalore', '560055', false, true); -- 2nd address, no unit_id

-- =============================================================================
-- 7. DISTRIBUTOR BUILDING ASSIGNMENTS
-- =============================================================================

INSERT INTO distributor_building_assignments (distributor_id, society_id, tower_id, is_active) VALUES
    ('50000000000000000000000000000001', '80000000000000000000000000000001', '90000000000000000000000000000001', true), -- Ramesh: Tower A
    ('50000000000000000000000000000001', '80000000000000000000000000000001', '90000000000000000000000000000002', true), -- Ramesh: Tower B
    ('50000000000000000000000000000002', '80000000000000000000000000000002', '90000000000000000000000000000003', true), -- Suresh: Orion
    ('50000000000000000000000000000003', '80000000000000000000000000000003', '90000000000000000000000000000004', true); -- Mahesh: Jasmine
    -- EDGE: Society 4 / Tower 5 has NO distributor assigned

-- =============================================================================
-- 8. SUBSCRIPTIONS - Various frequencies and edge cases
-- =============================================================================

INSERT INTO subscriptions (id, user_id, address_id, product_id, quantity, unit_price_locked, frequency, start_date, status, assigned_distributor_id, next_delivery_date, custom_days) VALUES
    -- Daily subscriptions
    ('c0000000000000000000000000000001', '30000000000000000000000000000001', 'b0000000000000000000000000000001', '70000000000000000000000000000001', 1, 25.00, 'daily', CURRENT_DATE - 30, 'active', '50000000000000000000000000000001', CURRENT_DATE, NULL),
    ('c0000000000000000000000000000002', '30000000000000000000000000000002', 'b0000000000000000000000000000002', '70000000000000000000000000000004', 2, 34.00, 'daily', CURRENT_DATE - 25, 'active', '50000000000000000000000000000001', CURRENT_DATE, NULL),
    
    -- Alternate day
    ('c0000000000000000000000000000003', '30000000000000000000000000000003', 'b0000000000000000000000000000003', '70000000000000000000000000000002', 1, 32.00, 'alternate', CURRENT_DATE - 20, 'active', '50000000000000000000000000000001', CURRENT_DATE, NULL),
    
    -- Weekly
    ('c0000000000000000000000000000004', '30000000000000000000000000000004', 'b0000000000000000000000000000004', '70000000000000000000000000000003', 1, 35.00, 'weekly', CURRENT_DATE - 14, 'active', '50000000000000000000000000000001', CURRENT_DATE, NULL),
    
    -- Custom days (Mon, Wed, Fri = 1, 3, 5)
    ('c0000000000000000000000000000005', '30000000000000000000000000000006', 'b0000000000000000000000000000006', '70000000000000000000000000000001', 2, 25.00, 'custom', CURRENT_DATE - 10, 'active', '50000000000000000000000000000001', CURRENT_DATE, '["1", "3", "5"]'),
    
    -- EDGE CASES:
    -- Paused subscription
    ('c0000000000000000000000000000006', '30000000000000000000000000000005', 'b0000000000000000000000000000005', '70000000000000000000000000000001', 1, 25.00, 'daily', CURRENT_DATE - 40, 'paused', '50000000000000000000000000000001', NULL, NULL),
    
    -- Cancelled subscription
    ('c0000000000000000000000000000007', '30000000000000000000000000000007', 'b0000000000000000000000000000007', '70000000000000000000000000000006', 1, 26.00, 'daily', CURRENT_DATE - 60, 'cancelled', '50000000000000000000000000000002', NULL, NULL),
    
    -- Low balance customer with active subscription (will fail debit)
    ('c0000000000000000000000000000008', '30000000000000000000000000000005', 'b0000000000000000000000000000005', '70000000000000000000000000000004', 1, 34.00, 'daily', CURRENT_DATE - 5, 'active', '50000000000000000000000000000001', CURRENT_DATE, NULL),
    
    -- Zero balance customer
    ('c0000000000000000000000000000009', '30000000000000000000000000000011', 'b0000000000000000000000000000011', '70000000000000000000000000000001', 1, 25.00, 'daily', CURRENT_DATE - 5, 'active', NULL, CURRENT_DATE, NULL), -- EDGE: No distributor
    
    -- Different distributor area subscriptions
    ('c0000000000000000000000000000010', '30000000000000000000000000000008', 'b0000000000000000000000000000008', '70000000000000000000000000000004', 1, 34.00, 'daily', CURRENT_DATE - 15, 'active', '50000000000000000000000000000002', CURRENT_DATE, NULL),
    ('c0000000000000000000000000000011', '30000000000000000000000000000009', 'b0000000000000000000000000000009', '70000000000000000000000000000003', 1, 35.00, 'daily', CURRENT_DATE - 10, 'active', '50000000000000000000000000000003', CURRENT_DATE, NULL),
    
    -- Subscription with end date (expiring soon)
    ('c0000000000000000000000000000012', '30000000000000000000000000000010', 'b0000000000000000000000000000010', '70000000000000000000000000000001', 1, 25.00, 'daily', CURRENT_DATE - 30, 'active', '50000000000000000000000000000003', CURRENT_DATE, NULL);

-- Update subscription with end_date
UPDATE subscriptions SET end_date = CURRENT_DATE + 3 WHERE id = 'c0000000000000000000000000000012';

-- Update paused subscription
UPDATE subscriptions SET pause_start_date = CURRENT_DATE - 5, pause_end_date = CURRENT_DATE + 10, pause_reason = 'On vacation' WHERE id = 'c0000000000000000000000000000006';

-- =============================================================================
-- 9. ORDERS - Various statuses
-- =============================================================================

-- Today's scheduled orders
INSERT INTO orders (id, order_number, user_id, address_id, subscription_id, delivery_date, product_id, quantity, unit_price, total_amount, status, payment_status, assigned_distributor_id) VALUES
    ('d0000000000000000000000000000001', 'ORD-TODAY-001', '30000000000000000000000000000001', 'b0000000000000000000000000000001', 'c0000000000000000000000000000001', CURRENT_DATE, '70000000000000000000000000000001', 1, 25.00, 25.00, 'scheduled', 'created', '50000000000000000000000000000001'),
    ('d0000000000000000000000000000002', 'ORD-TODAY-002', '30000000000000000000000000000002', 'b0000000000000000000000000000002', 'c0000000000000000000000000000002', CURRENT_DATE, '70000000000000000000000000000004', 2, 34.00, 68.00, 'scheduled', 'created', '50000000000000000000000000000001'),
    ('d0000000000000000000000000000003', 'ORD-TODAY-003', '30000000000000000000000000000003', 'b0000000000000000000000000000003', 'c0000000000000000000000000000003', CURRENT_DATE, '70000000000000000000000000000002', 1, 32.00, 32.00, 'in_transit', 'created', '50000000000000000000000000000001'),
    -- EDGE: Order for low-balance customer
    ('d0000000000000000000000000000004', 'ORD-TODAY-004', '30000000000000000000000000000005', 'b0000000000000000000000000000005', 'c0000000000000000000000000000008', CURRENT_DATE, '70000000000000000000000000000004', 1, 34.00, 34.00, 'scheduled', 'created', '50000000000000000000000000000001'),
    -- EDGE: Order with no distributor
    ('d0000000000000000000000000000005', 'ORD-TODAY-005', '30000000000000000000000000000011', 'b0000000000000000000000000000011', 'c0000000000000000000000000000009', CURRENT_DATE, '70000000000000000000000000000001', 1, 25.00, 25.00, 'scheduled', 'created', NULL);

-- Yesterday's orders (various statuses)
INSERT INTO orders (id, order_number, user_id, address_id, subscription_id, delivery_date, product_id, quantity, unit_price, total_amount, status, payment_status, assigned_distributor_id, delivered_at) VALUES
    ('d0000000000000000000000000000010', 'ORD-YEST-001', '30000000000000000000000000000001', 'b0000000000000000000000000000001', 'c0000000000000000000000000000001', CURRENT_DATE - 1, '70000000000000000000000000000001', 1, 25.00, 25.00, 'delivered', 'captured', '50000000000000000000000000000001', (CURRENT_DATE - 1 + TIME '06:30:00')),
    ('d0000000000000000000000000000011', 'ORD-YEST-002', '30000000000000000000000000000002', 'b0000000000000000000000000000002', 'c0000000000000000000000000000002', CURRENT_DATE - 1, '70000000000000000000000000000004', 2, 34.00, 68.00, 'delivered', 'captured', '50000000000000000000000000000001', (CURRENT_DATE - 1 + TIME '06:35:00'));

-- Skipped/missed/failed orders (edge cases)
INSERT INTO orders (id, order_number, user_id, address_id, subscription_id, delivery_date, product_id, quantity, unit_price, total_amount, status, payment_status, assigned_distributor_id, skip_reason) VALUES
    ('d0000000000000000000000000000020', 'ORD-SKIP-001', '30000000000000000000000000000004', 'b0000000000000000000000000000004', 'c0000000000000000000000000000004', CURRENT_DATE - 2, '70000000000000000000000000000003', 1, 35.00, 35.00, 'skipped', 'created', '50000000000000000000000000000001', 'Customer requested skip'),
    ('d0000000000000000000000000000021', 'ORD-MISS-001', '30000000000000000000000000000006', 'b0000000000000000000000000000006', 'c0000000000000000000000000000005', CURRENT_DATE - 3, '70000000000000000000000000000001', 2, 25.00, 50.00, 'missed', 'created', '50000000000000000000000000000001', 'Customer not available'),
    ('d0000000000000000000000000000022', 'ORD-FAIL-001', '30000000000000000000000000000011', 'b0000000000000000000000000000011', NULL, CURRENT_DATE - 4, '70000000000000000000000000000001', 1, 25.00, 25.00, 'failed', 'failed', NULL, 'Insufficient balance');

-- =============================================================================
-- 10. WALLET LEDGER - Proper transactions
-- =============================================================================

INSERT INTO wallet_ledger (id, user_id, entry_type, amount, balance_before, balance_after, reference_type, idempotency_key, description) VALUES
    ('e0000000000000000000000000000001', '30000000000000000000000000000001', 'credit', 500.00, 0.00, 500.00, 'payment', 'SEED-CR-001', 'Initial recharge'),
    ('e0000000000000000000000000000002', '30000000000000000000000000000002', 'credit', 1500.00, 0.00, 1500.00, 'payment', 'SEED-CR-002', 'Initial recharge'),
    ('e0000000000000000000000000000003', '30000000000000000000000000000002', 'debit', 300.00, 1500.00, 1200.00, 'order', 'SEED-DB-001', 'Order payments'),
    ('e0000000000000000000000000000004', '30000000000000000000000000000003', 'credit', 350.00, 0.00, 350.00, 'payment', 'SEED-CR-003', 'Initial recharge'),
    ('e0000000000000000000000000000005', '30000000000000000000000000000004', 'credit', 25.00, 0.00, 25.00, 'payment', 'SEED-CR-004', 'Exact amount recharge'),
    ('e0000000000000000000000000000006', '30000000000000000000000000000005', 'credit', 10.00, 0.00, 10.00, 'payment', 'SEED-CR-005', 'Low recharge'),
    ('e0000000000000000000000000000007', '30000000000000000000000000000006', 'credit', 2500.00, 0.00, 2500.00, 'payment', 'SEED-CR-006', 'Initial recharge'),
    ('e0000000000000000000000000000008', '30000000000000000000000000000012', 'credit', 1000.00, 0.00, 1000.00, 'payment', 'SEED-CR-012', 'Locked wallet credit');

-- =============================================================================
-- 11. ACTIVATION CODES - For testing distributor onboarding
-- =============================================================================

INSERT INTO distributor_activation_codes (code, created_by, expires_at, used, notes) VALUES
    ('TEST-CODE-0001', '10000000000000000000000000000001', CURRENT_TIMESTAMP + INTERVAL '30 days', false, 'Test code 1'),
    ('TEST-CODE-0002', '10000000000000000000000000000001', CURRENT_TIMESTAMP + INTERVAL '30 days', false, 'Test code 2'),
    ('EXPR-CODE-0001', '10000000000000000000000000000001', CURRENT_TIMESTAMP - INTERVAL '1 day', false, 'Expired code'), -- EDGE: Expired
    ('USED-CODE-0001', '10000000000000000000000000000001', CURRENT_TIMESTAMP + INTERVAL '30 days', true, 'Already used'); -- EDGE: Used

-- =============================================================================
-- 12. SUPPORT TICKETS - Various states
-- =============================================================================

INSERT INTO support_tickets (id, ticket_number, user_id, order_id, category, priority, status, subject, description, assigned_admin_id) VALUES
    ('f0000000000000000000000000000001', 'TKT-OPEN-001', '30000000000000000000000000000003', 'd0000000000000000000000000000020', 'delivery_issue', 'high', 'open', 'Delivery not received', 'I was home but delivery was marked as missed', '10000000000000000000000000000003'),
    ('f0000000000000000000000000000002', 'TKT-PROG-001', '30000000000000000000000000000007', NULL, 'product_quality', 'medium', 'in_progress', 'Curd was spoiled', 'The curd I received was already spoiled', '10000000000000000000000000000003'),
    ('f0000000000000000000000000000003', 'TKT-RSLV-001', '30000000000000000000000000000001', NULL, 'billing', 'low', 'resolved', 'Wrong amount deducted', 'Extra amount was deducted from wallet', '10000000000000000000000000000002');

-- Update resolved ticket
UPDATE support_tickets SET resolution_notes = 'Refund processed', resolved_at = CURRENT_TIMESTAMP - INTERVAL '2 days', resolved_by = '10000000000000000000000000000002' WHERE id = 'f0000000000000000000000000000003';

-- =============================================================================
-- 13. UPDATE STATISTICS
-- =============================================================================

UPDATE customers c SET 
    lifetime_spent = COALESCE((SELECT SUM(o.total_amount) FROM orders o WHERE o.user_id = c.user_id AND o.status = 'delivered'), 0);

UPDATE subscriptions s SET 
    total_delivered = COALESCE((SELECT COUNT(*) FROM orders o WHERE o.subscription_id = s.id AND o.status = 'delivered'), 0),
    total_skipped = COALESCE((SELECT COUNT(*) FROM orders o WHERE o.subscription_id = s.id AND o.status = 'skipped'), 0);

-- =============================================================================
-- SUMMARY
-- =============================================================================

DO $$ BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '╔═══════════════════════════════════════════════════════════════════╗';
    RAISE NOTICE '║           iDaily SEED V3 - Edge Cases & Test Data                 ║';
    RAISE NOTICE '╠═══════════════════════════════════════════════════════════════════╣';
    RAISE NOTICE '║ USERS: 3 Admins, 4 Distributors (1 inactive), 15 Customers        ║';
    RAISE NOTICE '║ PRODUCTS: 8 (1 out-of-stock, 1 inactive)                          ║';
    RAISE NOTICE '║ SUBSCRIPTIONS: 12 (daily/alternate/weekly/custom/paused/cancelled)║';
    RAISE NOTICE '║ ORDERS: Various statuses (scheduled/delivered/skipped/missed/failed)║';
    RAISE NOTICE '╠═══════════════════════════════════════════════════════════════════╣';
    RAISE NOTICE '║ EDGE CASES INCLUDED:                                              ║';
    RAISE NOTICE '║ • Customer with zero balance                                      ║';
    RAISE NOTICE '║ • Customer with locked wallet                                     ║';
    RAISE NOTICE '║ • Customer with no address                                        ║';
    RAISE NOTICE '║ • Customer with multiple addresses                                ║';
    RAISE NOTICE '║ • Inactive customer/distributor                                   ║';
    RAISE NOTICE '║ • Building with no distributor assigned                           ║';
    RAISE NOTICE '║ • Out-of-stock product                                            ║';
    RAISE NOTICE '║ • Subscription expiring soon                                      ║';
    RAISE NOTICE '║ • Paused subscription                                             ║';
    RAISE NOTICE '║ • Orders without distributor                                      ║';
    RAISE NOTICE '║ • Expired/used activation codes                                   ║';
    RAISE NOTICE '╠═══════════════════════════════════════════════════════════════════╣';
    RAISE NOTICE '║ TEST LOGINS:                                                      ║';
    RAISE NOTICE '║ • Admin: +919999900002                                            ║';
    RAISE NOTICE '║ • Distributor: +919888800001 (Ramesh - 2 towers)                  ║';
    RAISE NOTICE '║ • Customer: +919777700001 (₹500 balance)                          ║';
    RAISE NOTICE '║ • Customer: +919777700011 (Zero balance - edge case)              ║';
    RAISE NOTICE '║ • Customer: +919777700012 (Locked wallet - edge case)             ║';
    RAISE NOTICE '╚═══════════════════════════════════════════════════════════════════╝';
END $$;
