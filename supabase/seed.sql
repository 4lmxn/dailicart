-- =============================================================
-- iDaily PRODUCTION SEED DATA V2
-- For Development & Testing Only
-- Last updated: December 2024
-- 
-- Run this AFTER PRODUCTION_SCHEMA_V2.sql
-- =============================================================

-- =============================================================================
-- 1. USERS (Admin, Distributors, Customers)
-- =============================================================================

-- Admin & Super Admin
INSERT INTO users (id, phone, name, email, role) VALUES
    ('a0000000-0000-0000-0000-000000000001', '+919999900001', 'Super Admin', 'superadmin@idaily.in', 'superadmin'),
    ('a0000000-0000-0000-0000-000000000002', '+919999900002', 'Admin User', 'admin@idaily.in', 'admin'),
    ('a0000000-0000-0000-0000-000000000003', '+919999900003', 'Support Admin', 'support@idaily.in', 'admin');

-- Distributors
INSERT INTO users (id, phone, name, email, role) VALUES
    ('d0000000-0000-0000-0000-000000000001', '+919888800001', 'Ramesh Kumar', 'ramesh@idaily.in', 'distributor'),
    ('d0000000-0000-0000-0000-000000000002', '+919888800002', 'Suresh Patil', 'suresh@idaily.in', 'distributor'),
    ('d0000000-0000-0000-0000-000000000003', '+919888800003', 'Mahesh Gowda', 'mahesh@idaily.in', 'distributor');

-- Customers (10 test customers)
INSERT INTO users (id, phone, name, email, role) VALUES
    ('c0000000-0000-0000-0000-000000000001', '+919777700001', 'Priya Sharma', 'priya.sharma@gmail.com', 'customer'),
    ('c0000000-0000-0000-0000-000000000002', '+919777700002', 'Rahul Verma', 'rahul.verma@gmail.com', 'customer'),
    ('c0000000-0000-0000-0000-000000000003', '+919777700003', 'Anjali Reddy', 'anjali.reddy@gmail.com', 'customer'),
    ('c0000000-0000-0000-0000-000000000004', '+919777700004', 'Vikram Singh', 'vikram.singh@gmail.com', 'customer'),
    ('c0000000-0000-0000-0000-000000000005', '+919777700005', 'Sneha Nair', 'sneha.nair@gmail.com', 'customer'),
    ('c0000000-0000-0000-0000-000000000006', '+919777700006', 'Amit Patel', 'amit.patel@gmail.com', 'customer'),
    ('c0000000-0000-0000-0000-000000000007', '+919777700007', 'Kavitha Rao', 'kavitha.rao@gmail.com', 'customer'),
    ('c0000000-0000-0000-0000-000000000008', '+919777700008', 'Deepak Joshi', 'deepak.joshi@gmail.com', 'customer'),
    ('c0000000-0000-0000-0000-000000000009', '+919777700009', 'Meera Iyer', 'meera.iyer@gmail.com', 'customer'),
    ('c0000000-0000-0000-0000-000000000010', '+919777700010', 'Arjun Menon', 'arjun.menon@gmail.com', 'customer');

-- =============================================================================
-- 2. CUSTOMERS (Wallet records)
-- =============================================================================

INSERT INTO customers (id, user_id, wallet_balance, auto_deduct) VALUES
    ('cc000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 500.00, true),
    ('cc000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 1200.00, true),
    ('cc000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000003', 350.00, false),
    ('cc000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000004', 800.00, true),
    ('cc000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000005', 0.00, false),
    ('cc000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000006', 2500.00, true),
    ('cc000000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000007', 150.00, true),
    ('cc000000-0000-0000-0000-000000000008', 'c0000000-0000-0000-0000-000000000008', 600.00, false),
    ('cc000000-0000-0000-0000-000000000009', 'c0000000-0000-0000-0000-000000000009', 1000.00, true),
    ('cc000000-0000-0000-0000-000000000010', 'c0000000-0000-0000-0000-000000000010', 450.00, true);

-- =============================================================================
-- 3. DISTRIBUTORS
-- =============================================================================

INSERT INTO distributors (id, user_id, vehicle_number, license_number, is_active, rating, total_deliveries) VALUES
    ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'KA-01-AB-1234', 'DL-KA-2020-12345', true, 4.8, 1250),
    ('d1000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002', 'KA-01-CD-5678', 'DL-KA-2019-67890', true, 4.5, 890),
    ('d1000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000003', 'KA-01-EF-9012', 'DL-KA-2021-11111', true, 4.9, 2100);

-- =============================================================================
-- 4. BRANDS & PRODUCTS
-- =============================================================================

INSERT INTO brands (id, name, description, is_active) VALUES
    ('b00000d0-0000-0000-0000-000000000001', 'Nandini', 'Karnataka Milk Federation', true),
    ('b00000d0-0000-0000-0000-000000000002', 'Amul', 'Gujarat Cooperative Milk Marketing Federation', true),
    ('b00000d0-0000-0000-0000-000000000003', 'Heritage', 'Heritage Foods Limited', true),
    ('b00000d0-0000-0000-0000-000000000004', 'Country Delight', 'Farm Fresh Milk', true);

INSERT INTO products (id, brand_id, name, sku, category, unit, price, mrp, cost_price, stock_quantity, is_active) VALUES
    -- Nandini Products
    ('e0d00000-0000-0000-0000-000000000001', 'b00000d0-0000-0000-0000-000000000001', 'Nandini Toned Milk', 'NAN-TM-500', 'milk', '500ml', 25.00, 26.00, 22.00, 500, true),
    ('e0d00000-0000-0000-0000-000000000002', 'b00000d0-0000-0000-0000-000000000001', 'Nandini Full Cream Milk', 'NAN-FC-500', 'milk', '500ml', 32.00, 34.00, 28.00, 400, true),
    ('e0d00000-0000-0000-0000-000000000003', 'b00000d0-0000-0000-0000-000000000001', 'Nandini Curd', 'NAN-CRD-400', 'curd', '400g', 35.00, 38.00, 30.00, 200, true),
    ('e0d00000-0000-0000-0000-000000000004', 'b00000d0-0000-0000-0000-000000000001', 'Nandini Buttermilk', 'NAN-BM-200', 'buttermilk', '200ml', 15.00, 16.00, 12.00, 300, true),
    
    -- Amul Products
    ('e0d00000-0000-0000-0000-000000000005', 'b00000d0-0000-0000-0000-000000000002', 'Amul Gold Milk', 'AMU-GLD-500', 'milk', '500ml', 34.00, 36.00, 30.00, 350, true),
    ('e0d00000-0000-0000-0000-000000000006', 'b00000d0-0000-0000-0000-000000000002', 'Amul Taaza Milk', 'AMU-TZ-500', 'milk', '500ml', 28.00, 30.00, 24.00, 450, true),
    ('e0d00000-0000-0000-0000-000000000007', 'b00000d0-0000-0000-0000-000000000002', 'Amul Masti Dahi', 'AMU-DH-400', 'curd', '400g', 40.00, 42.00, 35.00, 180, true),
    
    -- Heritage Products
    ('e0d00000-0000-0000-0000-000000000008', 'b00000d0-0000-0000-0000-000000000003', 'Heritage Toned Milk', 'HER-TM-500', 'milk', '500ml', 26.00, 28.00, 23.00, 280, true),
    ('e0d00000-0000-0000-0000-000000000009', 'b00000d0-0000-0000-0000-000000000003', 'Heritage Full Cream', 'HER-FC-500', 'milk', '500ml', 33.00, 35.00, 29.00, 220, true),
    
    -- Country Delight
    ('e0d00000-0000-0000-0000-000000000010', 'b00000d0-0000-0000-0000-000000000004', 'Country Delight Farm Milk', 'CD-FM-500', 'milk', '500ml', 38.00, 40.00, 32.00, 150, true),
    ('e0d00000-0000-0000-0000-000000000011', 'b00000d0-0000-0000-0000-000000000004', 'Country Delight A2 Milk', 'CD-A2-500', 'milk', '500ml', 55.00, 58.00, 48.00, 100, true),
    ('e0d00000-0000-0000-0000-000000000012', 'b00000d0-0000-0000-0000-000000000004', 'Country Delight Paneer', 'CD-PNR-200', 'paneer', '200g', 85.00, 90.00, 72.00, 80, true);

-- =============================================================================
-- 5. SOCIETIES, TOWERS & UNITS
-- =============================================================================

-- Societies
INSERT INTO societies (id, name, developer, area, city, pincode, latitude, longitude, total_units, is_active) VALUES
    ('50c00000-0000-0000-0000-000000000001', 'Prestige Lakeside Habitat', 'Prestige Group', 'Whitefield', 'Bangalore', '560066', 12.9698, 77.7500, 200, true),
    ('50c00000-0000-0000-0000-000000000002', 'Brigade Gateway', 'Brigade Group', 'Rajajinagar', 'Bangalore', '560055', 12.9914, 77.5521, 150, true),
    ('50c00000-0000-0000-0000-000000000003', 'Sobha Dream Acres', 'Sobha Limited', 'Panathur', 'Bangalore', '560103', 12.9279, 77.6892, 300, true),
    ('50c00000-0000-0000-0000-000000000004', 'Salarpuria Greenage', 'Salarpuria Sattva', 'Bommanahalli', 'Bangalore', '560068', 12.8963, 77.6288, 180, true);

-- Towers for Prestige Lakeside Habitat
INSERT INTO society_towers (id, society_id, name, floors, units_per_floor, is_active) VALUES
    ('10ee0000-0000-0000-0000-000000000001', '50c00000-0000-0000-0000-000000000001', 'Tower A', 20, 4, true),
    ('10ee0000-0000-0000-0000-000000000002', '50c00000-0000-0000-0000-000000000001', 'Tower B', 20, 4, true),
    ('10ee0000-0000-0000-0000-000000000003', '50c00000-0000-0000-0000-000000000001', 'Tower C', 18, 4, true);

-- Towers for Brigade Gateway
INSERT INTO society_towers (id, society_id, name, floors, units_per_floor, is_active) VALUES
    ('10ee0000-0000-0000-0000-000000000004', '50c00000-0000-0000-0000-000000000002', 'Orion Block', 15, 6, true),
    ('10ee0000-0000-0000-0000-000000000005', '50c00000-0000-0000-0000-000000000002', 'Sheraton Block', 12, 6, true);

-- Towers for Sobha Dream Acres
INSERT INTO society_towers (id, society_id, name, floors, units_per_floor, is_active) VALUES
    ('10ee0000-0000-0000-0000-000000000006', '50c00000-0000-0000-0000-000000000003', 'Jasmine', 25, 4, true),
    ('10ee0000-0000-0000-0000-000000000007', '50c00000-0000-0000-0000-000000000003', 'Lotus', 25, 4, true),
    ('10ee0000-0000-0000-0000-000000000008', '50c00000-0000-0000-0000-000000000003', 'Orchid', 22, 4, true);

-- Towers for Salarpuria Greenage
INSERT INTO society_towers (id, society_id, name, floors, units_per_floor, is_active) VALUES
    ('10ee0000-0000-0000-0000-000000000009', '50c00000-0000-0000-0000-000000000004', 'Palm Block', 18, 4, true),
    ('10ee0000-0000-0000-0000-000000000010', '50c00000-0000-0000-0000-000000000004', 'Oak Block', 16, 4, true);

-- Units (creating a few per tower for testing)
INSERT INTO tower_units (id, tower_id, number, floor, is_occupied, is_active) VALUES
    -- Tower A units
    ('00010000-0000-0000-0000-000000000001', '10ee0000-0000-0000-0000-000000000001', 'A-101', 1, true, true),
    ('00010000-0000-0000-0000-000000000002', '10ee0000-0000-0000-0000-000000000001', 'A-102', 1, true, true),
    ('00010000-0000-0000-0000-000000000003', '10ee0000-0000-0000-0000-000000000001', 'A-201', 2, true, true),
    ('00010000-0000-0000-0000-000000000004', '10ee0000-0000-0000-0000-000000000001', 'A-301', 3, true, true),
    ('00010000-0000-0000-0000-000000000005', '10ee0000-0000-0000-0000-000000000001', 'A-501', 5, true, true),
    
    -- Tower B units
    ('00010000-0000-0000-0000-000000000006', '10ee0000-0000-0000-0000-000000000002', 'B-101', 1, true, true),
    ('00010000-0000-0000-0000-000000000007', '10ee0000-0000-0000-0000-000000000002', 'B-202', 2, true, true),
    
    -- Orion Block units
    ('00010000-0000-0000-0000-000000000008', '10ee0000-0000-0000-0000-000000000004', 'O-101', 1, true, true),
    ('00010000-0000-0000-0000-000000000009', '10ee0000-0000-0000-0000-000000000004', 'O-301', 3, true, true),
    
    -- Jasmine Tower units
    ('00010000-0000-0000-0000-000000000010', '10ee0000-0000-0000-0000-000000000006', 'J-401', 4, true, true);

-- =============================================================================
-- 6. ADDRESSES (Link customers to units)
-- =============================================================================

INSERT INTO addresses (id, user_id, society_id, tower_id, unit_id, society_name, apartment_number, area, city, pincode, is_default, is_verified) VALUES
    ('add00000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', '50c00000-0000-0000-0000-000000000001', '10ee0000-0000-0000-0000-000000000001', '00010000-0000-0000-0000-000000000001', 'Prestige Lakeside Habitat', 'A-101', 'Whitefield', 'Bangalore', '560066', true, true),
    ('add00000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', '50c00000-0000-0000-0000-000000000001', '10ee0000-0000-0000-0000-000000000001', '00010000-0000-0000-0000-000000000002', 'Prestige Lakeside Habitat', 'A-102', 'Whitefield', 'Bangalore', '560066', true, true),
    ('add00000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000003', '50c00000-0000-0000-0000-000000000001', '10ee0000-0000-0000-0000-000000000001', '00010000-0000-0000-0000-000000000003', 'Prestige Lakeside Habitat', 'A-201', 'Whitefield', 'Bangalore', '560066', true, true),
    ('add00000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000004', '50c00000-0000-0000-0000-000000000001', '10ee0000-0000-0000-0000-000000000001', '00010000-0000-0000-0000-000000000004', 'Prestige Lakeside Habitat', 'A-301', 'Whitefield', 'Bangalore', '560066', true, true),
    ('add00000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000005', '50c00000-0000-0000-0000-000000000001', '10ee0000-0000-0000-0000-000000000001', '00010000-0000-0000-0000-000000000005', 'Prestige Lakeside Habitat', 'A-501', 'Whitefield', 'Bangalore', '560066', true, true),
    ('add00000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000006', '50c00000-0000-0000-0000-000000000001', '10ee0000-0000-0000-0000-000000000002', '00010000-0000-0000-0000-000000000006', 'Prestige Lakeside Habitat', 'B-101', 'Whitefield', 'Bangalore', '560066', true, true),
    ('add00000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000007', '50c00000-0000-0000-0000-000000000001', '10ee0000-0000-0000-0000-000000000002', '00010000-0000-0000-0000-000000000007', 'Prestige Lakeside Habitat', 'B-202', 'Whitefield', 'Bangalore', '560066', true, true),
    ('add00000-0000-0000-0000-000000000008', 'c0000000-0000-0000-0000-000000000008', '50c00000-0000-0000-0000-000000000002', '10ee0000-0000-0000-0000-000000000004', '00010000-0000-0000-0000-000000000008', 'Brigade Gateway', 'O-101', 'Rajajinagar', 'Bangalore', '560055', true, true),
    ('add00000-0000-0000-0000-000000000009', 'c0000000-0000-0000-0000-000000000009', '50c00000-0000-0000-0000-000000000002', '10ee0000-0000-0000-0000-000000000004', '00010000-0000-0000-0000-000000000009', 'Brigade Gateway', 'O-301', 'Rajajinagar', 'Bangalore', '560055', true, true),
    ('add00000-0000-0000-0000-000000000010', 'c0000000-0000-0000-0000-000000000010', '50c00000-0000-0000-0000-000000000003', '10ee0000-0000-0000-0000-000000000006', '00010000-0000-0000-0000-000000000010', 'Sobha Dream Acres', 'J-401', 'Panathur', 'Bangalore', '560103', true, true);

-- =============================================================================
-- 7. DISTRIBUTOR BUILDING ASSIGNMENTS
-- =============================================================================

-- Ramesh handles Prestige Lakeside Tower A & B
INSERT INTO distributor_building_assignments (distributor_id, society_id, tower_id, is_active) VALUES
    ('d1000000-0000-0000-0000-000000000001', '50c00000-0000-0000-0000-000000000001', '10ee0000-0000-0000-0000-000000000001', true),
    ('d1000000-0000-0000-0000-000000000001', '50c00000-0000-0000-0000-000000000001', '10ee0000-0000-0000-0000-000000000002', true);

-- Suresh handles Brigade Gateway
INSERT INTO distributor_building_assignments (distributor_id, society_id, tower_id, is_active) VALUES
    ('d1000000-0000-0000-0000-000000000002', '50c00000-0000-0000-0000-000000000002', '10ee0000-0000-0000-0000-000000000004', true),
    ('d1000000-0000-0000-0000-000000000002', '50c00000-0000-0000-0000-000000000002', '10ee0000-0000-0000-0000-000000000005', true);

-- Mahesh handles Sobha Dream Acres
INSERT INTO distributor_building_assignments (distributor_id, society_id, tower_id, is_active) VALUES
    ('d1000000-0000-0000-0000-000000000003', '50c00000-0000-0000-0000-000000000003', '10ee0000-0000-0000-0000-000000000006', true),
    ('d1000000-0000-0000-0000-000000000003', '50c00000-0000-0000-0000-000000000003', '10ee0000-0000-0000-0000-000000000007', true);

-- =============================================================================
-- 8. SUBSCRIPTIONS
-- =============================================================================

INSERT INTO subscriptions (id, user_id, address_id, product_id, quantity, unit_price_locked, frequency, start_date, status, assigned_distributor_id, next_delivery_date) VALUES
    -- Priya - Daily Nandini Toned Milk
    ('5b000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'add00000-0000-0000-0000-000000000001', 'e0d00000-0000-0000-0000-000000000001', 1, 25.00, 'daily', CURRENT_DATE - 30, 'active', 'd1000000-0000-0000-0000-000000000001', CURRENT_DATE),
    
    -- Rahul - Daily Amul Gold + Curd on alternate days
    ('5b000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 'add00000-0000-0000-0000-000000000002', 'e0d00000-0000-0000-0000-000000000005', 2, 34.00, 'daily', CURRENT_DATE - 25, 'active', 'd1000000-0000-0000-0000-000000000001', CURRENT_DATE),
    ('5b000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002', 'add00000-0000-0000-0000-000000000002', 'e0d00000-0000-0000-0000-000000000007', 1, 40.00, 'alternate', CURRENT_DATE - 25, 'active', 'd1000000-0000-0000-0000-000000000001', CURRENT_DATE),
    
    -- Anjali - Alternate day Country Delight
    ('5b000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000003', 'add00000-0000-0000-0000-000000000003', 'e0d00000-0000-0000-0000-000000000010', 1, 38.00, 'alternate', CURRENT_DATE - 20, 'active', 'd1000000-0000-0000-0000-000000000001', CURRENT_DATE),
    
    -- Vikram - Daily Nandini Full Cream
    ('5b000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000004', 'add00000-0000-0000-0000-000000000004', 'e0d00000-0000-0000-0000-000000000002', 2, 32.00, 'daily', CURRENT_DATE - 15, 'active', 'd1000000-0000-0000-0000-000000000001', CURRENT_DATE),
    
    -- Sneha - Paused subscription (going on vacation)
    ('5b000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000005', 'add00000-0000-0000-0000-000000000005', 'e0d00000-0000-0000-0000-000000000001', 1, 25.00, 'daily', CURRENT_DATE - 40, 'paused', 'd1000000-0000-0000-0000-000000000001', NULL),
    
    -- Amit - Daily Heritage + Paneer weekly
    ('5b000000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000006', 'add00000-0000-0000-0000-000000000006', 'e0d00000-0000-0000-0000-000000000008', 1, 26.00, 'daily', CURRENT_DATE - 10, 'active', 'd1000000-0000-0000-0000-000000000001', CURRENT_DATE),
    
    -- Kavitha - Daily Nandini Buttermilk
    ('5b000000-0000-0000-0000-000000000008', 'c0000000-0000-0000-0000-000000000007', 'add00000-0000-0000-0000-000000000007', 'e0d00000-0000-0000-0000-000000000004', 2, 15.00, 'daily', CURRENT_DATE - 5, 'active', 'd1000000-0000-0000-0000-000000000001', CURRENT_DATE),
    
    -- Deepak (Brigade) - Daily Amul Taaza
    ('5b000000-0000-0000-0000-000000000009', 'c0000000-0000-0000-0000-000000000008', 'add00000-0000-0000-0000-000000000008', 'e0d00000-0000-0000-0000-000000000006', 1, 28.00, 'daily', CURRENT_DATE - 30, 'active', 'd1000000-0000-0000-0000-000000000002', CURRENT_DATE),
    
    -- Meera (Brigade) - Alternate Country Delight A2
    ('5b000000-0000-0000-0000-000000000010', 'c0000000-0000-0000-0000-000000000009', 'add00000-0000-0000-0000-000000000009', 'e0d00000-0000-0000-0000-000000000011', 1, 55.00, 'alternate', CURRENT_DATE - 20, 'active', 'd1000000-0000-0000-0000-000000000002', CURRENT_DATE),
    
    -- Arjun (Sobha) - Daily Nandini Curd
    ('5b000000-0000-0000-0000-000000000011', 'c0000000-0000-0000-0000-000000000010', 'add00000-0000-0000-0000-000000000010', 'e0d00000-0000-0000-0000-000000000003', 1, 35.00, 'daily', CURRENT_DATE - 15, 'active', 'd1000000-0000-0000-0000-000000000003', CURRENT_DATE);

-- Update paused subscription dates
UPDATE subscriptions 
SET pause_start_date = CURRENT_DATE - 5, 
    pause_end_date = CURRENT_DATE + 10,
    pause_reason = 'On vacation'
WHERE id = '5b000000-0000-0000-0000-000000000006';

-- =============================================================================
-- 9. ORDERS (Today's + Past orders)
-- =============================================================================

-- Today's scheduled orders
INSERT INTO orders (id, order_number, user_id, address_id, subscription_id, delivery_date, product_id, quantity, unit_price, total_amount, status, payment_status, assigned_distributor_id) VALUES
    ('0d000000-0000-0000-0000-000000000001', 'ORD-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-00000001', 'c0000000-0000-0000-0000-000000000001', 'add00000-0000-0000-0000-000000000001', '5b000000-0000-0000-0000-000000000001', CURRENT_DATE, 'e0d00000-0000-0000-0000-000000000001', 1, 25.00, 25.00, 'scheduled', 'created', 'd1000000-0000-0000-0000-000000000001'),
    ('0d000000-0000-0000-0000-000000000002', 'ORD-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-00000002', 'c0000000-0000-0000-0000-000000000002', 'add00000-0000-0000-0000-000000000002', '5b000000-0000-0000-0000-000000000002', CURRENT_DATE, 'e0d00000-0000-0000-0000-000000000005', 2, 34.00, 68.00, 'scheduled', 'created', 'd1000000-0000-0000-0000-000000000001'),
    ('0d000000-0000-0000-0000-000000000003', 'ORD-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-00000003', 'c0000000-0000-0000-0000-000000000004', 'add00000-0000-0000-0000-000000000004', '5b000000-0000-0000-0000-000000000005', CURRENT_DATE, 'e0d00000-0000-0000-0000-000000000002', 2, 32.00, 64.00, 'scheduled', 'created', 'd1000000-0000-0000-0000-000000000001'),
    ('0d000000-0000-0000-0000-000000000004', 'ORD-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-00000004', 'c0000000-0000-0000-0000-000000000006', 'add00000-0000-0000-0000-000000000006', '5b000000-0000-0000-0000-000000000007', CURRENT_DATE, 'e0d00000-0000-0000-0000-000000000008', 1, 26.00, 26.00, 'scheduled', 'created', 'd1000000-0000-0000-0000-000000000001'),
    ('0d000000-0000-0000-0000-000000000005', 'ORD-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-00000005', 'c0000000-0000-0000-0000-000000000007', 'add00000-0000-0000-0000-000000000007', '5b000000-0000-0000-0000-000000000008', CURRENT_DATE, 'e0d00000-0000-0000-0000-000000000004', 2, 15.00, 30.00, 'scheduled', 'created', 'd1000000-0000-0000-0000-000000000001'),
    ('0d000000-0000-0000-0000-000000000006', 'ORD-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-00000006', 'c0000000-0000-0000-0000-000000000008', 'add00000-0000-0000-0000-000000000008', '5b000000-0000-0000-0000-000000000009', CURRENT_DATE, 'e0d00000-0000-0000-0000-000000000006', 1, 28.00, 28.00, 'scheduled', 'created', 'd1000000-0000-0000-0000-000000000002'),
    ('0d000000-0000-0000-0000-000000000007', 'ORD-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-00000007', 'c0000000-0000-0000-0000-000000000010', 'add00000-0000-0000-0000-000000000010', '5b000000-0000-0000-0000-000000000011', CURRENT_DATE, 'e0d00000-0000-0000-0000-000000000003', 1, 35.00, 35.00, 'scheduled', 'created', 'd1000000-0000-0000-0000-000000000003');

-- Yesterday's delivered orders
INSERT INTO orders (id, order_number, user_id, address_id, subscription_id, delivery_date, product_id, quantity, unit_price, total_amount, status, payment_status, assigned_distributor_id, delivered_at) VALUES
    ('0d000000-0000-0000-0000-000000000008', 'ORD-' || to_char(CURRENT_DATE - 1, 'YYYYMMDD') || '-00000001', 'c0000000-0000-0000-0000-000000000001', 'add00000-0000-0000-0000-000000000001', '5b000000-0000-0000-0000-000000000001', CURRENT_DATE - 1, 'e0d00000-0000-0000-0000-000000000001', 1, 25.00, 25.00, 'delivered', 'captured', 'd1000000-0000-0000-0000-000000000001', (CURRENT_DATE - 1 + TIME '06:30:00')::timestamptz),
    ('0d000000-0000-0000-0000-000000000009', 'ORD-' || to_char(CURRENT_DATE - 1, 'YYYYMMDD') || '-00000002', 'c0000000-0000-0000-0000-000000000002', 'add00000-0000-0000-0000-000000000002', '5b000000-0000-0000-0000-000000000002', CURRENT_DATE - 1, 'e0d00000-0000-0000-0000-000000000005', 2, 34.00, 68.00, 'delivered', 'captured', 'd1000000-0000-0000-0000-000000000001', (CURRENT_DATE - 1 + TIME '06:35:00')::timestamptz),
    ('0d000000-0000-0000-0000-000000000010', 'ORD-' || to_char(CURRENT_DATE - 1, 'YYYYMMDD') || '-00000003', 'c0000000-0000-0000-0000-000000000004', 'add00000-0000-0000-0000-000000000004', '5b000000-0000-0000-0000-000000000005', CURRENT_DATE - 1, 'e0d00000-0000-0000-0000-000000000002', 2, 32.00, 64.00, 'delivered', 'captured', 'd1000000-0000-0000-0000-000000000001', (CURRENT_DATE - 1 + TIME '06:45:00')::timestamptz);

-- =============================================================================
-- 10. WALLET LEDGER (Initial credits for testing)
-- Using direct INSERT since we can't use credit_wallet function during seed
-- =============================================================================

INSERT INTO wallet_ledger (id, user_id, entry_type, amount, balance_before, balance_after, reference_type, reference_id, idempotency_key, description) VALUES
    -- Priya's wallet history
    ('1ed00000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'credit', 500.00, 0.00, 500.00, 'payment', NULL, 'SEED-CREDIT-001', 'Initial wallet recharge'),
    
    -- Rahul's wallet history
    ('1ed00000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 'credit', 1500.00, 0.00, 1500.00, 'payment', NULL, 'SEED-CREDIT-002', 'Initial wallet recharge'),
    ('1ed00000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002', 'debit', 300.00, 1500.00, 1200.00, 'order', NULL, 'SEED-DEBIT-001', 'Order payments'),
    
    -- Anjali's wallet
    ('1ed00000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000003', 'credit', 350.00, 0.00, 350.00, 'payment', NULL, 'SEED-CREDIT-003', 'Initial wallet recharge'),
    
    -- Vikram's wallet
    ('1ed00000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000004', 'credit', 1000.00, 0.00, 1000.00, 'payment', NULL, 'SEED-CREDIT-004', 'Initial wallet recharge'),
    ('1ed00000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000004', 'debit', 200.00, 1000.00, 800.00, 'order', NULL, 'SEED-DEBIT-002', 'Order payments'),
    
    -- Amit's wallet (big spender)
    ('1ed00000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000006', 'credit', 3000.00, 0.00, 3000.00, 'payment', NULL, 'SEED-CREDIT-005', 'Initial wallet recharge'),
    ('1ed00000-0000-0000-0000-000000000008', 'c0000000-0000-0000-0000-000000000006', 'debit', 500.00, 3000.00, 2500.00, 'order', NULL, 'SEED-DEBIT-003', 'Order payments'),
    
    -- Kavitha's wallet (low balance)
    ('1ed00000-0000-0000-0000-000000000009', 'c0000000-0000-0000-0000-000000000007', 'credit', 200.00, 0.00, 200.00, 'payment', NULL, 'SEED-CREDIT-006', 'Initial wallet recharge'),
    ('1ed00000-0000-0000-0000-000000000010', 'c0000000-0000-0000-0000-000000000007', 'debit', 50.00, 200.00, 150.00, 'order', NULL, 'SEED-DEBIT-004', 'Order payments'),
    
    -- Deepak's wallet
    ('1ed00000-0000-0000-0000-000000000011', 'c0000000-0000-0000-0000-000000000008', 'credit', 600.00, 0.00, 600.00, 'payment', NULL, 'SEED-CREDIT-007', 'Initial wallet recharge'),
    
    -- Meera's wallet
    ('1ed00000-0000-0000-0000-000000000012', 'c0000000-0000-0000-0000-000000000009', 'credit', 1000.00, 0.00, 1000.00, 'payment', NULL, 'SEED-CREDIT-008', 'Initial wallet recharge'),
    
    -- Arjun's wallet
    ('1ed00000-0000-0000-0000-000000000013', 'c0000000-0000-0000-0000-000000000010', 'credit', 450.00, 0.00, 450.00, 'payment', NULL, 'SEED-CREDIT-009', 'Initial wallet recharge');

-- =============================================================================
-- 11. PAYMENTS (Sample Razorpay payments)
-- =============================================================================

INSERT INTO payments (id, user_id, payment_provider, provider_order_id, provider_payment_id, idempotency_key, status, amount, currency) VALUES
    ('0a000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'razorpay', 'order_TEST001', 'pay_TEST001', 'PAY-SEED-001', 'captured', 500.00, 'INR'),
    ('0a000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 'razorpay', 'order_TEST002', 'pay_TEST002', 'PAY-SEED-002', 'captured', 1500.00, 'INR'),
    ('0a000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000006', 'razorpay', 'order_TEST003', 'pay_TEST003', 'PAY-SEED-003', 'captured', 3000.00, 'INR'),
    ('0a000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000009', 'razorpay', 'order_TEST004', 'pay_TEST004', 'PAY-SEED-004', 'captured', 1000.00, 'INR');

-- =============================================================================
-- 12. SUPPLIERS
-- =============================================================================

INSERT INTO suppliers (id, name, contact_name, phone, email, gst_number, is_active) VALUES
    ('50000000-0000-0000-0000-000000000001', 'Karnataka Milk Federation', 'Regional Manager', '+919900000001', 'kmf@nandini.coop', '29AAACK1234A1Z5', true),
    ('50000000-0000-0000-0000-000000000002', 'Amul Dairy Distributors', 'Sales Head', '+919900000002', 'sales@amuldairy.com', '24AAAAA5678B2Z1', true),
    ('50000000-0000-0000-0000-000000000003', 'Country Delight Farms', 'Partnership Manager', '+919900000003', 'partners@countrydelight.in', '07BBBBB9012C3Z4', true);

-- =============================================================================
-- 13. SUPPORT TICKETS (Sample issues)
-- =============================================================================

-- Open ticket - Delivery Issue
INSERT INTO support_tickets (id, ticket_number, user_id, order_id, category, priority, status, subject, description, assigned_admin_id) VALUES
    ('1c100000-0000-0000-0000-000000000001', 'TKT-' || to_char(CURRENT_DATE - 2, 'YYYYMMDD') || '-000001', 'c0000000-0000-0000-0000-000000000003', '0d000000-0000-0000-0000-000000000010', 'delivery_issue', 'high', 'open', 'Milk not delivered yesterday', 'I did not receive my milk delivery yesterday morning. The order shows delivered but I never got it.', 'a0000000-0000-0000-0000-000000000003');

-- Resolved ticket - Product Quality
INSERT INTO support_tickets (id, ticket_number, user_id, category, priority, status, subject, description, assigned_admin_id, resolution_notes, resolved_at, resolved_by) VALUES
    ('1c100000-0000-0000-0000-000000000002', 'TKT-' || to_char(CURRENT_DATE - 5, 'YYYYMMDD') || '-000001', 'c0000000-0000-0000-0000-000000000007', 'product_quality', 'medium', 'resolved', 'Curd was spoiled', 'The curd I received on Monday was already spoiled when I opened it.', 'a0000000-0000-0000-0000-000000000003', 'Refund of ₹40 processed. Spoke with supplier about cold chain issues.', CURRENT_DATE - 3, 'a0000000-0000-0000-0000-000000000003');

-- Add refund info to resolved ticket
UPDATE support_tickets 
SET refund_amount = 40.00, refund_approved = true, refund_processed_at = CURRENT_DATE - 3
WHERE id = '1c100000-0000-0000-0000-000000000002';

-- Ticket messages
INSERT INTO ticket_messages (ticket_id, sender_id, sender_role, message, is_internal_note) VALUES
    -- Open ticket messages
    ('1c100000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003', 'customer', 'I did not receive my milk delivery yesterday morning. The order shows delivered but I never got it.', false),
    ('1c100000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'admin', 'We apologize for the inconvenience. Let me check with the delivery partner.', false),
    ('1c100000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'admin', 'Checked GPS logs - distributor marked delivered at wrong building. Need to follow up.', true),
    
    -- Resolved ticket messages
    ('1c100000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000007', 'customer', 'The curd I received on Monday was already spoiled when I opened it.', false),
    ('1c100000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003', 'admin', 'We sincerely apologize. We will process a full refund and report this to our quality team.', false),
    ('1c100000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000007', 'customer', 'Thank you for the quick resolution!', false);

-- =============================================================================
-- 14. DISTRIBUTOR STOCK HANDOVER (Today's stock)
-- =============================================================================

INSERT INTO distributor_stock_handover (id, distributor_id, handover_date, stock_given, given_at, given_by) VALUES
    ('d5000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', CURRENT_DATE, 
     '[{"product_id": "e0d00000-0000-0000-0000-000000000001", "quantity": 20}, {"product_id": "e0d00000-0000-0000-0000-000000000002", "quantity": 15}, {"product_id": "e0d00000-0000-0000-0000-000000000004", "quantity": 10}, {"product_id": "e0d00000-0000-0000-0000-000000000005", "quantity": 12}, {"product_id": "e0d00000-0000-0000-0000-000000000008", "quantity": 8}]'::jsonb,
     CURRENT_DATE + TIME '05:00:00', 'a0000000-0000-0000-0000-000000000002'),
    
    ('d5000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000002', CURRENT_DATE,
     '[{"product_id": "e0d00000-0000-0000-0000-000000000006", "quantity": 15}, {"product_id": "e0d00000-0000-0000-0000-000000000011", "quantity": 5}]'::jsonb,
     CURRENT_DATE + TIME '05:15:00', 'a0000000-0000-0000-0000-000000000002'),
    
    ('d5000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000003', CURRENT_DATE,
     '[{"product_id": "e0d00000-0000-0000-0000-000000000003", "quantity": 10}]'::jsonb,
     CURRENT_DATE + TIME '05:30:00', 'a0000000-0000-0000-0000-000000000002');

-- Yesterday's completed handover (with returns)
INSERT INTO distributor_stock_handover (id, distributor_id, handover_date, stock_given, given_at, given_by, stock_returned, returned_at, received_by, discrepancy_notes) VALUES
    ('d5000000-0000-0000-0000-000000000004', 'd1000000-0000-0000-0000-000000000001', CURRENT_DATE - 1,
     '[{"product_id": "e0d00000-0000-0000-0000-000000000001", "quantity": 18}, {"product_id": "e0d00000-0000-0000-0000-000000000002", "quantity": 12}, {"product_id": "e0d00000-0000-0000-0000-000000000005", "quantity": 10}]'::jsonb,
     (CURRENT_DATE - 1) + TIME '05:00:00', 'a0000000-0000-0000-0000-000000000002',
     '[{"product_id": "e0d00000-0000-0000-0000-000000000001", "quantity": 2}, {"product_id": "e0d00000-0000-0000-0000-000000000002", "quantity": 1}]'::jsonb,
     (CURRENT_DATE - 1) + TIME '10:30:00', 'a0000000-0000-0000-0000-000000000002',
     'Customer at A-301 was not home, returned 1 unit');

-- =============================================================================
-- 15. UPDATE STATISTICS
-- =============================================================================

-- Update customer lifetime_spent and total_orders based on delivered orders
UPDATE customers c SET 
    lifetime_spent = COALESCE((
        SELECT SUM(o.total_amount) 
        FROM orders o 
        WHERE o.user_id = c.user_id AND o.status = 'delivered'
    ), 0),
    total_orders = COALESCE((
        SELECT COUNT(*) 
        FROM orders o 
        WHERE o.user_id = c.user_id AND o.status = 'delivered'
    ), 0);

-- Update subscription delivery counts
UPDATE subscriptions s SET 
    total_delivered = COALESCE((
        SELECT COUNT(*) 
        FROM orders o 
        WHERE o.subscription_id = s.id AND o.status = 'delivered'
    ), 0),
    total_skipped = COALESCE((
        SELECT COUNT(*) 
        FROM orders o 
        WHERE o.subscription_id = s.id AND o.status = 'skipped'
    ), 0);

-- Update distributor total deliveries
UPDATE distributors d SET 
    total_deliveries = COALESCE((
        SELECT COUNT(*) 
        FROM orders o 
        WHERE o.assigned_distributor_id = d.id AND o.status = 'delivered'
    ), 0);

-- =============================================================================
-- SUCCESS MESSAGE
-- =============================================================================

DO $$ BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════════';
    RAISE NOTICE '✅ PRODUCTION SEED DATA V2 INSERTED SUCCESSFULLY';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════════';
    RAISE NOTICE '';
    RAISE NOTICE '👤 USERS CREATED:';
    RAISE NOTICE '   • 1 Super Admin: +919999900001';
    RAISE NOTICE '   • 2 Admins: +919999900002, +919999900003';
    RAISE NOTICE '   • 3 Distributors: +919888800001 to +919888800003';
    RAISE NOTICE '   • 10 Customers: +919777700001 to +919777700010';
    RAISE NOTICE '';
    RAISE NOTICE '🏢 LOCATIONS:';
    RAISE NOTICE '   • 4 Societies (Prestige, Brigade, Sobha, Salarpuria)';
    RAISE NOTICE '   • 10 Towers';
    RAISE NOTICE '   • 10 Units (with customers assigned)';
    RAISE NOTICE '';
    RAISE NOTICE '🥛 PRODUCTS:';
    RAISE NOTICE '   • 4 Brands (Nandini, Amul, Heritage, Country Delight)';
    RAISE NOTICE '   • 12 Products (milk, curd, buttermilk, paneer)';
    RAISE NOTICE '';
    RAISE NOTICE '📦 ORDERS & SUBSCRIPTIONS:';
    RAISE NOTICE '   • 11 Active subscriptions';
    RAISE NOTICE '   • 7 Today''s scheduled orders';
    RAISE NOTICE '   • 3 Yesterday''s delivered orders';
    RAISE NOTICE '';
    RAISE NOTICE '💰 WALLET DATA:';
    RAISE NOTICE '   • 13 Ledger entries (credits & debits)';
    RAISE NOTICE '   • 4 Payment records';
    RAISE NOTICE '   • Balances range: ₹0 to ₹2,500';
    RAISE NOTICE '';
    RAISE NOTICE '🎫 SUPPORT:';
    RAISE NOTICE '   • 1 Open ticket (delivery issue)';
    RAISE NOTICE '   • 1 Resolved ticket (product quality)';
    RAISE NOTICE '   • 6 Ticket messages';
    RAISE NOTICE '';
    RAISE NOTICE '📸 STOCK HANDOVER:';
    RAISE NOTICE '   • 3 Today''s handovers (stock given)';
    RAISE NOTICE '   • 1 Yesterday''s complete handover (with returns)';
    RAISE NOTICE '';
    RAISE NOTICE '🔑 TEST LOGIN PHONES:';
    RAISE NOTICE '   • Customer: +919777700001 (Priya, ₹500 balance)';
    RAISE NOTICE '   • Customer: +919777700002 (Rahul, ₹1200 balance)';
    RAISE NOTICE '   • Distributor: +919888800001 (Ramesh)';
    RAISE NOTICE '   • Admin: +919999900002';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════════';
END $$;
