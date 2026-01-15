# Development Mode Navigation Guide

## Quick Screen Access

You can now easily navigate to ANY screen in development mode, including onboarding screens!

## How to Use

### Option 1: Dev Selector (Recommended)
Set this in your `.env` file:
```env
EXPO_PUBLIC_DEV_MODE_ROLE=selector
```

**What happens:**
- App opens to a Dev Selector screen
- Tap any option to navigate:
  - 🛍️ **Customer** - Customer dashboard
  - 🛠️ **Admin** - Admin dashboard  
  - 🚚 **Distributor** - Distributor dashboard
  - 👋 **Onboarding** - Customer onboarding flow
  - 🔐 **Login/Auth** - Login screen

### Option 2: Direct to Onboarding
Set this in your `.env` file:
```env
EXPO_PUBLIC_DEV_MODE_ROLE=onboarding
```

**What happens:**
- App bypasses authentication
- Opens directly to the Onboarding screen
- You can test the entire onboarding flow

### Option 3: Direct to Auth/Login
Set this in your `.env` file:
```env
EXPO_PUBLIC_DEV_MODE_ROLE=auth
```

**What happens:**
- App opens to Login screen
- You can test login/signup/OTP flow
- No auto-navigation

### Option 4: Direct to Role Dashboard
Set this in your `.env` file:
```env
EXPO_PUBLIC_DEV_MODE_ROLE=customer  # or 'admin' or 'distributor'
```

**What happens:**
- App bypasses authentication and onboarding
- Opens directly to the selected role's dashboard

### Option 5: Normal Production Flow
Leave it empty in your `.env` file:
```env
EXPO_PUBLIC_DEV_MODE_ROLE=
```

**What happens:**
- Normal authentication flow
- Checks user session
- Routes based on user role and onboarding status

## Summary Table

| ENV Value | Where It Takes You |
|-----------|-------------------|
| `selector` | **Dev Selector screen** (choose any destination) |
| `onboarding` | **Onboarding screen** (customer onboarding flow) |
| `auth` | **Login screen** (auth flow) |
| `customer` | **Customer Dashboard** |
| `admin` | **Admin Dashboard** |
| `distributor` | **Distributor Dashboard** |
| _(empty)_ | **Normal flow** (auth → onboarding → role) |

## Example Workflow

### To Test Onboarding:
1. Open `/mobile/.env`
2. Change: `EXPO_PUBLIC_DEV_MODE_ROLE=onboarding`
3. Save file
4. Restart Expo: `npm start` (or press `r` in terminal)
5. App opens directly to onboarding screen!

### To Test All Screens Quickly:
1. Open `/mobile/.env`
2. Change: `EXPO_PUBLIC_DEV_MODE_ROLE=selector`
3. Save file
4. Restart Expo
5. Tap any screen button to navigate

## Tips

- **After changing `.env`**: You must restart the Expo dev server (stop and `npm start` again)
- **Dev Selector is persistent**: You can keep it set to `selector` and switch between screens during testing
- **No data loss**: Your actual database and user data remain unchanged
- **Works on both platforms**: iOS and Android

## Troubleshooting

**"I changed .env but nothing happened"**
- Stop Expo dev server completely (Ctrl+C)
- Clear cache: `npx expo start -c`
- Restart

**"Onboarding screen crashes"**
- Check if you have proper mock data in your database
- Check console logs for specific errors

**"I want to go back to normal mode"**
- Set `EXPO_PUBLIC_DEV_MODE_ROLE=` (empty)
- Or comment it out: `# EXPO_PUBLIC_DEV_MODE_ROLE=admin`
- Restart Expo
