# iDaily Project — Interview Documentation (Part 1: Overview & Architecture)

**Created for**: Technical Interviews  
**Purpose**: Standalone guide to explain the entire project without access to codebase  
**Last Updated**: January 2026

---

## Table of Contents - Part 1
1. [Project Overview](#project-overview)
2. [Business Problem & Solution](#business-problem--solution)
3. [System Architecture](#system-architecture)
4. [Technology Stack Deep Dive](#technology-stack-deep-dive)
5. [Development Environment](#development-environment)
6. [Project Structure](#project-structure)

---

## Project Overview

### What is iDaily?
iDaily is a **mobile-first distribution and order management platform** designed for the **daily essentials delivery business** (milk, groceries, etc.). It connects three primary user roles:
- **Customers**: Order products, manage subscriptions, track deliveries
- **Distributors**: Receive assignments, manage deliveries, track earnings
- **Admins**: Manage inventory, distributors, customers, analytics, payouts

### Key Statistics
- **Platform**: React Native (Expo) — Cross-platform (iOS, Android, Web)
- **Backend**: Supabase (Postgres + Auth + Edge Functions)
- **Database Tables**: 25+ core tables with complete audit trail
- **Migrations**: 10+ SQL migrations for schema versioning
- **Functions**: 6+ Supabase functions for analytics and order generation
- **Lines of Code**: ~15,000+ TypeScript/SQL

### My Role & Contributions
**Position**: Full-Stack Developer (Solo Developer on this project)

**Frontend Responsibilities**:
- Designed and built entire React Native mobile application
- Implemented 30+ screens across 3 user roles
- Created reusable component library (AppBar, Cards, Toasts, etc.)
- Built complex navigation with role-based access control
- Integrated Razorpay payment gateway
- Implemented offline handling and error boundaries
- State management using Zustand

**Backend Responsibilities**:
- Designed complete database schema with financial-grade constraints
- Wrote 10+ SQL migrations for incremental schema updates
- Implemented Row Level Security (RLS) policies for data protection
- Created Supabase Edge Functions for analytics and order generation
- Built payment verification endpoint with idempotency protection
- Designed double-entry ledger for wallet transactions
- Implemented audit logging system

**DevOps & Testing**:
- Created comprehensive seed scripts for reproducible demos
- Built bootstrap system for quick environment setup
- Wrote migration rollback and testing procedures
- Implemented environment-based configurations

---

## Business Problem & Solution

### Problem Statement
Traditional daily essentials delivery (milk, groceries) faces several challenges:
1. **Manual Order Management**: Phone calls, WhatsApp messages for daily orders
2. **Subscription Complexity**: Tracking recurring orders, pauses, and modifications
3. **Distributor Coordination**: Inefficient assignment and route optimization
4. **Payment Tracking**: Cash handling, wallet management, payout calculations
5. **Analytics Gap**: No real-time insights into revenue, deliveries, or customer behavior

### Solution Approach
Built a **centralized mobile platform** with:
- **Digital Ordering**: Customers order via app with one-time or subscription options
- **Automated Scheduling**: System generates orders from subscriptions automatically
- **Smart Assignment**: Distributors assigned based on geographic zones (buildings/societies)
- **Wallet System**: Prepaid wallet with auto-deduct, reducing cash handling
- **Real-time Analytics**: Dashboard showing revenue, deliveries, top products
- **Photo Proofs**: Distributors upload delivery/stock photos for accountability

---

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        MOBILE APPLICATION                        │
│  (React Native + Expo - iOS, Android, Web)                     │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │   Customer   │  │ Distributor  │  │    Admin     │         │
│  │   Screens    │  │   Screens    │  │   Screens    │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│           ▲                ▲                 ▲                   │
│           └────────────────┴─────────────────┘                   │
│                           │                                      │
│                  ┌────────▼────────┐                            │
│                  │  Navigation     │                            │
│                  │  (Role-based)   │                            │
│                  └────────┬────────┘                            │
│                           │                                      │
│                  ┌────────▼────────┐                            │
│                  │  State Stores   │                            │
│                  │  (Zustand)      │                            │
│                  └────────┬────────┘                            │
│                           │                                      │
│                  ┌────────▼────────┐                            │
│                  │  Supabase       │                            │
│                  │  Client SDK     │                            │
│                  └────────┬────────┘                            │
└──────────────────────────┼──────────────────────────────────────┘
                           │
                           │ HTTPS / WebSocket (Realtime)
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                      SUPABASE PLATFORM                           │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    PostgreSQL Database                   │   │
│  │                                                          │   │
│  │  • 25+ Tables (Users, Orders, Products, Wallets, etc.)  │   │
│  │  • Row Level Security (RLS) Policies                    │   │
│  │  • Triggers & Functions                                 │   │
│  │  • Audit Logging                                        │   │
│  │  • Idempotency Keys                                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  Authentication Service                  │   │
│  │                                                          │   │
│  │  • JWT-based authentication                             │   │
│  │  • OAuth providers (Google, etc.)                       │   │
│  │  • Session management                                   │   │
│  │  • Account locking/rate limiting                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   Edge Functions (Deno)                  │   │
│  │                                                          │   │
│  │  • generate_orders: Auto-create recurring orders        │   │
│  │  • razorpay_verify: Payment signature verification      │   │
│  │  • analytics-*: Revenue, deliveries, growth metrics     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   Storage Buckets                        │   │
│  │                                                          │   │
│  │  • support-attachments: Customer support photos         │   │
│  │  • Profile images, product images                       │   │
│  └─────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
                           │
                           │ Webhook
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                   RAZORPAY PAYMENT GATEWAY                       │
│  • Payment processing                                            │
│  • Signature verification                                        │
│  • Refund handling                                               │
└──────────────────────────────────────────────────────────────────┘
```

### Architecture Patterns & Principles

#### 1. **Separation of Concerns**
- **Presentation Layer**: React Native components (screens, UI components)
- **Business Logic**: Zustand stores + service layer
- **Data Access**: Supabase client with typed queries
- **Database Logic**: Postgres functions, triggers, constraints

#### 2. **Role-Based Access Control (RBAC)**
- Frontend: `RoleGate.tsx` component routes users based on role
- Backend: RLS policies enforce data visibility per user role
- Navigation: Separate navigators for Customer/Distributor/Admin

#### 3. **Financial-Grade Data Integrity**
- **Double-entry ledger**: Every transaction has credit + debit entries
- **Immutable records**: Ledger entries cannot be updated/deleted
- **Idempotency**: All financial operations protected against duplicates
- **Row-level locking**: Concurrent balance updates handled safely
- **Audit trail**: Complete history of all data changes

#### 4. **Offline-First Considerations**
- Error boundaries catch and display errors gracefully
- Optimistic UI updates with rollback on failure
- Retry mechanisms for failed operations
- Offline indicator in UI

---

## Technology Stack Deep Dive

### Frontend Technologies

#### **React Native 0.81.5** (with Expo 54)
**Why chosen**:
- Cross-platform development (iOS, Android, Web from single codebase)
- Rich ecosystem of libraries and tools
- Hot reload for faster development
- Expo simplifies native module integration

**Key features used**:
- Navigation (React Navigation 7)
- Async Storage for local persistence
- Image picker for photo uploads
- Linking for deep links and OAuth
- Notifications (expo-notifications)

#### **TypeScript 5.9**
**Why chosen**:
- Type safety prevents runtime errors
- Better IDE support and autocomplete
- Easier refactoring and maintenance
- Self-documenting code

**Key concepts applied**:
- Interface definitions for all data models
- Type-safe API wrappers
- Generic components with proper typing
- Discriminated unions for state management

#### **Zustand 5.0** (State Management)
**Why chosen over Redux/MobX**:
- Minimal boilerplate
- Simple API (create + hooks)
- TypeScript-friendly
- No provider wrapper needed
- Great performance with selective subscriptions

**Stores implemented**:
- `authStore`: User authentication state
- `adminDashboardStore`: Admin metrics and data
- `analyticsStore`: Dashboard analytics
- Per-feature stores for complex screens

#### **NativeWind 2.0** (Styling)
**Why chosen**:
- Tailwind CSS utility classes in React Native
- Consistent styling system
- Responsive design support
- Smaller bundle size than traditional CSS-in-JS

#### **React Hook Form 7.66** + **Zod 4.1** (Forms & Validation)
**Why chosen**:
- Performant (uncontrolled components)
- Built-in validation with Zod schema
- TypeScript integration
- Less re-renders

**Usage example**:
```typescript
const schema = z.object({
  phone: z.string().regex(/^\+[0-9]{10,15}$/, 'Invalid phone'),
  amount: z.number().min(1).max(10000),
});
```

### Backend Technologies

#### **Supabase (PostgreSQL 15)**
**Why chosen**:
- Managed Postgres with automatic backups
- Built-in authentication and RLS
- Real-time subscriptions via WebSockets
- Edge functions for serverless compute
- Storage buckets for file uploads
- Faster development than custom backend

**Key features used**:
- **Auth**: JWT-based authentication, OAuth providers
- **Database**: Full Postgres power (triggers, functions, constraints)
- **RLS**: Row-level security for data isolation
- **Realtime**: Live updates for orders/assignments
- **Storage**: Image uploads for proofs
- **Edge Functions**: Deno-based serverless functions

#### **PostgreSQL Functions & Triggers**
**Custom SQL Functions**:
```sql
-- Auto-generate orders from subscriptions
generate_subscription_orders(p_start DATE, p_end DATE, p_user_id UUID)

-- Wallet operations with ledger
credit_wallet(customer_id, amount, description, ...)
debit_wallet(customer_id, amount, description, ...)

-- Query helpers
get_distributor_buildings(distributor_id)
get_customer_default_address(customer_id)
```

**Triggers Used**:
- `set_updated_at()`: Auto-update timestamp on row changes
- `prevent_ledger_mutation()`: Block updates to immutable ledger
- `set_order_number()`: Auto-generate sequential order numbers

#### **Razorpay Integration**
**Payment Flow**:
1. Client creates order in database
2. Client calls Razorpay SDK to open payment UI
3. User completes payment
4. Razorpay returns payment ID + signature
5. Client calls `razorpay_verify` function with signature
6. Function verifies HMAC signature server-side
7. Updates payment status atomically with idempotency check

---

## Development Environment

### Prerequisites
```bash
Node.js: v18+ (LTS)
npm: v9+
Expo CLI: Latest
Supabase CLI: Optional (for local dev)
```

### Environment Variables
```bash
# mobile/.env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
EXPO_PUBLIC_RAZORPAY_KEY_ID=rzp_test_xxxxx

# Optional: Force role for dev testing
EXPO_PUBLIC_FORCE_ROLE=customer  # customer|admin|distributor
```

### Installation Steps
```bash
# 1. Clone and navigate to mobile directory
cd mobile

# 2. Install dependencies
npm install

# 3. Copy environment file
cp .env.example .env
# Edit .env with your Supabase and Razorpay credentials

# 4. Start development server
npx expo start

# 5. Run on device
# - Press 'a' for Android emulator
# - Press 'i' for iOS simulator
# - Scan QR code with Expo Go app for physical device
```

### Database Setup
```bash
# 1. Create Supabase project at https://supabase.com

# 2. Run schema in SQL Editor
# Execute: supabase/schema.sql

# 3. Apply migrations (in order)
# Execute files in supabase/migrations/

# 4. Seed demo data
cd mobile
node database/bootstrap.js
# OR execute: supabase/seed.sql in SQL Editor
```

### Development Workflows

#### Hot Reload
- Code changes reflect immediately in Expo Go
- State preserved across most reloads
- Console logs visible in terminal

#### Debugging
- React Native Debugger
- Chrome DevTools (press 'j' in Metro)
- Console logs in terminal
- Supabase logs in dashboard

#### Testing Changes
```bash
# Type checking
npm run typecheck

# Linting
npm run lint

# Run specific seed
npm run seed:auth
npm run seed:orders
npm run seed:distributors

# Bootstrap complete demo environment
npm run bootstrap:demo
```

---

## Project Structure

### Repository Layout
```
iDaily/
├── mobile/                    # React Native application
│   ├── src/
│   │   ├── components/       # Reusable UI components
│   │   ├── navigation/       # Navigation configuration
│   │   ├── screens/          # Screen components
│   │   ├── services/         # API clients and utilities
│   │   ├── store/            # Zustand stores
│   │   ├── types/            # TypeScript definitions
│   │   ├── utils/            # Helper functions
│   │   └── theme/            # Styling and theme
│   ├── database/             # Seed scripts (Node.js)
│   ├── scripts/              # Dev tools
│   ├── App.tsx               # App entry point
│   └── package.json
├── supabase/                  # Database and functions
│   ├── schema.sql            # Complete database schema
│   ├── seed.sql              # Seed data
│   ├── migrations/           # Incremental schema changes
│   └── functions/            # Edge functions (Deno)
└── docs/                      # Documentation
    └── *.md                  # Technical guides
```

### Key Directories Explained

#### `mobile/src/components/`
**Reusable UI components** used across the app:
- `AppBar.tsx`: Top navigation bar with back button, title, actions
- `AppLayout.tsx`: Standard screen wrapper with padding and safe areas
- `ListItem.tsx`: Consistent list row component
- `Toast.tsx`: Toast notification system
- `ErrorBanner.tsx`: Error display component
- `ErrorBoundary.tsx`: React error boundary wrapper
- `OfflineBar.tsx`: Network status indicator
- `Skeleton.tsx`, `SkeletonList.tsx`: Loading placeholders
- `ui/`: Sub-components (Badge, Card, MetricCard, etc.)

#### `mobile/src/navigation/`
**Navigation structure**:
- `RootNavigator.tsx`: Root navigation container
- `AuthNavigator.tsx`: Login, signup, onboarding flows
- `CustomerNavigator.tsx`: Customer-specific screens
- `DistributorNavigator.tsx`: Distributor-specific screens
- `AdminNavigator.tsx`: Admin-specific screens
- `RoleGate.tsx`: Central role-based router
- `types.ts`: Navigation type definitions
- `linking.ts`: Deep linking configuration

#### `mobile/src/screens/`
**Feature screens organized by role**:
- `admin/`: 15+ admin screens (dashboard, customer management, orders, etc.)
- `customer/`: Customer screens (products, orders, wallet, subscriptions)
- `distributor/`: Distributor screens (deliveries, earnings, schedule)
- `auth/`: Login, signup, forgot password screens
- `dev/`: Development tools and debug screens

#### `mobile/src/services/`
**API clients and integrations**:
- `supabase.ts`: Supabase client initialization
- `api/`: Typed API wrappers (customer, orders, products, etc.)
- `auth/`: Authentication service
- `payment/`: Razorpay integration
- `address.ts`: Address validation and formatting

#### `mobile/src/store/`
**State management** with Zustand:
- `authStore.ts`: Authentication state, user session
- `adminDashboardStore.ts`: Admin dashboard metrics
- `analyticsStore.ts`: Analytics data

#### `supabase/migrations/`
**Database version control**:
- `00_fresh_database_setup.sql`: Initial schema
- `add_realtime_order_generation.sql`: Order automation
- `add_rls_policies.sql`: Security policies
- `add_idempotency_and_security_final.sql`: Financial protection
- `add_missed_delivery_handling.sql`: Delivery status logic
- And more...

#### `supabase/functions/`
**Serverless functions**:
- `generate_orders/`: Auto-generate recurring orders
- `razorpay_verify/`: Payment verification
- `analytics-customers-growth/`: Customer growth metrics
- `analytics-deliveries/`: Delivery statistics
- `analytics-products-top/`: Top-selling products
- `analytics-revenue/`: Revenue reports

#### `mobile/database/`
**Seed scripts for demos**:
- `bootstrap.js`: Run all seeds in sequence
- `seed-auth.js`: Create demo users
- `seed-distributors.js`: Create distributor accounts
- `seed-customers.js`: Create customer accounts
- `seed-orders.js`: Generate sample orders
- `seed-subscriptions.js`: Create subscriptions
- And more specialized seeds...

---

**End of Part 1**

**Next Parts**:
- Part 2: Database Schema & Data Models
- Part 3: Code Implementation Examples
- Part 4: Features & User Flows
- Part 5: Interview Talking Points & Demo Script
