-- =============================================================================
-- COMPREHENSIVE RLS POLICIES FOR IDAILY
-- =============================================================================
-- 
-- This migration creates Row Level Security policies for ALL tables.
-- Must be run AFTER production_security_enable.sql which enables RLS.
--
-- Role hierarchy:
--   - admin: Full access to all data
--   - distributor: Access to assigned deliveries, own profile, stock data
--   - customer: Access to own data only (orders, subscriptions, wallet, etc.)
--
-- Run with: supabase db push
-- =============================================================================

-- =============================================================================
-- HELPER FUNCTION: Check if user is admin
-- =============================================================================

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM users 
        WHERE id = auth.uid() AND role = 'admin'
    );
$$;

CREATE OR REPLACE FUNCTION is_distributor()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM users 
        WHERE id = auth.uid() AND role = 'distributor'
    );
$$;

CREATE OR REPLACE FUNCTION get_distributor_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT id FROM distributors WHERE user_id = auth.uid();
$$;

-- =============================================================================
-- USERS TABLE
-- =============================================================================

DROP POLICY IF EXISTS "users_select_own" ON users;
DROP POLICY IF EXISTS "users_admin_all" ON users;
DROP POLICY IF EXISTS "users_update_own" ON users;

-- Users can see their own record
CREATE POLICY "users_select_own" ON users
    FOR SELECT TO authenticated
    USING (id = auth.uid());

-- Admins can see all users
CREATE POLICY "users_admin_all" ON users
    FOR ALL TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

-- Users can update their own profile (name, phone)
CREATE POLICY "users_update_own" ON users
    FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid() AND role = (SELECT role FROM users WHERE id = auth.uid()));

-- =============================================================================
-- CUSTOMERS TABLE
-- =============================================================================

DROP POLICY IF EXISTS "customers_select_own" ON customers;
DROP POLICY IF EXISTS "customers_admin_all" ON customers;
DROP POLICY IF EXISTS "customers_insert_own" ON customers;
DROP POLICY IF EXISTS "customers_update_own" ON customers;

-- Customers can see their own record
CREATE POLICY "customers_select_own" ON customers
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

-- Admins have full access
CREATE POLICY "customers_admin_all" ON customers
    FOR ALL TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

-- Customers can insert their own record (during onboarding)
CREATE POLICY "customers_insert_own" ON customers
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

-- Customers can update their own record (except wallet - use RPC)
CREATE POLICY "customers_update_own" ON customers
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- =============================================================================
-- DISTRIBUTORS TABLE
-- =============================================================================

DROP POLICY IF EXISTS "distributors_select_own" ON distributors;
DROP POLICY IF EXISTS "distributors_admin_all" ON distributors;

-- Distributors can see their own record
CREATE POLICY "distributors_select_own" ON distributors
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

-- Admins have full access
CREATE POLICY "distributors_admin_all" ON distributors
    FOR ALL TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

-- =============================================================================
-- DISTRIBUTOR_ACTIVATION_CODES TABLE (Admin only)
-- =============================================================================

DROP POLICY IF EXISTS "activation_codes_admin_only" ON distributor_activation_codes;

CREATE POLICY "activation_codes_admin_only" ON distributor_activation_codes
    FOR ALL TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

-- =============================================================================
-- SOCIETIES, TOWERS, UNITS (Public read for address selection)
-- =============================================================================

DROP POLICY IF EXISTS "societies_public_read" ON societies;
DROP POLICY IF EXISTS "societies_admin_write" ON societies;

CREATE POLICY "societies_public_read" ON societies
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "societies_admin_write" ON societies
    FOR ALL TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

DROP POLICY IF EXISTS "towers_public_read" ON society_towers;
DROP POLICY IF EXISTS "towers_admin_write" ON society_towers;

CREATE POLICY "towers_public_read" ON society_towers
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "towers_admin_write" ON society_towers
    FOR ALL TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

DROP POLICY IF EXISTS "units_public_read" ON tower_units;
DROP POLICY IF EXISTS "units_admin_write" ON tower_units;

CREATE POLICY "units_public_read" ON tower_units
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "units_admin_write" ON tower_units
    FOR ALL TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

-- =============================================================================
-- ADDRESSES TABLE
-- =============================================================================

DROP POLICY IF EXISTS "addresses_select_own" ON addresses;
DROP POLICY IF EXISTS "addresses_admin_all" ON addresses;
DROP POLICY IF EXISTS "addresses_insert_own" ON addresses;
DROP POLICY IF EXISTS "addresses_update_own" ON addresses;
DROP POLICY IF EXISTS "addresses_delete_own" ON addresses;
DROP POLICY IF EXISTS "addresses_distributor_view" ON addresses;

-- Customers can see their own addresses
CREATE POLICY "addresses_select_own" ON addresses
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

-- Distributors can see addresses in their assigned towers (for deliveries)
CREATE POLICY "addresses_distributor_view" ON addresses
    FOR SELECT TO authenticated
    USING (
        is_distributor() AND 
        tower_id IN (
            SELECT tower_id FROM distributor_building_assignments 
            WHERE distributor_id = get_distributor_id() AND is_active = true
        )
    );

-- Admins have full access
CREATE POLICY "addresses_admin_all" ON addresses
    FOR ALL TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

-- Customers can manage their own addresses
CREATE POLICY "addresses_insert_own" ON addresses
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "addresses_update_own" ON addresses
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "addresses_delete_own" ON addresses
    FOR DELETE TO authenticated
    USING (user_id = auth.uid());

-- =============================================================================
-- BRANDS & PRODUCTS (Public read, Admin write)
-- =============================================================================

DROP POLICY IF EXISTS "brands_public_read" ON brands;
DROP POLICY IF EXISTS "brands_admin_write" ON brands;

CREATE POLICY "brands_public_read" ON brands
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "brands_admin_write" ON brands
    FOR ALL TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

DROP POLICY IF EXISTS "products_public_read" ON products;
DROP POLICY IF EXISTS "products_admin_write" ON products;

CREATE POLICY "products_public_read" ON products
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "products_admin_write" ON products
    FOR ALL TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

-- =============================================================================
-- SUBSCRIPTIONS TABLE
-- =============================================================================

DROP POLICY IF EXISTS "subscriptions_select_own" ON subscriptions;
DROP POLICY IF EXISTS "subscriptions_admin_all" ON subscriptions;
DROP POLICY IF EXISTS "subscriptions_insert_own" ON subscriptions;
DROP POLICY IF EXISTS "subscriptions_update_own" ON subscriptions;

-- Customers can see their own subscriptions
CREATE POLICY "subscriptions_select_own" ON subscriptions
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

-- Admins have full access
CREATE POLICY "subscriptions_admin_all" ON subscriptions
    FOR ALL TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

-- Customers can create subscriptions
CREATE POLICY "subscriptions_insert_own" ON subscriptions
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

-- Customers can update their subscriptions (pause, cancel)
CREATE POLICY "subscriptions_update_own" ON subscriptions
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- =============================================================================
-- ORDERS TABLE
-- =============================================================================

DROP POLICY IF EXISTS "orders_select_own" ON orders;
DROP POLICY IF EXISTS "orders_admin_all" ON orders;
DROP POLICY IF EXISTS "orders_distributor_assigned" ON orders;
DROP POLICY IF EXISTS "orders_distributor_update" ON orders;

-- Customers can see their own orders
CREATE POLICY "orders_select_own" ON orders
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

-- Admins have full access
CREATE POLICY "orders_admin_all" ON orders
    FOR ALL TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

-- Distributors can see orders assigned to them
CREATE POLICY "orders_distributor_assigned" ON orders
    FOR SELECT TO authenticated
    USING (is_distributor() AND assigned_distributor_id = get_distributor_id());

-- Distributors can update status of orders assigned to them
CREATE POLICY "orders_distributor_update" ON orders
    FOR UPDATE TO authenticated
    USING (is_distributor() AND assigned_distributor_id = get_distributor_id())
    WITH CHECK (assigned_distributor_id = get_distributor_id());

-- =============================================================================
-- PAYMENTS TABLE
-- =============================================================================

DROP POLICY IF EXISTS "payments_select_own" ON payments;
DROP POLICY IF EXISTS "payments_admin_all" ON payments;
DROP POLICY IF EXISTS "payments_insert_own" ON payments;

-- Customers can see their own payments
CREATE POLICY "payments_select_own" ON payments
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

-- Admins have full access
CREATE POLICY "payments_admin_all" ON payments
    FOR ALL TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

-- Customers can initiate payments (insert)
CREATE POLICY "payments_insert_own" ON payments
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

-- =============================================================================
-- WALLET TABLES (Highly restricted - use RPC functions)
-- =============================================================================

DROP POLICY IF EXISTS "wallet_ledger_select_own" ON wallet_ledger;
DROP POLICY IF EXISTS "wallet_ledger_admin_all" ON wallet_ledger;

-- Customers can see their own ledger entries (read-only)
CREATE POLICY "wallet_ledger_select_own" ON wallet_ledger
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

-- Admins can view all (no direct insert/update - use RPC)
CREATE POLICY "wallet_ledger_admin_all" ON wallet_ledger
    FOR SELECT TO authenticated
    USING (is_admin());

DROP POLICY IF EXISTS "wallet_holds_select_own" ON wallet_holds;
DROP POLICY IF EXISTS "wallet_holds_admin_all" ON wallet_holds;

CREATE POLICY "wallet_holds_select_own" ON wallet_holds
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "wallet_holds_admin_all" ON wallet_holds
    FOR ALL TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

DROP POLICY IF EXISTS "wallet_transactions_select_own" ON wallet_transactions;
DROP POLICY IF EXISTS "wallet_transactions_admin_all" ON wallet_transactions;

CREATE POLICY "wallet_transactions_select_own" ON wallet_transactions
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "wallet_transactions_admin_all" ON wallet_transactions
    FOR ALL TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

-- =============================================================================
-- SUPPORT TICKETS TABLE
-- =============================================================================

DROP POLICY IF EXISTS "tickets_select_own" ON support_tickets;
DROP POLICY IF EXISTS "tickets_admin_all" ON support_tickets;
DROP POLICY IF EXISTS "tickets_insert_own" ON support_tickets;
DROP POLICY IF EXISTS "tickets_update_own" ON support_tickets;

-- Customers can see their own tickets
CREATE POLICY "tickets_select_own" ON support_tickets
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

-- Admins have full access
CREATE POLICY "tickets_admin_all" ON support_tickets
    FOR ALL TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

-- Customers can create tickets
CREATE POLICY "tickets_insert_own" ON support_tickets
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

-- Customers can update their own tickets (add messages)
CREATE POLICY "tickets_update_own" ON support_tickets
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- =============================================================================
-- TICKET MESSAGES
-- =============================================================================

DROP POLICY IF EXISTS "messages_select_own" ON ticket_messages;
DROP POLICY IF EXISTS "messages_admin_all" ON ticket_messages;
DROP POLICY IF EXISTS "messages_insert_own" ON ticket_messages;

-- Customers can see messages on their tickets
CREATE POLICY "messages_select_own" ON ticket_messages
    FOR SELECT TO authenticated
    USING (
        ticket_id IN (SELECT id FROM support_tickets WHERE user_id = auth.uid())
    );

-- Admins have full access
CREATE POLICY "messages_admin_all" ON ticket_messages
    FOR ALL TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

-- Customers can add messages to their tickets
CREATE POLICY "messages_insert_own" ON ticket_messages
    FOR INSERT TO authenticated
    WITH CHECK (
        ticket_id IN (SELECT id FROM support_tickets WHERE user_id = auth.uid())
        AND sender_type = 'customer'
    );

-- =============================================================================
-- TICKET ATTACHMENTS
-- =============================================================================

DROP POLICY IF EXISTS "attachments_select_own" ON ticket_attachments;
DROP POLICY IF EXISTS "attachments_admin_all" ON ticket_attachments;
DROP POLICY IF EXISTS "attachments_insert_own" ON ticket_attachments;

CREATE POLICY "attachments_select_own" ON ticket_attachments
    FOR SELECT TO authenticated
    USING (
        ticket_id IN (SELECT id FROM support_tickets WHERE user_id = auth.uid())
    );

CREATE POLICY "attachments_admin_all" ON ticket_attachments
    FOR ALL TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

CREATE POLICY "attachments_insert_own" ON ticket_attachments
    FOR INSERT TO authenticated
    WITH CHECK (
        ticket_id IN (SELECT id FROM support_tickets WHERE user_id = auth.uid())
    );

-- =============================================================================
-- PHOTO PROOFS (Distributor-specific)
-- =============================================================================

DROP POLICY IF EXISTS "photo_proofs_distributor_own" ON photo_proofs;
DROP POLICY IF EXISTS "photo_proofs_admin_all" ON photo_proofs;

-- Distributors can see/create their own proofs
CREATE POLICY "photo_proofs_distributor_own" ON photo_proofs
    FOR ALL TO authenticated
    USING (is_distributor() AND distributor_id = get_distributor_id())
    WITH CHECK (distributor_id = get_distributor_id());

-- Admins have full access
CREATE POLICY "photo_proofs_admin_all" ON photo_proofs
    FOR ALL TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

-- =============================================================================
-- DISTRIBUTOR BUILDING ASSIGNMENTS
-- =============================================================================

DROP POLICY IF EXISTS "assignments_distributor_own" ON distributor_building_assignments;
DROP POLICY IF EXISTS "assignments_admin_all" ON distributor_building_assignments;

-- Distributors can see their own assignments
CREATE POLICY "assignments_distributor_own" ON distributor_building_assignments
    FOR SELECT TO authenticated
    USING (is_distributor() AND distributor_id = get_distributor_id());

-- Admins have full access
CREATE POLICY "assignments_admin_all" ON distributor_building_assignments
    FOR ALL TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

-- =============================================================================
-- DISTRIBUTOR PAYOUTS
-- =============================================================================

DROP POLICY IF EXISTS "payouts_distributor_own" ON distributor_payouts;
DROP POLICY IF EXISTS "payouts_admin_all" ON distributor_payouts;

-- Distributors can see their own payouts
CREATE POLICY "payouts_distributor_own" ON distributor_payouts
    FOR SELECT TO authenticated
    USING (is_distributor() AND distributor_id = get_distributor_id());

-- Admins have full access
CREATE POLICY "payouts_admin_all" ON distributor_payouts
    FOR ALL TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

-- =============================================================================
-- DISTRIBUTOR STOCK HANDOVER
-- =============================================================================

DROP POLICY IF EXISTS "stock_handover_distributor_own" ON distributor_stock_handover;
DROP POLICY IF EXISTS "stock_handover_admin_all" ON distributor_stock_handover;

-- Distributors can see/update their own stock handovers
CREATE POLICY "stock_handover_distributor_own" ON distributor_stock_handover
    FOR ALL TO authenticated
    USING (is_distributor() AND distributor_id = get_distributor_id())
    WITH CHECK (distributor_id = get_distributor_id());

-- Admins have full access
CREATE POLICY "stock_handover_admin_all" ON distributor_stock_handover
    FOR ALL TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

-- =============================================================================
-- SUPPLIERS, PURCHASE ORDERS, STOCK (Admin only)
-- =============================================================================

DROP POLICY IF EXISTS "suppliers_admin_only" ON suppliers;
CREATE POLICY "suppliers_admin_only" ON suppliers
    FOR ALL TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

DROP POLICY IF EXISTS "purchase_orders_admin_only" ON purchase_orders;
CREATE POLICY "purchase_orders_admin_only" ON purchase_orders
    FOR ALL TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

DROP POLICY IF EXISTS "purchase_order_items_admin_only" ON purchase_order_items;
CREATE POLICY "purchase_order_items_admin_only" ON purchase_order_items
    FOR ALL TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

DROP POLICY IF EXISTS "stock_movements_admin_only" ON stock_movements;
CREATE POLICY "stock_movements_admin_only" ON stock_movements
    FOR ALL TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

-- =============================================================================
-- AUDIT LOG (Admin only, insert for service)
-- =============================================================================

DROP POLICY IF EXISTS "audit_log_admin_read" ON audit_log;
DROP POLICY IF EXISTS "audit_log_service_insert" ON audit_log;

CREATE POLICY "audit_log_admin_read" ON audit_log
    FOR SELECT TO authenticated
    USING (is_admin());

-- Service role can insert (triggers use this)
CREATE POLICY "audit_log_service_insert" ON audit_log
    FOR INSERT TO authenticated
    WITH CHECK (true);

-- =============================================================================
-- RATE LIMITS (Service use only)
-- =============================================================================

DROP POLICY IF EXISTS "rate_limits_admin_only" ON rate_limits;

CREATE POLICY "rate_limits_admin_only" ON rate_limits
    FOR ALL TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

-- =============================================================================
-- OTP REQUESTS (Service use - handled by auth functions)
-- =============================================================================

DROP POLICY IF EXISTS "otp_requests_own" ON otp_requests;

-- Users can see their own OTP requests (for debugging)
CREATE POLICY "otp_requests_own" ON otp_requests
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

-- =============================================================================
-- GRANT EXECUTE ON HELPER FUNCTIONS
-- =============================================================================

GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION is_distributor() TO authenticated;
GRANT EXECUTE ON FUNCTION get_distributor_id() TO authenticated;

-- =============================================================================
-- SUCCESS MESSAGE
-- =============================================================================

DO $$ 
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════════';
    RAISE NOTICE '✅ COMPREHENSIVE RLS POLICIES CREATED';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════════';
    RAISE NOTICE '';
    RAISE NOTICE '📋 Policies created for:';
    RAISE NOTICE '   • users, customers, distributors';
    RAISE NOTICE '   • societies, towers, units (public read)';
    RAISE NOTICE '   • addresses, subscriptions, orders';
    RAISE NOTICE '   • payments, wallet_ledger, wallet_holds, wallet_transactions';
    RAISE NOTICE '   • support_tickets, ticket_messages, ticket_attachments';
    RAISE NOTICE '   • photo_proofs, distributor assignments, payouts, stock';
    RAISE NOTICE '   • suppliers, purchase_orders, stock_movements (admin only)';
    RAISE NOTICE '   • audit_log, rate_limits, otp_requests';
    RAISE NOTICE '';
    RAISE NOTICE '🔒 Access model:';
    RAISE NOTICE '   • Admins: Full access to all tables';
    RAISE NOTICE '   • Distributors: Own data + assigned deliveries';
    RAISE NOTICE '   • Customers: Own data only';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════════';
END $$;
