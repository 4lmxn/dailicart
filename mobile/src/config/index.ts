// App Configuration
export const config = {
  // API Configuration
  api: {
    baseURL: __DEV__ 
      ? 'http://localhost:3000/api' 
      : 'https://api.dailicart.in/api',
    timeout: 30000,
  },

  // Supabase Configuration (You'll add these after creating Supabase project)
  supabase: {
    url: process.env.EXPO_PUBLIC_SUPABASE_URL || '',
    anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
  },

  // Razorpay Configuration
  razorpay: {
    // Support both Expo public and non-public env names
    keyId:
      process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID ||
      process.env.RAZORPAY_KEY_ID ||
      '',
    // NEVER bundle secrets in mobile app; secret must live server-side.
    // Kept for backward compatibility but should not be used on device.
    keySecret: '',
    mode: (process.env.EXPO_PUBLIC_PAYMENT_MODE || 'dev').toLowerCase(), // 'dev' | 'prod'
  },

  // App Configuration
  app: {
    name: 'DailiCart',
    version: '1.0.0',
    customerAppId: 'in.dailicart.app',
    distributorAppId: 'in.dailicart.distributor',
  },

  // Features
  features: {
    enableOfflineMode: String(process.env.EXPO_PUBLIC_OFFLINE_MODE || '').trim() === '1',
    enablePushNotifications: true,
    enableBiometricAuth: false, // Phase 2
  },
};

// Development mode check
export const isDev = __DEV__;
