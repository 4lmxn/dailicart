-- Migration: Consolidate RLS policies into unified access policies
-- Applied: 2026-01-30
-- Purpose: Merge admin + user policies into single policies to eliminate "multiple permissive policies" warnings

-- This migration consolidated separate admin_all and user_own policies into unified policies
-- Pattern: Single policy using OR conditions to check admin OR owner access

-- Tables consolidated:
-- - addresses: addresses_access (admin OR owner OR distributor viewing assigned)
-- - customers: customers_access (admin OR owner)
-- - orders: orders_select, orders_update, orders_insert, orders_delete
-- - payments: payments_access
-- - photo_proofs: photo_proofs_access
-- - subscriptions: subscriptions_access
-- - support_tickets: support_tickets_access
-- - ticket_messages: ticket_messages_access
-- - ticket_attachments: ticket_attachments_access
-- - wallet_transactions, wallet_ledger, wallet_holds: *_access
-- - distributor_building_assignments, distributor_payouts, distributor_stock_handover: *_access
-- - brands, products, societies, society_towers, tower_units: read + write/update/delete split
-- - users: users_select, users_insert, users_update

-- All policies use (select auth.uid()) pattern for performance optimization
