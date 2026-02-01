# 🥛 DailiCart

A modern milk delivery subscription app for Indian housing societies. Customers subscribe to daily essentials, distributors manage deliveries efficiently, and admins oversee the entire operation.

## ✨ Features

### For Customers
- **Subscriptions** – Subscribe to milk, curd, bread & daily essentials with flexible frequencies (daily, alternate, custom days)
- **Calendar** – View upcoming deliveries, skip days, or set vacation mode
- **Wallet** – Prepaid wallet with Razorpay integration, auto-pause on low balance
- **Real-time tracking** – Know when your delivery is on the way

### For Distributors
- **Route optimization** – Deliveries grouped by building and floor
- **Offline support** – Mark deliveries even without internet, syncs when online
- **Earnings dashboard** – Track daily/weekly/monthly earnings
- **Stock collection** – Know exactly what to pick up each morning

### For Admins
- **Customer management** – View profiles, subscriptions, wallet balances
- **Distributor assignment** – Assign buildings to distributors
- **Analytics** – Revenue, delivery performance, customer growth
- **Inventory & payouts** – Stock management and distributor payments

## 🛠 Tech Stack

| Layer | Technology |
|-------|------------|
| Mobile | React Native (Expo SDK 54) |
| Styling | NativeWind (Tailwind for RN) |
| State | Zustand |
| Backend | Supabase (PostgreSQL + Auth + Edge Functions) |
| Payments | Razorpay |
| Notifications | Expo Push Notifications |

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- Expo CLI (`npm install -g expo-cli`)
- Android Studio / Xcode (for emulators)

### Installation

```bash
# Clone the repo
git clone https://github.com/your-username/dailicart.git
cd dailicart

# Install dependencies
cd mobile
npm install

# Start the dev server
npm run start
```

### Environment Setup

Create `mobile/.env`:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
EXPO_PUBLIC_RAZORPAY_KEY_ID=rzp_test_xxxxx

# Optional: Dev mode bypass
EXPO_PUBLIC_DEV_MODE_ROLE=selector  # selector | customer | distributor | admin
```

## 📁 Project Structure

```
mobile/
├── src/
│   ├── screens/          # Role-based screens (customer/, admin/, distributor/)
│   ├── services/api/     # Supabase API wrappers
│   ├── store/            # Zustand stores
│   ├── components/       # Reusable UI components
│   ├── navigation/       # React Navigation setup
│   └── utils/            # Helpers, validation, formatting
supabase/
├── schema.sql            # Database schema
├── migrations/           # Incremental migrations
└── functions/            # Edge Functions (analytics, payments)
```

## 🔑 Key Patterns

**Wallet Operations** – All financial operations use server-side RPCs with idempotency keys to prevent double-charging:
```typescript
await supabase.rpc('debit_wallet', {
  p_user_id: userId,
  p_amount: amount,
  p_idempotency_key: `delivery-${orderId}`,
});
```

**Date Handling** – Always use local timezone helpers, never UTC:
```typescript
import { getLocalDateString } from './utils/helpers';
const today = getLocalDateString(); // Correct for India timezone
```

## 📱 Screenshots

| Customer Home | Calendar | Distributor Route |
|--------------|----------|-------------------|
| Subscribe to products | Skip days, vacation mode | Building-wise deliveries |

## 🧪 Development

```bash
npm run start          # Start Metro bundler
npm run android        # Run on Android
npm run ios            # Run on iOS
npm run typecheck      # TypeScript validation
npm run lint           # ESLint
```

## 📄 License

MIT © DailiCart

---

Built with ❤️ for Indian housing societies
