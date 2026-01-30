import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, AuthResponse } from '../types';
import { STORAGE_KEYS } from '../constants';
import { AuthService, AuthUser } from '../services/auth/authService';
import { supabase } from '../services/supabase';
import { CustomerProfileService } from '../services/api/customerProfile';
import { setSentryUser, clearSentryUser } from '../services/sentry';
import { clearAllCache, cacheUserProfile } from '../services/offlineCache';

// Helper to map AuthUser/SupabaseUser to our User type - eliminates duplication
function mapToUser(source: AuthUser | { id: string; email?: string | null; phone?: string | null; user_metadata?: any }): User {
  const isAuthUser = 'role' in source;
  return {
    id: source.id,
    name: isAuthUser 
      ? (source as AuthUser).name 
      : (source.user_metadata?.full_name || source.user_metadata?.name || source.email || 'User'),
    email: source.email || '',
    phone: source.phone || '',
    role: isAuthUser ? (source as AuthUser).role : 'customer',
    isActive: true,
    isDeleted: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// Helper to create AuthUser from Supabase user
function mapToAuthUser(sbUser: { id: string; email?: string | null; phone?: string | null; user_metadata?: any }): AuthUser {
  return {
    id: sbUser.id,
    email: sbUser.email || '',
    name: sbUser.user_metadata?.full_name || sbUser.user_metadata?.name || sbUser.email || 'User',
    phone: sbUser.phone || '',
    role: 'customer',
  };
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  initializing: boolean;
  accountLocked: boolean;
  lockExpiresAt: string | null;
  
  // Actions
  setUser: (user: User) => void;
  setTokens: (accessToken: string, refreshToken: string) => Promise<void>;
  login: (authData: AuthResponse) => Promise<void>;
  loginWithSupabase: (authUser: AuthUser, session: any) => Promise<void>;
  logout: () => Promise<void>;
  loadUserFromStorage: () => Promise<void>;
  refreshSession: () => Promise<void>;
  checkAccountStatus: (userId: string) => Promise<{ isDeleted: boolean; isLocked: boolean; lockedUntil: string | null }>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  isAuthenticated: false,
  isLoading: true,
  initializing: true,
  accountLocked: false,
  lockExpiresAt: null,

  setUser: (user) => {
    set({ user, isAuthenticated: true });
  },

  checkAccountStatus: async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('is_deleted, locked_until')
        .eq('id', userId)
        .single();

      if (error) throw error;

      const isDeleted = data?.is_deleted || false;
      const lockedUntil = data?.locked_until;
      const isLocked = lockedUntil && new Date(lockedUntil) > new Date();

      if (isLocked) {
        set({ accountLocked: true, lockExpiresAt: lockedUntil });
      } else {
        set({ accountLocked: false, lockExpiresAt: null });
      }

      return { 
        isDeleted, 
        isLocked: !!isLocked, 
        lockedUntil: lockedUntil || null 
      };
    } catch (error) {
      console.error('[checkAccountStatus Error]', error);
      return { isDeleted: false, isLocked: false, lockedUntil: null };
    }
  },

  setTokens: async (accessToken, refreshToken) => {
    try {
      await AsyncStorage.multiSet([
        [STORAGE_KEYS.AUTH_TOKEN, accessToken],
        [STORAGE_KEYS.REFRESH_TOKEN, refreshToken],
      ]);
      set({ accessToken });
    } catch (error) {
      console.error('[setTokens Error]', error);
    }
  },

  loginWithSupabase: async (authUser: AuthUser, session: any) => {
    try {
      // Check if account is deleted or locked
      const accountStatus = await get().checkAccountStatus(authUser.id);
      
      if (accountStatus.isDeleted) {
        throw new Error('This account has been deleted. Please contact support.');
      }
      
      if (accountStatus.isLocked) {
        const lockTime = new Date(accountStatus.lockedUntil!).toLocaleString();
        throw new Error(`Account is temporarily locked until ${lockTime}. Please try again later.`);
      }

      set({
        user: mapToUser(authUser),
        accessToken: session.access_token,
        isAuthenticated: true,
        isLoading: false,
        accountLocked: false,
        lockExpiresAt: null,
      });

      // Set Sentry user context for crash tracking (phone OTP + Google OAuth)
      setSentryUser({ 
        id: authUser.id, 
        phone: authUser.phone,
        email: authUser.email, 
        role: authUser.role 
      });

      // Cache user profile for offline access
      cacheUserProfile({
        id: authUser.id,
        name: authUser.name,
        phone: authUser.phone,
        email: authUser.email,
        role: authUser.role,
      });
    } catch (error) {
      console.error('[loginWithSupabase Error]', error);
      throw error;
    }
  },

  login: async (authData) => {
    try {
      const { user, accessToken, refreshToken } = authData;
      
      // Save to storage
      await AsyncStorage.multiSet([
        [STORAGE_KEYS.AUTH_TOKEN, accessToken],
        [STORAGE_KEYS.REFRESH_TOKEN, refreshToken],
        [STORAGE_KEYS.USER_DATA, JSON.stringify(user)],
      ]);

      // Update state
      set({
        user,
        accessToken,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error) {
      console.error('[login Error]', error);
      throw error;
    }
  },

  logout: async () => {
    try {
      // Sign out from Supabase
      await AuthService.signOut();

      // Clear Sentry user context
      clearSentryUser();

      // Clear all cached data
      await clearAllCache();

      // Reset state
      set({
        user: null,
        accessToken: null,
        isAuthenticated: false,
        isLoading: false,
      });
    } catch (error) {
      console.error('[logout Error]', error);
    }
  },

  refreshSession: async () => {
    try {
      const session = await AuthService.refreshSession();
      if (session) {
        set({ accessToken: session.access_token });
      } else {
        // Session refresh failed, logout
        await get().logout();
      }
    } catch (error) {
      console.error('[refreshSession Error]', error);
      await get().logout();
    }
  },

  loadUserFromStorage: async () => {
    try {
      set({ isLoading: true, initializing: true });

      const session = await AuthService.getSession();
      
      if (!session) {
        set({ isLoading: false, initializing: false });
        return;
      }

      // Try to get user from storage first, then from Supabase
      let authUser = await AuthService.getCurrentUser();
      
      if (!authUser) {
        const { data: userRes } = await supabase.auth.getUser();
        if (userRes?.user) {
          authUser = mapToAuthUser(userRes.user);
          await AsyncStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(authUser));
        }
      }

      if (authUser) {
        set({
          user: mapToUser(authUser),
          accessToken: session.access_token,
          isAuthenticated: true,
          isLoading: false,
          initializing: false,
        });
      } else {
        set({ isLoading: false, initializing: false });
      }

      // Attach auth state listener (only once)
      // Store unsubscribe reference to prevent memory leaks
      if (!(globalThis as any).__authListenerAttached) {
        (globalThis as any).__authListenerAttached = true;
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
        if (event === 'SIGNED_IN' && currentSession) {
          const authUser = mapToAuthUser(currentSession.user);
          await AsyncStorage.multiSet([
            [STORAGE_KEYS.AUTH_TOKEN, currentSession.access_token],
            [STORAGE_KEYS.REFRESH_TOKEN, currentSession.refresh_token || ''],
            [STORAGE_KEYS.USER_DATA, JSON.stringify(authUser)],
          ]);
          useAuthStore.setState({
            user: mapToUser(authUser),
            accessToken: currentSession.access_token,
            isAuthenticated: true,
            isLoading: false,
          });
          // Ensure customer record exists
          CustomerProfileService.ensureUserRecords(currentSession.user.id).catch(() => {});
        } else if (event === 'TOKEN_REFRESHED' && currentSession) {
          await AsyncStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, currentSession.access_token);
          useAuthStore.setState({ accessToken: currentSession.access_token });
        } else if (event === 'SIGNED_OUT') {
          await AsyncStorage.multiRemove([
            STORAGE_KEYS.AUTH_TOKEN,
            STORAGE_KEYS.REFRESH_TOKEN,
            STORAGE_KEYS.USER_DATA,
          ]);
          useAuthStore.setState({
            user: null,
            accessToken: null,
            isAuthenticated: false,
            isLoading: false,
            initializing: false,
          });
        }
      });
      // Store subscription for potential cleanup
      (globalThis as any).__authSubscription = subscription;
      }
    } catch (error) {
      console.error('[loadUserFromStorage Error]', error);
      set({ isLoading: false, initializing: false });
    }
  },
}));
