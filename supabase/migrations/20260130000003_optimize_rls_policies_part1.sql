-- Migration: Drop duplicate/redundant RLS policies (Part 1)
-- Applied: 2026-01-30
-- Purpose: Remove verbose duplicate policies in favor of concise ones

-- addresses
DROP POLICY IF EXISTS "Users can manage their own addresses" ON addresses;

-- customers 
DROP POLICY IF EXISTS "Users can view their own customer profile" ON customers;
DROP POLICY IF EXISTS "Users can create their own customer profile" ON customers;
DROP POLICY IF EXISTS "Users can update their own customer profile" ON customers;

-- orders
DROP POLICY IF EXISTS "Customers can view their own orders" ON orders;
DROP POLICY IF EXISTS "Distributors can view assigned orders" ON orders;
DROP POLICY IF EXISTS "Distributors can update assigned orders" ON orders;

-- payments
DROP POLICY IF EXISTS "Users can view their own payments" ON payments;
DROP POLICY IF EXISTS "Users can create their own payments" ON payments;

-- photo_proofs
DROP POLICY IF EXISTS "Authenticated users can upload photo proofs" ON photo_proofs;
DROP POLICY IF EXISTS "Users can view photo proofs they uploaded or related to their records" ON photo_proofs;

-- subscriptions
DROP POLICY IF EXISTS "Users can manage their own subscriptions" ON subscriptions;
DROP POLICY IF EXISTS "Distributors can view their assigned subscriptions" ON subscriptions;

-- support_tickets
DROP POLICY IF EXISTS "Users can view their own support tickets" ON support_tickets;
DROP POLICY IF EXISTS "Users can create support tickets" ON support_tickets;
DROP POLICY IF EXISTS "Users can update their own support tickets" ON support_tickets;

-- ticket_messages
DROP POLICY IF EXISTS "Users can view messages for their tickets" ON ticket_messages;
DROP POLICY IF EXISTS "Users can create messages on their tickets" ON ticket_messages;

-- ticket_attachments
DROP POLICY IF EXISTS "Users can view attachments for their tickets" ON ticket_attachments;
DROP POLICY IF EXISTS "Users can create attachments for their tickets" ON ticket_attachments;

-- wallet_transactions
DROP POLICY IF EXISTS "Users can view their own wallet transactions" ON wallet_transactions;

-- wallet_ledger
DROP POLICY IF EXISTS "Users can view their own ledger entries" ON wallet_ledger;

-- wallet_holds
DROP POLICY IF EXISTS "Users can view their own holds" ON wallet_holds;

-- distributor tables
DROP POLICY IF EXISTS "Distributors can view their own building assignments" ON distributor_building_assignments;
DROP POLICY IF EXISTS "Distributors can view their own payouts" ON distributor_payouts;
DROP POLICY IF EXISTS "Distributors can manage their own stock handovers" ON distributor_stock_handover;
