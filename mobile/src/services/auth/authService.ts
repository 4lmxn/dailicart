import { supabase } from '../supabase';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import { makeRedirectUri } from 'expo-auth-session';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../../constants';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  phone: string;
  role: 'customer' | 'distributor' | 'admin';
}

export interface SignInWithPhoneResponse {
  success: boolean;
  error?: string;
  message?: string;
}

export interface VerifyOTPResponse {
  success: boolean;
  user?: AuthUser;
  session?: any;
  error?: string;
}

export class AuthService {
  /**
   * Sign in with Google via Supabase OAuth
   * Note: On native, ensure redirect is configured in Supabase.
   */
  static async signInWithGoogle(): Promise<{ success: boolean; error?: string }>{
    try {
      // Build correct redirect for web vs native
      const redirectTo = Platform.OS === 'web'
        ? `${typeof window !== 'undefined' ? window.location.origin : ''}/auth/callback`
        : Linking.createURL('auth/callback');
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      });

      if (error) {
        return { success: false, error: error.message };
      }
      // Supabase will handle browser redirect; session is set on return
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to start Google sign-in' };
    }
  }

  /**
   * Handle incoming OAuth redirect URL and exchange for a session.
   * Ensures a row exists in `users` table and stores tokens + user locally.
   */
  static async handleOAuthRedirect(url: string): Promise<VerifyOTPResponse> {
    try {
      // On web, Supabase handles OAuth and sets the session; skip manual exchange
      if (Platform.OS === 'web') {
        const session = await this.getSession();
        const user = await supabase.auth.getUser();
        if (session && user.data.user) {
          // Map to AuthUser
          const sbUser = user.data.user;
          const authUser: AuthUser = {
            id: sbUser.id,
            email: sbUser.email || '',
            name: (sbUser.user_metadata?.full_name || sbUser.user_metadata?.name || sbUser.email || 'User'),
            phone: sbUser.phone || '',
            role: 'customer',
          };
          return { success: true, user: authUser, session };
        }
        return { success: false, error: 'No session on web after OAuth' };
      }
      const { data, error } = await supabase.auth.exchangeCodeForSession(url);
      if (error) {
        console.error('OAuth exchange error:', {
          message: error.message,
          name: error.name,
        });
        return { success: false, error: error.message };
      }

      if (!data.session || !data.user) {
        return { success: false, error: 'No session returned from provider' };
      }

      const sbUser = data.user;

      // Look up existing user by auth user id
      const { data: userRow, error: userRowErr } = await supabase
        .from('users')
        .select('*')
        .eq('id', sbUser.id)
        .single();

      let authUser: AuthUser;

      if (userRowErr && userRowErr.code !== 'PGRST116') {
        // Unexpected DB error
        console.warn('User table lookup error', {
          code: userRowErr.code,
          message: userRowErr.message,
          details: userRowErr.details,
          hint: userRowErr.hint,
        });
      }

      if (!userRow) {
        // Create app user row from provider data
        const newUser: AuthUser = {
          id: sbUser.id,
          email: sbUser.email || `user_${sbUser.id}@idaily.com`,
          name: (sbUser.user_metadata?.full_name || sbUser.user_metadata?.name || sbUser.email || 'New User'),
          phone: sbUser.phone || '',
          role: 'customer',
        };

        const { data: created, error: createErr } = await supabase
          .from('users')
          .insert([newUser])
          .select()
          .single();

        if (createErr) {
          console.warn('Failed to create users row, proceeding with auth user only', {
            code: createErr.code,
            message: createErr.message,
            details: createErr.details,
            hint: createErr.hint,
          });
          authUser = newUser;
        } else {
          authUser = {
            id: created.id,
            email: created.email,
            name: created.name || created.full_name || newUser.name,
            phone: created.phone,
            role: created.role,
          };
          // Ensure customer profile exists
          try {
            const { error: custErr } = await supabase
              .from('customers')
              .insert([{ user_id: created.id, wallet_balance: 0 }])
              .select()
              .single();
            if (custErr) {
              console.warn('Failed to create customer profile', {
                code: custErr.code,
                message: custErr.message,
                details: custErr.details,
                hint: custErr.hint,
              });
            }
          } catch (e: any) {
            console.warn('Customer insert threw', e?.message);
          }
        }
      } else {
        authUser = {
          id: userRow.id,
          email: userRow.email,
          name: userRow.name || userRow.full_name || (sbUser.email ?? 'User'),
          phone: userRow.phone,
          role: userRow.role,
        };
      }

      // Persist tokens and user
      await AsyncStorage.multiSet([
        [STORAGE_KEYS.AUTH_TOKEN, data.session.access_token],
        [STORAGE_KEYS.REFRESH_TOKEN, data.session.refresh_token],
        [STORAGE_KEYS.USER_DATA, JSON.stringify(authUser)],
      ]);

      return { success: true, user: authUser, session: data.session };
    } catch (e: any) {
      return { success: false, error: e?.message || 'OAuth handling failed' };
    }
  }

  /**
   * Email/password sign-in (legacy screens support)
   */
  static async signInWithEmail(email: string, password: string) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      return { success: !error, data, error: error?.message } as const;
    } catch (e: any) {
      return { success: false, data: null, error: e?.message || 'Sign-in failed' } as const;
    }
  }

  /**
   * Email/password sign-up with basic profile metadata (legacy screens support)
   */
  static async signUp(
    email: string,
    password: string,
    fullName?: string,
    phone?: string,
    role: 'customer' | 'distributor' = 'customer'
  ) {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, phone, role },
        },
      });
      return { data, error };
    } catch (error: any) {
      return { data: null, error };
    }
  }

  /**
   * Create customer profile (minimal no-op stub for type compatibility)
   */
  static async createCustomerProfile(
    userId: string,
    address: string,
    city: string,
    area: string,
    pincode: string
  ) {
    try {
      // Optionally persist to DB; keeping as stub for now
      return { error: null } as const;
    } catch (error: any) {
      return { error } as const;
    }
  }

  /**
   * Create distributor profile (minimal no-op stub for type compatibility)
   */
  static async createDistributorProfile(
    userId: string,
    zone: string,
    vehicleNumber: string
  ) {
    try {
      // Optionally persist to DB; keeping as stub for now
      return { error: null } as const;
    } catch (error: any) {
      return { error } as const;
    }
  }
  /**
   * Sign in with phone number (sends OTP)
   */
  static async signInWithPhone(phone: string): Promise<SignInWithPhoneResponse> {
    try {
      // Format phone number (ensure +91 prefix for India)
      const formattedPhone = phone.startsWith('+') ? phone : `+91${phone}`;

      const { data, error } = await supabase.auth.signInWithOtp({
        phone: formattedPhone,
        options: {
          // Optional: customize OTP message
          shouldCreateUser: true,
        },
      });

      if (error) {
        console.error('OTP send error:', error);
        return {
          success: false,
          error: error.message,
        };
      }

      return {
        success: true,
        message: 'OTP sent successfully',
      };
    } catch (error: any) {
      console.error('Sign in with phone error:', error);
      return {
        success: false,
        error: error.message || 'Failed to send OTP',
      };
    }
  }

  /**
   * Verify OTP and complete sign in
   */
  static async verifyOTP(phone: string, otp: string): Promise<VerifyOTPResponse> {
    try {
      const formattedPhone = phone.startsWith('+') ? phone : `+91${phone}`;

      const { data, error } = await supabase.auth.verifyOtp({
        phone: formattedPhone,
        token: otp,
        type: 'sms',
      });

      if (error) {
        console.error('OTP verification error:', error);
        return {
          success: false,
          error: error.message,
        };
      }

      if (!data.session || !data.user) {
        return {
          success: false,
          error: 'Invalid OTP or session expired',
        };
      }

      // Get user profile from database
      const { data: userProfile, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('phone', formattedPhone)
        .single();

      if (profileError && profileError.code !== 'PGRST116') {
        // PGRST116 = no rows returned (user doesn't exist yet)
        console.error('Profile fetch error:', profileError);
      }

      // If user profile doesn't exist, create it
      let authUser: AuthUser;
      if (!userProfile) {
        // Generate unique email if none provided
        const phoneDigits = formattedPhone.replace(/\D/g, '');
        const uniqueEmail = data.user.email || `user${phoneDigits}@idaily.com`;
        
        const newUser = {
          id: data.user.id,
          email: uniqueEmail,
          name: (data.user.user_metadata?.full_name || data.user.user_metadata?.name || `User ${phoneDigits.slice(-4)}`),
          phone: formattedPhone,
          role: 'customer' as const, // Default role
        };

        const { data: createdUser, error: createError } = await supabase
          .from('users')
          .insert([newUser])
          .select()
          .single();

        if (createError) {
          console.error('User creation error details:', {
            code: createError.code,
            message: createError.message,
            details: createError.details,
            hint: createError.hint,
          });
          // Continue anyway with basic user data
          authUser = {
            id: data.user.id,
            email: newUser.email,
            name: newUser.name,
            phone: formattedPhone,
            role: 'customer',
          };
        } else {
          authUser = {
            id: createdUser.id,
            email: createdUser.email,
            name: (createdUser.name || createdUser.full_name || newUser.name),
            phone: createdUser.phone,
            role: createdUser.role,
          };

          // Create customer profile
          await supabase.from('customers').insert([
            {
              user_id: createdUser.id,
              wallet_balance: 0,
            },
          ]);
        }
      } else {
        authUser = {
          id: userProfile.id,
          email: userProfile.email,
          name: userProfile.name || userProfile.full_name,
          phone: userProfile.phone,
          role: userProfile.role,
        };
      }

      // Store session tokens
      await AsyncStorage.multiSet([
        [STORAGE_KEYS.AUTH_TOKEN, data.session.access_token],
        [STORAGE_KEYS.REFRESH_TOKEN, data.session.refresh_token],
        [STORAGE_KEYS.USER_DATA, JSON.stringify(authUser)],
      ]);

      return {
        success: true,
        user: authUser,
        session: data.session,
      };
    } catch (error: any) {
      console.error('Verify OTP error:', error);
      return {
        success: false,
        error: error.message || 'Failed to verify OTP',
      };
    }
  }

  /**
   * Get current session
   */
  static async getSession() {
    try {
      const { data, error } = await supabase.auth.getSession();
      
      if (error) {
        console.error('Get session error:', error);
        return null;
      }

      return data.session;
    } catch (error) {
      console.error('Get session error:', error);
      return null;
    }
  }

  /**
   * Refresh session
   */
  static async refreshSession() {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      
      if (error) {
        console.error('Refresh session error:', error);
        return null;
      }

      if (data.session) {
        await AsyncStorage.multiSet([
          [STORAGE_KEYS.AUTH_TOKEN, data.session.access_token],
          [STORAGE_KEYS.REFRESH_TOKEN, data.session.refresh_token],
        ]);
      }

      return data.session;
    } catch (error) {
      console.error('Refresh session error:', error);
      return null;
    }
  }

  /**
   * Sign out
   */
  static async signOut(): Promise<void> {
    try {
      await supabase.auth.signOut();
      await AsyncStorage.multiRemove([
        STORAGE_KEYS.AUTH_TOKEN,
        STORAGE_KEYS.REFRESH_TOKEN,
        STORAGE_KEYS.USER_DATA,
      ]);
    } catch (error) {
      console.error('Sign out error:', error);
      throw error;
    }
  }

  /**
   * Get current user from storage
   */
  static async getCurrentUser(): Promise<AuthUser | null> {
    try {
      const userDataString = await AsyncStorage.getItem(STORAGE_KEYS.USER_DATA);
      if (!userDataString) return null;

      return JSON.parse(userDataString) as AuthUser;
    } catch (error) {
      console.error('Get current user error:', error);
      return null;
    }
  }

  /**
   * Check if user is authenticated
   */
  static async isAuthenticated(): Promise<boolean> {
    try {
      const token = await AsyncStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
      if (!token) return false;

      const session = await this.getSession();
      return !!session;
    } catch (error) {
      console.error('Check auth error:', error);
      return false;
    }
  }
}
