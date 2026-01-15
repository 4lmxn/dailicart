import { createClient } from '@supabase/supabase-js';
import { config } from '../config';

// Initialize Supabase client
export const supabase = createClient(
  config.supabase.url,
  config.supabase.anonKey,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      // Required for web OAuth callback so the client
      // can parse tokens from the redirected URL.
      detectSessionInUrl: typeof window !== 'undefined',
    },
  }
);

// Expose globally in web builds for console diagnostics
if (typeof window !== 'undefined') {
  // @ts-ignore
  (window as any).supabase = supabase;
}

// Helper function to check if Supabase is configured
export const isSupabaseConfigured = (): boolean => {
  return !!(config.supabase.url && config.supabase.anonKey);
};
