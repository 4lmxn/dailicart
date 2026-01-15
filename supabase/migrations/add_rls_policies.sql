-- Migration: Add Row-Level Security Policies for Production
-- This enables RLS and adds proper policies to protect user data
-- Run this ONLY in production or when ready for proper security

-- =============================================================================
-- IMPORTANT: This migration enables RLS. In development, RLS may be disabled.
-- Run `supabase/disable_rls_dev.sql` to disable RLS for local development.
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_attachments ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- USERS TABLE POLICIES
-- =============================================================================

-- Users can read their own profile
CREATE POLICY "users_select_own" ON users
  FOR SELECT USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "users_update_own" ON users
  FOR UPDATE USING (auth.uid() = id);

-- Admins can read all users
CREATE POLICY "users_admin_select" ON users
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- =============================================================================
-- CUSTOMERS TABLE POLICIES
-- =============================================================================

-- Customers can read their own customer record
CREATE POLICY "customers_select_own" ON customers
  FOR SELECT USING (user_id = auth.uid());

-- Customers can update their own customer record (limited fields handled by triggers)
CREATE POLICY "customers_update_own" ON customers
  FOR UPDATE USING (user_id = auth.uid());

-- Distributors can read customer info for assigned buildings (for delivery)
CREATE POLICY "customers_distributor_select" ON customers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM distributors d
      JOIN distributor_building_assignments dba ON d.id = dba.distributor_id
      JOIN addresses a ON a.tower_id = dba.tower_id
      WHERE d.user_id = auth.uid() AND a.user_id = customers.user_id
    )
  );

-- Admins can read all customers
CREATE POLICY "customers_admin_select" ON customers
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- =============================================================================
-- ADDRESSES TABLE POLICIES
-- =============================================================================

-- Users can manage their own addresses
CREATE POLICY "addresses_select_own" ON addresses
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "addresses_insert_own" ON addresses
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "addresses_update_own" ON addresses
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "addresses_delete_own" ON addresses
  FOR DELETE USING (user_id = auth.uid());

-- Distributors can read addresses in their assigned buildings
CREATE POLICY "addresses_distributor_select" ON addresses
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM distributors d
      JOIN distributor_building_assignments dba ON d.id = dba.distributor_id
      WHERE d.user_id = auth.uid() AND dba.tower_id = addresses.tower_id
    )
  );

-- =============================================================================
-- SUBSCRIPTIONS TABLE POLICIES
-- =============================================================================

-- Users can manage their own subscriptions
CREATE POLICY "subscriptions_select_own" ON subscriptions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "subscriptions_insert_own" ON subscriptions
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "subscriptions_update_own" ON subscriptions
  FOR UPDATE USING (user_id = auth.uid());

-- Admins can read all subscriptions
CREATE POLICY "subscriptions_admin_select" ON subscriptions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- =============================================================================
-- ORDERS TABLE POLICIES
-- =============================================================================

-- Users can read their own orders
CREATE POLICY "orders_select_own" ON orders
  FOR SELECT USING (user_id = auth.uid());

-- Users can create orders for themselves
CREATE POLICY "orders_insert_own" ON orders
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Users can update their own orders (limited - only skip/modify)
CREATE POLICY "orders_update_own" ON orders
  FOR UPDATE USING (
    user_id = auth.uid() 
    AND status IN ('scheduled', 'pending', 'assigned')
  );

-- Distributors can read orders assigned to them
CREATE POLICY "orders_distributor_select" ON orders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM distributors WHERE user_id = auth.uid() AND id = orders.assigned_distributor_id
    )
  );

-- Distributors can update orders assigned to them (mark delivered)
CREATE POLICY "orders_distributor_update" ON orders
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM distributors WHERE user_id = auth.uid() AND id = orders.assigned_distributor_id
    )
  );

-- Admins can read/update all orders
CREATE POLICY "orders_admin_all" ON orders
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- =============================================================================
-- WALLET TRANSACTIONS POLICIES
-- =============================================================================

-- Users can read their own wallet transactions
CREATE POLICY "wallet_transactions_select_own" ON wallet_transactions
  FOR SELECT USING (user_id = auth.uid());

-- Only server/admin can insert wallet transactions (via RPC functions)
CREATE POLICY "wallet_transactions_admin_insert" ON wallet_transactions
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- =============================================================================
-- WALLET LEDGER POLICIES
-- =============================================================================

-- Users can read their own wallet ledger
CREATE POLICY "wallet_ledger_select_own" ON wallet_ledger
  FOR SELECT USING (user_id = auth.uid());

-- Admins can read all ledger entries
CREATE POLICY "wallet_ledger_admin_select" ON wallet_ledger
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- =============================================================================
-- SUPPORT TICKETS POLICIES
-- =============================================================================

-- Users can read their own support tickets
CREATE POLICY "support_tickets_select_own" ON support_tickets
  FOR SELECT USING (user_id = auth.uid());

-- Users can create support tickets
CREATE POLICY "support_tickets_insert_own" ON support_tickets
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Users can update their own tickets (close, etc.)
CREATE POLICY "support_tickets_update_own" ON support_tickets
  FOR UPDATE USING (user_id = auth.uid());

-- Admins can manage all tickets
CREATE POLICY "support_tickets_admin_all" ON support_tickets
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- =============================================================================
-- TICKET MESSAGES POLICIES
-- =============================================================================

-- Users can read messages on their tickets
CREATE POLICY "ticket_messages_select_own" ON ticket_messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM support_tickets WHERE id = ticket_messages.ticket_id AND user_id = auth.uid())
  );

-- Users can add messages to their tickets
CREATE POLICY "ticket_messages_insert_own" ON ticket_messages
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM support_tickets WHERE id = ticket_messages.ticket_id AND user_id = auth.uid())
  );

-- Admins can manage all messages
CREATE POLICY "ticket_messages_admin_all" ON ticket_messages
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- =============================================================================
-- TICKET ATTACHMENTS POLICIES
-- =============================================================================

-- Users can read attachments on their tickets
CREATE POLICY "ticket_attachments_select_own" ON ticket_attachments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM support_tickets st
      JOIN ticket_messages tm ON tm.ticket_id = st.id
      WHERE tm.id = ticket_attachments.message_id AND st.user_id = auth.uid()
    )
  );

-- Users can add attachments to their ticket messages
CREATE POLICY "ticket_attachments_insert_own" ON ticket_attachments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM support_tickets st
      JOIN ticket_messages tm ON tm.ticket_id = st.id
      WHERE tm.id = ticket_attachments.message_id AND st.user_id = auth.uid()
    )
  );

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON POLICY "users_select_own" ON users IS 'Users can read their own profile';
COMMENT ON POLICY "customers_select_own" ON customers IS 'Customers can read their own record';
COMMENT ON POLICY "orders_distributor_update" ON orders IS 'Distributors can only update orders assigned to them';
