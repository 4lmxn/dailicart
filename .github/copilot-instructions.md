# DailiCart Copilot Instructions

## Project Overview
DailiCart is a **milk delivery subscription app** for Indian housing societies. It has three user roles:
- **Customer**: Subscribe to products, manage wallet, track deliveries
- **Distributor**: Deliver orders to assigned buildings, track earnings
- **Admin**: Manage customers, distributors, buildings, payouts, inventory

**Stack**: React Native (Expo SDK 54) + Supabase (PostgreSQL + Auth + Edge Functions) + Zustand + NativeWind

## Architecture

### Directory Structure
```
mobile/                    # Expo React Native app
  src/
    screens/{role}/        # Role-specific screens (customer/, admin/, distributor/, auth/, dev/)
    services/api/          # Supabase API wrappers (one file per domain: wallet.ts, subscriptions.ts)
    services/auth/         # Auth flows (OTP, OAuth)
    store/                 # Zustand stores (authStore.ts is primary)
    components/            # Reusable UI (ui.tsx for Badge/Card, ui/ for specialized)
    navigation/            # Role-based navigators (RoleGate.tsx handles routing)
supabase/
  schema.sql              # Master schema (production-grade, double-entry ledger)
  functions/              # Edge Functions (analytics, razorpay_verify)
  migrations/             # Incremental DDL changes
```

### Data Flow Pattern
1. **Auth**: Supabase Auth → `authStore.loginWithSupabase()` → RoleGate routes to correct navigator
2. **API Calls**: Screens call `services/api/*.ts` → These wrap `supabase` client queries
3. **Financial Operations**: Use RPC functions (`credit_wallet`, `debit_wallet`, `get_wallet_balance`) - NEVER direct table updates

## Critical Conventions

### Screen Component Pattern
Every screen follows this structure:
```tsx
// Standard imports: AppLayout, AppBar, theme, supabase, useAuthStore
const [loading, setLoading] = useState(true);
const [refreshing, setRefreshing] = useState(false);
const [error, setError] = useState<string | null>(null);

// Always show: loading skeletons, ErrorBanner with retry, EmptyState, pull-to-refresh
```
See [OrderHistoryScreen.tsx](mobile/src/screens/customer/OrderHistoryScreen.tsx) as the canonical example.

### Supabase Query Pattern
```typescript
// Always use maybeSingle() for optional single row
const { data, error } = await supabase.from('table').select('*').eq('id', id).maybeSingle();
// For RPC calls that return balance/aggregates:
const { data, error } = await supabase.rpc('get_wallet_balance', { p_user_id: userId });
```

### Wallet Operations - CRITICAL
All wallet operations go through [wallet.ts](mobile/src/services/api/wallet.ts) with idempotency keys:
```typescript
const idempotencyKey = generateIdempotencyKey('topup');  // Prevents duplicate transactions
await supabase.rpc('credit_wallet', { p_user_id, p_amount, p_idempotency_key, ... });
```

### Navigation & Role Routing
- [RoleGate.tsx](mobile/src/navigation/RoleGate.tsx) determines which navigator to show based on user role
- Dev mode: Set `EXPO_PUBLIC_DEV_MODE_ROLE=selector|customer|admin|distributor` to bypass auth
- Deep links configured in [RootNavigator.tsx](mobile/src/navigation/RootNavigator.tsx) linking config

### Date Handling - IMPORTANT
```typescript
// WRONG: new Date().toISOString().split('T')[0]  ← Returns UTC, not India time!
// CORRECT: Use helpers
import { getLocalDateString } from '../utils/helpers';
const today = getLocalDateString();  // Returns local YYYY-MM-DD
```

## Development Commands
```bash
cd mobile
npm install
npm run start              # Metro bundler
npm run android            # Build & run Android
npm run typecheck          # TypeScript check
npm run lint               # ESLint
npm run bootstrap:demo     # Seed complete demo data
npm run seed:auth          # Seed test users only
```

## Environment Setup
Create `mobile/.env`:
```
EXPO_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role>  # For seeding only, never commit
EXPO_PUBLIC_RAZORPAY_KEY_ID=<test-key>
EXPO_PUBLIC_DEV_MODE_ROLE=selector        # Optional: bypass auth
```

## Key Patterns

### UI Components
- Use `Badge`, `Card` from [ui.tsx](mobile/src/components/ui.tsx)
- Use `Skeleton` with `noAnimation` prop in lists for performance
- Use `ErrorBanner` with `onRetry` callback for error states
- Use `EmptyState` when no data

### Adding New Screens
1. Create screen in appropriate `screens/{role}/` folder
2. Add route to corresponding navigator (`CustomerNavigator.tsx`, etc.)
3. Add deep link path in [RootNavigator.tsx](mobile/src/navigation/RootNavigator.tsx) linking config
4. Follow loading/error/empty pattern from existing screens

### Database Changes
1. Add migration in `supabase/migrations/`
2. Update `supabase/schema.sql` (master reference)
3. Run via Supabase CLI or dashboard

## Common Gotchas
- **Address verification**: RoleGate checks for address row before routing to CustomerNavigator
- **Order generation**: Uses RPC `generate_subscription_orders()` - runs server-side
- **Payments**: Razorpay verification happens via Edge Function, not client-side
- **Snake_case ↔ camelCase**: Database uses snake_case, TypeScript types use camelCase - map in API layer
