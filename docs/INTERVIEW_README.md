# iDaily — Interview Documentation

A concise, end-to-end overview to showcase decisions, architecture, keywords, and demo steps.

## Overview
- Purpose: Mobile-first platform for customers, distributors, and admins to manage orders, subscriptions, deliveries, and analytics.
- Scope: React Native (Expo) app + Supabase (Postgres, Auth, Functions) + SQL migrations + seed data.
- Role: Full‑stack; implemented mobile UI/flows, Supabase integration, SQL migrations/functions, payment verification, analytics.

## Tech Stack (Keywords)
- Frontend: React Native (Expo), TypeScript, Tailwind-style utilities, custom UI components.
- State & Navigation: Zustand (or similar store pattern), React Navigation.
- Backend: Supabase (Postgres, Auth, Edge/DB Functions), SQL migrations.
- Analytics: Server-side SQL functions (aggregation), dashboard stores.
- Payments: Razorpay verification function, idempotency safeguards.
- Tooling: ESLint, Babel, tsconfig, seed scripts.

## Architecture (High-Level)
- Mobile client handles UI, auth, role gating, and data operations.
- Supabase provides Auth, Postgres DB, RLS policies, functions for analytics and order generation.
- SQL migrations version the schema and enforce data integrity and security.
- Seed scripts create reproducible demo environments.

## Repository & Folders (Essentials)
- Mobile app: `mobile/`
  - Entry: `mobile/App.tsx`, `mobile/index.ts`
  - UI: `mobile/src/components/*`
  - Navigation: `mobile/src/navigation/*` (role-based routes via `RoleGate.tsx`)
  - Screens: `mobile/src/screens/*` (admin, customer, distributor)
  - Services: `mobile/src/services/*` (Supabase client, address, APIs)
  - Stores: `mobile/src/store/*` (auth, analytics, admin dashboard)
- Database & Supabase: `supabase/`, `supabase/functions/*`, `supabase/seed.sql`, `migrations/*`
- Seeds: `mobile/database/*.js` (bootstrap and domain-specific seeders)
- Docs: `docs/*.md` (API, seeding, production migration guides)

## Core Features & Flows
- Auth & Roles: Supabase Auth; UI gated by role (`RoleGate.tsx`).
- Customer Ordering: browse products, create orders/subscriptions; server validates, assigns distributor.
- Distributor Operations: view assignments, mark deliveries; handle missed deliveries.
- Admin Tooling: customer/distributor management, manual order creation, inventory, payouts.
- Analytics: revenue, deliveries, product top metrics via Supabase functions ↔ mobile stores.
- Payments: Razorpay verification (server-side), idempotency protection for safe retries.
- Subscriptions & Scheduling: generate recurring orders via SQL functions (`generate_orders`).
- Offline & UX: components for error handling and status (e.g., `ErrorBanner.tsx`, `OfflineBar.tsx`).

## Data Model (High-Level Entities)
- Customers, Distributors, Buildings/Assignments, Products, Orders, OrderItems.
- Subscriptions, Schedules, Payouts, Inventory Movements, Support Attachments.
- Activation Codes (for distributors), Audit/Analytics tables.

## Supabase Functions (Examples)
- Analytics: `analytics-customers-growth`, `analytics-deliveries`, `analytics-products-top`, `analytics-revenue`.
- Order Generation: `generate_orders` (recurring orders from subscriptions/schedules).
- Payment: `razorpay_verify` (server-side signature verification and idempotency).

## Security, Policies & Integrity
- Row Level Security (RLS): restrict data access by role and ownership.
- Grants & Policies: configured in migrations (e.g., `add_rls_policies.sql`).
- Idempotency & Safety: migrations add guards against duplicate orders/payments.
- Dev Mode: `supabase/disable_rls_dev.sql` for local testing when needed.

## Migrations (Selected Highlights)
- Fresh setup: `migrations/00_fresh_database_setup.sql`
- Real-time order generation: `migrations/add_realtime_order_generation.sql`
- Missed delivery handling: `migrations/add_missed_delivery_handling.sql`
- RLS policies: `migrations/add_rls_policies.sql`
- Idempotency/security: `migrations/add_idempotency_and_security_final.sql`

## Setup & Run (Local Demo)
1. Mobile app
   ```bash
   cd mobile
   npm install
   npx expo start
   ```
2. Database (Supabase/Postgres)
   - Apply migrations: run files under `supabase/schema.sql` and `migrations/*` against your DB.
   - Seed data:
     ```bash
     node database/bootstrap.js
     # or execute supabase/seed.sql in your DB
     ```
3. Environment
   - Copy `.env.example` → `.env` and set Supabase URL/Key and Razorpay credentials.

## Demo Script (5–7 minutes)
- Auth: sign in (or use seeded accounts) → land in role-based home.
- Customer: create an order and/or subscription; show order state.
- Distributor: show assigned deliveries; mark completion/missed.
- Admin: open dashboard; show analytics; create manual order.
- Backend: briefly show `generate_orders` and an `analytics-*` function in Supabase folder.

## Terminologies & Keywords (Interview)
- React Native, Expo, TypeScript, Tailwind utilities
- React Navigation, Deep Linking, Role Gating
- Zustand (store pattern), Async State, Toasts
- Supabase, Postgres, RLS (Row Level Security), Grants
- SQL Migrations, Seed Data, Idempotency
- Edge/DB Functions, Aggregations, Analytics
- Razorpay, Signature Verification, Payment Idempotency
- CDN/Image Uploads, Attachments Bucket
- Dev/Prod Schema, Migration Drifts, Seeding Strategy

## Design Decisions & Trade‑offs
- Supabase over custom backend: faster iteration, built-in Auth/RLS; trade-off is vendor features/limits.
- SQL-side analytics: performance by running close to data; simpler client code; trade-off is SQL complexity.
- Role-gated navigation: secure UX and reduced errors; requires clear role policies.
- Seeds for demos: reproducibility; maintain additional scripts.

## Challenges & Solutions
- Duplicate orders/payments: implemented idempotency checks and final security migration.
- Missed deliveries: added explicit handling and status updates via migration/policies.
- Distributor/Building assignment consistency: migrations + admin tooling to audit/fix.
- Payment verification: server-side signature verification function with safe retries.

## Performance & Security Notes
- Server-side aggregation via SQL functions; minimal data over the wire.
- RLS + grants enforce least privilege.
- Idempotency protects against network retries and double submissions.
- Potential optimizations: materialized summaries, indexes based on query patterns (future work).

## Future Improvements
- End-to-end tests for critical flows.
- CI pipeline to run migrations/seeds and basic smoke tests.
- Observability: structured logs for functions, error tracking in app.
- Offline sync strategies for distributor routes.

## Talking Points (Interview)
- Pitch the problem and why mobile-first.
- Walk through one flow end‑to‑end (customer → order → distributor → admin analytics).
- Show code: `mobile/src/navigation/RoleGate.tsx`, `mobile/src/store/adminDashboardStore.ts`, `supabase/functions/generate_orders`.
- Explain a migration (e.g., `add_idempotency_and_security_final.sql`) and its impact.
- Discuss trade-offs and how you’d scale: queuing, background jobs, caching.

---

If you want, I can tailor the demo accounts and environment file for a live interview run-through.