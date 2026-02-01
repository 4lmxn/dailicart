-- Migration: Add indexes for frequently used foreign keys
-- Applied: 2026-01-30
-- Purpose: Improve query performance for high-traffic tables

-- orders table
CREATE INDEX IF NOT EXISTS idx_orders_address_id ON orders(address_id);
CREATE INDEX IF NOT EXISTS idx_orders_product_id ON orders(product_id);

-- subscriptions table
CREATE INDEX IF NOT EXISTS idx_subscriptions_address_id ON subscriptions(address_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_product_id ON subscriptions(product_id);

-- addresses table
CREATE INDEX IF NOT EXISTS idx_addresses_society_id ON addresses(society_id);
CREATE INDEX IF NOT EXISTS idx_addresses_unit_id ON addresses(unit_id);

-- wallet_transactions table
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_ledger_entry_id ON wallet_transactions(ledger_entry_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_order_id ON wallet_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_payment_id ON wallet_transactions(payment_id);

-- wallet_holds table  
CREATE INDEX IF NOT EXISTS idx_wallet_holds_order_id ON wallet_holds(order_id);

-- wallet_ledger table
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_created_by ON wallet_ledger(created_by);

-- support_tickets table
CREATE INDEX IF NOT EXISTS idx_support_tickets_order_id ON support_tickets(order_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_subscription_id ON support_tickets(subscription_id);

-- purchase_order_items table
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_purchase_order_id ON purchase_order_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_product_id ON purchase_order_items(product_id);

-- distributor_building_assignments table
CREATE INDEX IF NOT EXISTS idx_distributor_building_assignments_society_id ON distributor_building_assignments(society_id);
