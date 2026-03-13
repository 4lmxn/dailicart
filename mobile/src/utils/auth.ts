import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../services/supabase';
import { getDevBypassUser, getEffectiveDevBypassRole } from './devBypass';

/**
 * Get the current authenticated user ID
 * Checks dev mode impersonation first (for testing)
 */
export async function getAuthUserId(): Promise<string | null> {
  const devBypassRole = await getEffectiveDevBypassRole();
  if (devBypassRole) {
    return getDevBypassUser(devBypassRole).id;
  }

  // Check if in dev mode impersonation
  const impersonateUserId = await AsyncStorage.getItem('DEV_IMPERSONATE_USER_ID');
  if (impersonateUserId) {
    return impersonateUserId;
  }

  // Get from Supabase auth
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id || null;
}

/**
 * Clear dev mode impersonation
 */
export async function clearImpersonation(): Promise<void> {
  await AsyncStorage.multiRemove(['DEV_IMPERSONATE_USER_ID', 'DEV_IMPERSONATE_USER']);
}
