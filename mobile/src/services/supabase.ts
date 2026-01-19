import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { supabaseSecureStorage } from '../utils/secureStorage';

// Initialize Supabase client with secure storage
export const supabase = createClient(
  config.supabase.url,
  config.supabase.anonKey,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      // Use secure storage for auth tokens (encrypted on iOS/Android)
      storage: supabaseSecureStorage,
      // Required for web OAuth callback
      detectSessionInUrl: typeof window !== 'undefined',
    },
  }
);

// Expose globally in web builds for console diagnostics - DEV ONLY
if (__DEV__ && typeof window !== 'undefined') {
  // @ts-ignore - Safe: only exposed in development
  (window as any).supabase = supabase;
}

// Helper function to check if Supabase is configured
export const isSupabaseConfigured = (): boolean => {
  return !!(config.supabase.url && config.supabase.anonKey);
};
