/**
 * Server-side rate limiting for Edge Functions
 * Uses Supabase Postgres rate_limits table for distributed rate limiting
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
}

// Default rate limits per action
export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  // Payment actions - strict limits
  'payment:verify': { maxRequests: 5, windowSeconds: 60 },
  'payment:initiate': { maxRequests: 3, windowSeconds: 60 },
  
  // Analytics - moderate limits (admin-only endpoints)
  'analytics:revenue': { maxRequests: 30, windowSeconds: 60 },
  'analytics:customers': { maxRequests: 30, windowSeconds: 60 },
  'analytics:products': { maxRequests: 30, windowSeconds: 60 },
  'analytics:deliveries': { maxRequests: 30, windowSeconds: 60 },
  
  // Order generation - very strict (heavy operation)
  'orders:generate': { maxRequests: 2, windowSeconds: 60 },
  
  // Default fallback
  'default': { maxRequests: 60, windowSeconds: 60 },
};

/**
 * Check rate limit using Postgres function
 * @param supabase - Supabase client with service role
 * @param identifier - Unique identifier (user ID, IP, etc.)
 * @param action - Action type (e.g., 'payment:verify')
 * @returns Object with allowed status and retry info
 */
export async function checkRateLimit(
  supabase: SupabaseClient,
  identifier: string,
  action: string
): Promise<{ allowed: boolean; error?: string }> {
  const config = RATE_LIMITS[action] || RATE_LIMITS['default'];
  
  try {
    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_identifier: identifier,
      p_action: action,
      p_max_requests: config.maxRequests,
      p_window_seconds: config.windowSeconds,
    });

    if (error) {
      console.error('Rate limit check failed:', error);
      // Fail open to avoid blocking legitimate requests on DB errors
      return { allowed: true };
    }

    return { allowed: data === true };
  } catch (e) {
    console.error('Rate limit exception:', e);
    // Fail open on exceptions
    return { allowed: true };
  }
}

/**
 * Rate limit response helper
 */
export function rateLimitResponse(retryAfterSeconds = 60): Response {
  return new Response(
    JSON.stringify({
      ok: false,
      error: 'Rate limit exceeded. Please try again later.',
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': retryAfterSeconds.toString(),
        'X-RateLimit-Reset': new Date(Date.now() + retryAfterSeconds * 1000).toISOString(),
      },
    }
  );
}

/**
 * Extract identifier from request (user ID or IP)
 */
export function getRequestIdentifier(req: Request, userId?: string): string {
  // Prefer user ID if authenticated
  if (userId) {
    return `user:${userId}`;
  }
  
  // Fall back to IP address
  const forwarded = req.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown';
  return `ip:${ip}`;
}
