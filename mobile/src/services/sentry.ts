/**
 * Sentry Error Tracking Configuration
 * 
 * For production crash monitoring and error tracking.
 * Set EXPO_PUBLIC_SENTRY_DSN in your .env file.
 */

import * as Sentry from '@sentry/react-native';
import { config } from '../config';

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN || '';

/**
 * Initialize Sentry for crash reporting
 * Call this at app startup before any other code runs
 */
export function initSentry() {
  if (!SENTRY_DSN) {
    console.log('[Sentry] DSN not configured, crash reporting disabled');
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    
    // Set environment based on dev mode
    environment: __DEV__ ? 'development' : 'production',
    
    // Release tracking
    release: `${config.app.name}@${config.app.version}`,
    
    // Only send errors in production
    enabled: !__DEV__,
    
    // Performance monitoring (sample 20% of transactions)
    tracesSampleRate: 0.2,
    
    // Don't track in development
    debug: false,
    
    // Filter out known non-critical errors
    beforeSend(event, hint) {
      const error = hint.originalException;
      
      // Ignore network errors (user might be offline)
      if (error instanceof Error) {
        const message = error.message.toLowerCase();
        if (
          message.includes('network request failed') ||
          message.includes('timeout') ||
          message.includes('aborted')
        ) {
          return null;
        }
      }
      
      return event;
    },
    
    // Attach user context when available
    integrations: [
      Sentry.reactNativeTracingIntegration(),
    ],
  });

  console.log('[Sentry] Initialized for production crash reporting');
}

/**
 * Set user context for error tracking
 * Call this after user logs in (supports phone OTP and Google OAuth)
 */
export function setSentryUser(user: { id: string; phone?: string; email?: string; role?: string }) {
  Sentry.setUser({
    id: user.id,
    // Use phone as primary identifier (OTP auth), fall back to email (Google OAuth)
    username: user.phone || user.email || undefined,
    email: user.email || undefined,
  });
  
  // Set role as custom tag for filtering errors by user type
  if (user.role) {
    Sentry.setTag('user_role', user.role);
  }
}

/**
 * Clear user context on logout
 */
export function clearSentryUser() {
  Sentry.setUser(null);
}

/**
 * Capture a custom error with context
 */
export function captureError(error: Error, context?: Record<string, unknown>) {
  if (context) {
    Sentry.setContext('additional', context);
  }
  Sentry.captureException(error);
}

/**
 * Capture a message for debugging
 */
export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info') {
  Sentry.captureMessage(message, level);
}

/**
 * Add breadcrumb for debugging trail
 */
export function addBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, unknown>
) {
  Sentry.addBreadcrumb({
    category,
    message,
    data,
    level: 'info',
  });
}

export { Sentry };
