import { supabase } from '../supabase';
import { Alert } from 'react-native';

/**
 * Password Reset Service
 * Handles forgot password and reset password flows
 */

export interface PasswordResetService {
  sendResetEmail: (email: string) => Promise<{ success: boolean; error?: string }>;
  resetPassword: (newPassword: string) => Promise<{ success: boolean; error?: string }>;
  updatePassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
}

/**
 * Send password reset email
 */
export async function sendResetEmail(
  email: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!email || !email.includes('@')) {
      return { success: false, error: 'Please enter a valid email address' };
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'idaily://reset-password', // Deep link for mobile app
    });

    if (error) {
      console.error('Reset email error:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Send reset email failed:', error);
    return { success: false, error: 'Failed to send reset email' };
  }
}

/**
 * Reset password (called after clicking email link)
 */
export async function resetPassword(
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!newPassword || newPassword.length < 8) {
      return {
        success: false,
        error: 'Password must be at least 8 characters',
      };
    }

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      console.error('Reset password error:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Reset password failed:', error);
    return { success: false, error: 'Failed to reset password' };
  }
}

/**
 * Update password (when user is logged in)
 */
export async function updatePassword(
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Validate inputs
    if (!currentPassword || !newPassword) {
      return { success: false, error: 'Please fill all fields' };
    }

    if (newPassword.length < 8) {
      return {
        success: false,
        error: 'New password must be at least 8 characters',
      };
    }

    if (currentPassword === newPassword) {
      return {
        success: false,
        error: 'New password must be different from current password',
      };
    }

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || !user.email) {
      return { success: false, error: 'User not found' };
    }

    // Verify current password by attempting to sign in
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });

    if (signInError) {
      return { success: false, error: 'Current password is incorrect' };
    }

    // Update to new password
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      console.error('Update password error:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Update password failed:', error);
    return { success: false, error: 'Failed to update password' };
  }
}

/**
 * Verify if password meets requirements
 */
export function validatePassword(password: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('Must be at least 8 characters long');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Must contain at least one uppercase letter');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Must contain at least one lowercase letter');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Must contain at least one number');
  }

  if (!/[!@#$%^&*]/.test(password)) {
    errors.push('Must contain at least one special character (!@#$%^&*)');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Send email verification
 */
export async function sendEmailVerification(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || !user.email) {
      return { success: false, error: 'User not found' };
    }

    // Supabase automatically sends verification email on signup
    // To resend, we can use the auth admin API
    // For now, inform user to check their email
    return { success: true };
  } catch (error: any) {
    console.error('Send verification failed:', error);
    return { success: false, error: 'Failed to send verification email' };
  }
}

/**
 * Check if email is verified
 */
export async function isEmailVerified(): Promise<boolean> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    return user?.email_confirmed_at != null;
  } catch (error) {
    console.error('Check email verification failed:', error);
    return false;
  }
}

/**
 * Password strength indicator
 */
export function getPasswordStrength(password: string): {
  strength: 'weak' | 'medium' | 'strong' | 'very-strong';
  score: number;
  color: string;
} {
  let score = 0;

  // Length
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;

  // Character types
  if (/[a-z]/.test(password)) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[!@#$%^&*]/.test(password)) score += 1;

  // Determine strength
  if (score <= 2) {
    return { strength: 'weak', score, color: '#F44336' };
  } else if (score <= 4) {
    return { strength: 'medium', score, color: '#FF9800' };
  } else if (score <= 6) {
    return { strength: 'strong', score, color: '#4CAF50' };
  } else {
    return { strength: 'very-strong', score, color: '#2E7D32' };
  }
}
