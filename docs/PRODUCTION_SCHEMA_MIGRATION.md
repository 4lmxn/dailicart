# Production Schema V2 Migration Guide

## Overview

This document summarizes the changes made to migrate iDaily to the production-grade financial schema (PRODUCTION_SCHEMA_V2).

## Schema Files

- **`/supabase/PRODUCTION_SCHEMA_V2.sql`** - Main production schema with all tables, RPC functions, triggers
- **`/supabase/PRODUCTION_SEED_V2.sql`** - Test data for development

## Key Financial Features

### 1. Immutable Wallet Ledger
- All wallet changes go through `wallet_ledger` table (double-entry accounting)
- No direct updates to `wallet_balance` - always calculated from ledger
- Trigger `update_wallet_balance_trigger` automatically updates cached balance

### 2. Idempotency Keys
- All financial operations require unique `idempotency_key`
- Stored in `idempotency_keys` table with 24-hour retention
- Prevents duplicate transactions from retries

### 3. Optimistic Locking
- `wallet_version` column on customers table
- Prevents race conditions with concurrent wallet operations
- Row-level locking with `FOR UPDATE` in RPC functions

### 4. RPC Functions for Wallet Operations
```sql
-- Credit wallet (deposits, refunds, admin adjustments)
credit_wallet(p_user_id, p_amount, p_reason, p_transaction_type, p_idempotency_key)

-- Debit wallet (order payments, fees)
debit_wallet(p_user_id, p_amount, p_reason, p_transaction_type, p_idempotency_key)
```

## Updated Mobile App Files

### Services (`/mobile/src/services/api/`)

| File | Changes |
|------|---------|
| `wallet.ts` | Complete rewrite to use RPC functions with idempotency |
| `support.ts` | New file for customer support ticket system |
| `customers.ts` | `adjustWallet()` now uses RPC functions |
| `customer.ts` | Updated to use addresses table, added wallet methods |
| `distributors.ts` | Added `markNoDelivery()`, `uploadPhotoProof()`, `getPhotoProofs()` |
| `products.ts` | Added `sku`, `minOrderQty`, `maxOrderQty` fields |
| `subscriptions.ts` | Added `unit_price_locked` for price locking at creation |
| `types.ts` | Complete update with all production schema types |
| `index.ts` | Added exports for new services |

### Types (`/mobile/src/types/index.ts`)

Updated types to match production schema:
- `User` - Added `isDeleted`, `deletedAt`, `failedLoginAttempts`, `lockedUntil`
- `Customer` - Added `walletVersion`, `isWalletLocked`
- `Product` - Added `sku`, `minOrderQty`, `maxOrderQty`, `costPrice`, `mrp`
- `Address` - Updated to use society/tower/unit references
- New types: `SupportTicket`, `TicketMessage`, `PhotoProof`, `WalletLedgerEntry`

### Store (`/mobile/src/store/authStore.ts`)

- Added `accountLocked` and `lockExpiresAt` state
- Added `checkAccountStatus()` to verify user isn't deleted/locked
- `loginWithSupabase()` now checks account status before allowing login

## Database Tables

### Core Tables
- `users` - User accounts with soft delete, login tracking
- `customers` - Customer profiles with wallet management
- `products` - Products with SKU, quantity limits
- `brands` - Product brands
- `societies` - Housing societies
- `society_towers` - Towers within societies
- `tower_units` - Individual units/apartments
- `addresses` - User addresses linked to society/tower/unit

### Financial Tables
- `wallet_ledger` - Immutable transaction ledger (INSERT only)
- `idempotency_keys` - Prevent duplicate operations

### Order Tables
- `orders` - Orders with `no_delivery_confirmed`, `no_delivery_reason`
- `order_items` - Line items with `unit_price` locked at creation
- `subscriptions` - Subscriptions with `unit_price_locked`

### Support Tables
- `support_tickets` - Customer support tickets
- `ticket_messages` - Messages within tickets
- `ticket_attachments` - Uploaded files for tickets
- `photo_proofs` - Distributor photo evidence (stock, returns, issues)

### Distributor Tables
- `distributor_assignments` - Society/tower assignments
- `distributor_stock_movements` - Inventory tracking

### Admin/Audit Tables
- `audit_log` - All sensitive operations logged
- `rate_limits` - API rate limiting

## Security Features

1. **Account Lockout** - After 5 failed logins, account locked for 15 minutes
2. **Soft Delete** - Users marked `is_deleted=true`, not actually deleted
3. **Rate Limiting** - Infrastructure for API rate limits
4. **Audit Log** - All admin and financial operations logged
5. **OTP Tracking** - OTPs logged in `otp_log` for security audit

## Price Locking

Prices are locked at time of creation to prevent billing disputes:

1. **Subscriptions** - `unit_price_locked` set from product price when subscription created
2. **Order Items** - `unit_price` copied from subscription or product at order creation
3. **No retroactive price changes** - Price changes only affect future orders

## Testing the Schema

1. Run `PRODUCTION_SCHEMA_V2.sql` to create all tables
2. Run `PRODUCTION_SEED_V2.sql` to populate test data
3. Test wallet operations through the app - verify idempotency works

## Test Accounts (from PRODUCTION_SEED_V2.sql)

| Email | Role | Password |
|-------|------|----------|
| customer1@test.com | Customer | test123 |
| customer2@test.com | Customer | test123 |
| distributor1@test.com | Distributor | test123 |
| distributor2@test.com | Distributor | test123 |
| admin@test.com | Admin | admin123 |

## Migration Notes

### Breaking Changes
- `wallet_transactions` table removed - use `wallet_ledger` instead
- Direct wallet balance updates no longer allowed
- All wallet operations must go through RPC functions

### Backwards Compatibility
- `customer_id` removed from subscriptions/orders - use `user_id` instead
- Old address JSON storage removed - use `addresses` table with foreign keys
