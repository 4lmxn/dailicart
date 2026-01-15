import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../services/supabase';

/**
 * Get the current authenticated user ID, checking dev mode impersonation first
 */
export async function getAuthUserId(): Promise<string | null> {
  // Check if in dev mode impersonation
  const impersonateUserId = await AsyncStorage.getItem('DEV_IMPERSONATE_USER_ID');
  if (impersonateUserId) {
    return impersonateUserId;
  }

  // Otherwise get from Supabase auth
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id || null;
}

/**
 * Get distributor ID from auth user ID (handles dev mode impersonation)
 */
export async function getDistributorId(): Promise<string | null> {
  const userId = await getAuthUserId();
  if (!userId) return null;

  const { data } = await supabase
    .from('distributors')
    .select('id')
    .eq('user_id', userId)
    .single();

  return data?.id || null;
}

/**
 * Get customer ID from auth user ID (handles dev mode impersonation)
 */
export async function getCustomerId(): Promise<string | null> {
  const userId = await getAuthUserId();
  if (!userId) return null;

  const { data } = await supabase
    .from('customers')
    .select('id')
    .eq('user_id', userId)
    .single();

  return data?.id || null;
}

/**
 * Clear dev mode impersonation
 */
export async function clearImpersonation(): Promise<void> {
  await AsyncStorage.removeItem('DEV_IMPERSONATE_USER_ID');
  await AsyncStorage.removeItem('DEV_IMPERSONATE_USER');
}
