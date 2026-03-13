/**
 * Client-side rate limiting utility
 * 
 * Provides in-memory rate limiting to prevent abuse before requests hit the server.
 * This is a first line of defense - server-side rate limiting (via Postgres) is authoritative.
 */

interface RateLimitEntry {
  count: number;
  windowStart: number;
  blockedUntil?: number;
}

// In-memory rate limit store
const rateLimitStore = new Map<string, RateLimitEntry>();

// Periodically prune expired entries to prevent unbounded memory growth
const PRUNE_INTERVAL_MS = 5 * 60_000; // Every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    // Remove entries whose window expired and are not blocked
    const maxWindowMs = 600_000; // 10 min (longest possible window + block)
    if ((now - entry.windowStart) > maxWindowMs && (!entry.blockedUntil || entry.blockedUntil < now)) {
      rateLimitStore.delete(key);
    }
  }
}, PRUNE_INTERVAL_MS);

// Default limits for different action types
const ACTION_LIMITS: Record<string, { maxRequests: number; windowMs: number; blockDurationMs: number }> = {
  // Auth actions - strict limits
  'otp:send': { maxRequests: 3, windowMs: 60_000, blockDurationMs: 300_000 }, // 3 per minute, block 5 min
  'otp:verify': { maxRequests: 5, windowMs: 60_000, blockDurationMs: 300_000 }, // 5 per minute, block 5 min
  'auth:login': { maxRequests: 5, windowMs: 60_000, blockDurationMs: 300_000 }, // 5 per minute, block 5 min
  
  // Financial actions - moderate limits
  'wallet:topup': { maxRequests: 5, windowMs: 60_000, blockDurationMs: 60_000 }, // 5 per minute
  'wallet:debit': { maxRequests: 10, windowMs: 60_000, blockDurationMs: 60_000 }, // 10 per minute
  'payment:initiate': { maxRequests: 3, windowMs: 60_000, blockDurationMs: 120_000 }, // 3 per minute
  
  // General API actions - relaxed limits
  'api:read': { maxRequests: 100, windowMs: 60_000, blockDurationMs: 30_000 }, // 100 per minute
  'api:write': { maxRequests: 30, windowMs: 60_000, blockDurationMs: 60_000 }, // 30 per minute
  
  // Support actions
  'support:create': { maxRequests: 5, windowMs: 300_000, blockDurationMs: 600_000 }, // 5 per 5 min
  'support:message': { maxRequests: 20, windowMs: 60_000, blockDurationMs: 60_000 }, // 20 per minute
  
  // Default fallback
  'default': { maxRequests: 50, windowMs: 60_000, blockDurationMs: 60_000 },
};

/**
 * Check if an action is rate limited
 * @param action - The action type (e.g., 'otp:send', 'wallet:topup')
 * @param identifier - Unique identifier (e.g., user ID, phone number)
 * @returns Object with allowed status and optional wait time
 */
export function checkRateLimit(
  action: string,
  identifier: string
): { allowed: boolean; retryAfterMs?: number; remainingRequests?: number } {
  const key = `${action}:${identifier}`;
  const limits = ACTION_LIMITS[action] || ACTION_LIMITS['default'];
  const now = Date.now();
  
  let entry = rateLimitStore.get(key);
  
  // Check if currently blocked
  if (entry?.blockedUntil && entry.blockedUntil > now) {
    return {
      allowed: false,
      retryAfterMs: entry.blockedUntil - now,
    };
  }
  
  // Check if window has expired
  if (!entry || (now - entry.windowStart) > limits.windowMs) {
    entry = { count: 0, windowStart: now };
  }
  
  // Check if limit exceeded
  if (entry.count >= limits.maxRequests) {
    entry.blockedUntil = now + limits.blockDurationMs;
    rateLimitStore.set(key, entry);
    return {
      allowed: false,
      retryAfterMs: limits.blockDurationMs,
    };
  }
  
  // Increment and allow
  entry.count++;
  rateLimitStore.set(key, entry);
  
  return {
    allowed: true,
    remainingRequests: limits.maxRequests - entry.count,
  };
}

/**
 * Execute a function with rate limiting
 * @throws Error if rate limited
 */
export async function withRateLimit<T>(
  action: string,
  identifier: string,
  fn: () => Promise<T>
): Promise<T> {
  const check = checkRateLimit(action, identifier);
  
  if (!check.allowed) {
    const waitSeconds = Math.ceil((check.retryAfterMs || 0) / 1000);
    throw new Error(`Rate limited. Please try again in ${waitSeconds} seconds.`);
  }
  
  return fn();
}

/**
 * Reset rate limit for a specific action/identifier (for testing)
 */
export function resetRateLimit(action: string, identifier: string): void {
  const key = `${action}:${identifier}`;
  rateLimitStore.delete(key);
}

/**
 * Clear all rate limits (for testing)
 */
export function clearAllRateLimits(): void {
  rateLimitStore.clear();
}

/**
 * Get current rate limit status for debugging
 */
export function getRateLimitStatus(action: string, identifier: string): RateLimitEntry | undefined {
  const key = `${action}:${identifier}`;
  return rateLimitStore.get(key);
}

/**
 * Get human-readable wait time string
 */
export function formatWaitTime(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) {
    return `${seconds} second${seconds !== 1 ? 's' : ''}`;
  }
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
}

/**
 * Create a rate-limited wrapper for any async function
 * Use this for wrapping API calls that don't have built-in rate limiting
 * 
 * @example
 * const rateLimitedFetch = createRateLimitedFunction('api:read', userId);
 * const data = await rateLimitedFetch(() => fetchProducts());
 */
export function createRateLimitedFunction<T>(
  action: string,
  identifier: string
): (fn: () => Promise<T>) => Promise<T> {
  return async (fn: () => Promise<T>): Promise<T> => {
    return withRateLimit(action, identifier, fn);
  };
}

/**
 * Check if currently rate limited without incrementing counter
 * Useful for UI to show/hide buttons or show warnings
 */
export function isRateLimited(action: string, identifier: string): boolean {
  const key = `${action}:${identifier}`;
  const entry = rateLimitStore.get(key);
  const now = Date.now();
  
  if (entry?.blockedUntil && entry.blockedUntil > now) {
    return true;
  }
  
  return false;
}

/**
 * Get remaining time until rate limit resets (in ms)
 * Returns 0 if not rate limited
 */
export function getRateLimitResetTime(action: string, identifier: string): number {
  const key = `${action}:${identifier}`;
  const entry = rateLimitStore.get(key);
  const now = Date.now();
  
  if (entry?.blockedUntil && entry.blockedUntil > now) {
    return entry.blockedUntil - now;
  }
  
  return 0;
}
