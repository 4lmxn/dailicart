/**
 * Offline Cache Service
 * 
 * Handles caching critical data for offline access.
 * Essential for distributors who may be in areas with poor connectivity.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_KEYS = {
  DISTRIBUTOR_DELIVERIES: 'cache_distributor_deliveries',
  DISTRIBUTOR_DELIVERIES_DATE: 'cache_distributor_deliveries_date',
  CUSTOMER_SUBSCRIPTIONS: 'cache_customer_subscriptions',
  CUSTOMER_WALLET_BALANCE: 'cache_customer_wallet_balance',
  USER_PROFILE: 'cache_user_profile',
} as const;

// Cache expiry times (in milliseconds)
const CACHE_TTL = {
  DELIVERIES: 24 * 60 * 60 * 1000, // 24 hours
  SUBSCRIPTIONS: 12 * 60 * 60 * 1000, // 12 hours
  WALLET: 5 * 60 * 1000, // 5 minutes
  PROFILE: 7 * 24 * 60 * 60 * 1000, // 7 days
};

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  date?: string; // For date-specific caches like deliveries
}

/**
 * Generic cache setter
 */
async function setCache<T>(key: string, data: T, date?: string): Promise<void> {
  try {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      date,
    };
    await AsyncStorage.setItem(key, JSON.stringify(entry));
  } catch (error) {
    console.error('[OfflineCache] Failed to set cache:', key, error);
  }
}

/**
 * Generic cache getter with TTL validation
 */
async function getCache<T>(key: string, ttl: number, date?: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;

    const entry: CacheEntry<T> = JSON.parse(raw);
    
    // Check if cache is expired
    if (Date.now() - entry.timestamp > ttl) {
      await AsyncStorage.removeItem(key);
      return null;
    }

    // For date-specific caches, check if date matches
    if (date && entry.date !== date) {
      return null;
    }

    return entry.data;
  } catch (error) {
    console.error('[OfflineCache] Failed to get cache:', key, error);
    return null;
  }
}

// ============ Distributor Deliveries ============

export interface CachedDelivery {
  id: string;
  orderId: string;
  customerName: string;
  customerPhone: string;
  buildingName: string;
  flatNumber: string;
  productName: string;
  quantity: number;
  status: string;
  totalAmount: number;
}

/**
 * Cache distributor's deliveries for a specific date
 */
export async function cacheDistributorDeliveries(
  deliveries: CachedDelivery[],
  date: string
): Promise<void> {
  await setCache(CACHE_KEYS.DISTRIBUTOR_DELIVERIES, deliveries, date);
  console.log(`[OfflineCache] Cached ${deliveries.length} deliveries for ${date}`);
}

/**
 * Get cached deliveries for a specific date
 */
export async function getCachedDistributorDeliveries(
  date: string
): Promise<CachedDelivery[] | null> {
  const data = await getCache<CachedDelivery[]>(
    CACHE_KEYS.DISTRIBUTOR_DELIVERIES,
    CACHE_TTL.DELIVERIES,
    date
  );
  if (data) {
    console.log(`[OfflineCache] Retrieved ${data.length} cached deliveries for ${date}`);
  }
  return data;
}

// ============ Customer Subscriptions ============

export interface CachedSubscription {
  id: string;
  productName: string;
  quantity: number;
  schedule: string[];
  status: string;
  pricePerUnit: number;
}

/**
 * Cache customer's active subscriptions
 */
export async function cacheCustomerSubscriptions(
  subscriptions: CachedSubscription[]
): Promise<void> {
  await setCache(CACHE_KEYS.CUSTOMER_SUBSCRIPTIONS, subscriptions);
  console.log(`[OfflineCache] Cached ${subscriptions.length} subscriptions`);
}

/**
 * Get cached subscriptions
 */
export async function getCachedCustomerSubscriptions(): Promise<CachedSubscription[] | null> {
  return getCache<CachedSubscription[]>(
    CACHE_KEYS.CUSTOMER_SUBSCRIPTIONS,
    CACHE_TTL.SUBSCRIPTIONS
  );
}

// ============ Wallet Balance ============

export interface CachedWalletBalance {
  balance: number;
  lastUpdated: string;
}

/**
 * Cache wallet balance (short TTL since money is sensitive)
 */
export async function cacheWalletBalance(balance: number): Promise<void> {
  await setCache(CACHE_KEYS.CUSTOMER_WALLET_BALANCE, {
    balance,
    lastUpdated: new Date().toISOString(),
  });
}

/**
 * Get cached wallet balance
 */
export async function getCachedWalletBalance(): Promise<CachedWalletBalance | null> {
  return getCache<CachedWalletBalance>(
    CACHE_KEYS.CUSTOMER_WALLET_BALANCE,
    CACHE_TTL.WALLET
  );
}

// ============ User Profile ============

export interface CachedUserProfile {
  id: string;
  name: string;
  phone: string;
  email?: string;
  role: string;
  buildingId?: string;
  buildingName?: string;
  flatNumber?: string;
}

/**
 * Cache user profile
 */
export async function cacheUserProfile(profile: CachedUserProfile): Promise<void> {
  await setCache(CACHE_KEYS.USER_PROFILE, profile);
}

/**
 * Get cached user profile
 */
export async function getCachedUserProfile(): Promise<CachedUserProfile | null> {
  return getCache<CachedUserProfile>(
    CACHE_KEYS.USER_PROFILE,
    CACHE_TTL.PROFILE
  );
}

// ============ Cache Management ============

/**
 * Clear all cached data (call on logout)
 */
export async function clearAllCache(): Promise<void> {
  try {
    const keys = Object.values(CACHE_KEYS);
    await AsyncStorage.multiRemove(keys);
    console.log('[OfflineCache] All cache cleared');
  } catch (error) {
    console.error('[OfflineCache] Failed to clear cache:', error);
  }
}

/**
 * Get cache status for debugging
 */
export async function getCacheStatus(): Promise<Record<string, { exists: boolean; age?: number }>> {
  const status: Record<string, { exists: boolean; age?: number }> = {};
  
  for (const [name, key] of Object.entries(CACHE_KEYS)) {
    try {
      const raw = await AsyncStorage.getItem(key);
      if (raw) {
        const entry = JSON.parse(raw);
        status[name] = {
          exists: true,
          age: Math.round((Date.now() - entry.timestamp) / 1000 / 60), // age in minutes
        };
      } else {
        status[name] = { exists: false };
      }
    } catch {
      status[name] = { exists: false };
    }
  }
  
  return status;
}
