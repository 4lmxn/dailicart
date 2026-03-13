export type DevBypassRole = 'selector' | 'customer' | 'admin' | 'distributor';

const rawDevBypassRole = String(process.env.EXPO_PUBLIC_DEV_MODE_ROLE || '').trim().toLowerCase();

const devBypassRole = (
  rawDevBypassRole === 'selector' ||
  rawDevBypassRole === 'customer' ||
  rawDevBypassRole === 'admin' ||
  rawDevBypassRole === 'distributor'
)
  ? (rawDevBypassRole as DevBypassRole)
  : null;

// App Configuration
export const config = {
  // API Configuration - Uses Supabase Edge Functions
  api: {
    // Base URL for Edge Functions (derived from Supabase URL)
    get baseURL() {
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
      return supabaseUrl ? `${supabaseUrl}/functions/v1` : '';
    },
    timeout: 30000,
  },

  // Supabase Configuration
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
    keySecret: '',
    mode: (process.env.EXPO_PUBLIC_PAYMENT_MODE || 'prod').toLowerCase(), // 'dev' | 'prod' - default to prod for production safety
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

  // Temporary development-only auth bypass for role testing.
  dev: {
    bypassRole: devBypassRole,
    customerUserId: String(process.env.EXPO_PUBLIC_DEV_CUSTOMER_USER_ID || '').trim(),
    adminUserId: String(process.env.EXPO_PUBLIC_DEV_ADMIN_USER_ID || '').trim(),
    distributorUserId: String(process.env.EXPO_PUBLIC_DEV_DISTRIBUTOR_USER_ID || '').trim(),
  },
};

// Development mode check
export const isDev = __DEV__;

export const isDevBypassEnabled = Boolean(config.dev.bypassRole);
