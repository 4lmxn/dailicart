import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, AuthResponse } from '../types';
import { STORAGE_KEYS } from '../constants';
import { AuthService, AuthUser } from '../services/auth/authService';
import { supabase } from '../services/supabase';
import { CustomerService } from '../services/api/customer';

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

      // Map AuthUser to User type
      const user: User = {
        id: authUser.id,
        name: authUser.name,
        email: authUser.email,
        phone: authUser.phone,
        role: authUser.role,
        isActive: true,
        isDeleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Update state
      set({
        user,
        accessToken: session.access_token,
        isAuthenticated: true,
        isLoading: false,
        accountLocked: false,
        lockExpiresAt: null,
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

      // Check if we have a valid session
      const session = await AuthService.getSession();
      let user = await AuthService.getCurrentUser();

      if (session && user) {
        // Map AuthUser to User type
        const mappedUser: User = {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        set({
          user: mappedUser,
          accessToken: session.access_token,
          isAuthenticated: true,
          isLoading: false,
          initializing: false,
        });

        // Listener is attached below at store init; no-op here
      } else {
        // If session exists but user not in storage (e.g., web OAuth), hydrate from Supabase
        if (session && !user) {
          const { data: userRes } = await supabase.auth.getUser();
          const sbUser = userRes?.user;
          if (sbUser) {
            const authUser: AuthUser = {
              id: sbUser.id,
              email: sbUser.email || '',
              name: (sbUser.user_metadata?.full_name || sbUser.user_metadata?.name || sbUser.email || 'User'),
              phone: sbUser.phone || '',
              role: 'customer',
            };

            await AsyncStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(authUser));

            const mappedUser: User = {
              id: authUser.id,
              name: authUser.name,
              email: authUser.email,
              phone: authUser.phone,
              role: authUser.role,
              isActive: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };

            set({
              user: mappedUser,
              accessToken: session.access_token,
              isAuthenticated: true,
              isLoading: false,
              initializing: false,
            });
          } else {
            set({ isLoading: false, initializing: false });
          }
        } else {
          set({ isLoading: false, initializing: false });
        }
      // Attach a global auth state listener so SIGNED_IN/SIGNED_OUT always update state
      ;

      supabase.auth.onAuthStateChange(async (event, currentSession) => {
        const store = useAuthStore.getState();
        if (event === 'SIGNED_IN' && currentSession) {
          const sbUser = currentSession.user;
          const authUser: AuthUser = {
            id: sbUser.id,
            email: sbUser.email || '',
            name: (sbUser.user_metadata?.full_name || sbUser.user_metadata?.name || sbUser.email || 'User'),
            phone: sbUser.phone || '',
            role: 'customer',
          };
          const mappedUser: User = {
            id: authUser.id,
            name: authUser.name,
            email: authUser.email,
            phone: authUser.phone,
            role: authUser.role,
            isActive: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          await AsyncStorage.multiSet([
            [STORAGE_KEYS.AUTH_TOKEN, currentSession.access_token],
            [STORAGE_KEYS.REFRESH_TOKEN, currentSession.refresh_token || ''],
            [STORAGE_KEYS.USER_DATA, JSON.stringify(authUser)],
          ]);
          useAuthStore.setState({
            user: mappedUser,
            accessToken: currentSession.access_token,
            isAuthenticated: true,
            isLoading: false,
          });
          // Ensure user records exist in background (customers row)
          try {
            await CustomerService.ensureUserRecords(sbUser.id);
          } catch (e) {
            console.warn('ensureUserRecords failed', e);
          }
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
      }
    } catch (error) {
      console.error('[loadUserFromStorage Error]', error);
      set({ isLoading: false, initializing: false });
    }
  },
}));
