/**
 * Offline Service for Distributor App
 * Caches deliveries locally and syncs delivery status updates when online
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { supabase } from '../supabase';

const STORAGE_KEYS = {
  CACHED_DELIVERIES: '@dailicart/cached_deliveries',
  PENDING_UPDATES: '@dailicart/pending_updates',
  LAST_SYNC: '@dailicart/last_sync',
};

interface CachedDelivery {
  id: string;
  orderId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  unitNumber: string;
  floor: number;
  productName: string;
  quantity: number;
  unit: string;
  amount: number;
  status: string;
  deliveryInstructions?: string;
  buildingId: string;
  buildingName: string;
  societyId: string;
  societyName: string;
}

interface PendingUpdate {
  id: string;
  orderId: string;
  action: 'delivered' | 'skipped' | 'missed';
  timestamp: string;
  skipReason?: string;
}

interface CachedData {
  deliveries: CachedDelivery[];
  date: string;
  distributorId: string;
  cachedAt: string;
}

class OfflineServiceClass {
  private isOnline: boolean = true;
  private listeners: ((isOnline: boolean) => void)[] = [];

  constructor() {
    // Initialize network listener
    NetInfo.addEventListener((state: NetInfoState) => {
      const wasOffline = !this.isOnline;
      this.isOnline = !!state.isConnected && !!state.isInternetReachable;
      
      // Notify listeners
      this.listeners.forEach(listener => listener(this.isOnline));
      
      // Auto-sync when coming back online
      if (wasOffline && this.isOnline) {
        this.syncPendingUpdates();
      }
    });
  }

  /**
   * Check current network status
   */
  async checkOnlineStatus(): Promise<boolean> {
    const state = await NetInfo.fetch();
    this.isOnline = !!state.isConnected && !!state.isInternetReachable;
    return this.isOnline;
  }

  /**
   * Get current online status (cached)
   */
  getIsOnline(): boolean {
    return this.isOnline;
  }

  /**
   * Subscribe to online status changes
   */
  addOnlineStatusListener(callback: (isOnline: boolean) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  /**
   * Cache deliveries for offline access
   */
  async cacheDeliveries(
    deliveries: CachedDelivery[],
    date: string,
    distributorId: string
  ): Promise<void> {
    try {
      const data: CachedData = {
        deliveries,
        date,
        distributorId,
        cachedAt: new Date().toISOString(),
      };
      await AsyncStorage.setItem(STORAGE_KEYS.CACHED_DELIVERIES, JSON.stringify(data));
      console.log(`[OfflineService] Cached ${deliveries.length} deliveries for ${date}`);
    } catch (error) {
      console.error('[OfflineService] Error caching deliveries:', error);
    }
  }

  /**
   * Get cached deliveries
   */
  async getCachedDeliveries(date: string): Promise<CachedDelivery[] | null> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.CACHED_DELIVERIES);
      if (!data) return null;

      const cached: CachedData = JSON.parse(data);
      
      // Only return if cache is for the requested date
      if (cached.date !== date) {
        console.log('[OfflineService] Cached data is for different date');
        return null;
      }

      console.log(`[OfflineService] Retrieved ${cached.deliveries.length} cached deliveries`);
      return cached.deliveries;
    } catch (error) {
      console.error('[OfflineService] Error getting cached deliveries:', error);
      return null;
    }
  }

  /**
   * Queue a delivery update for sync when online
   */
  async queueDeliveryUpdate(
    orderId: string,
    action: 'delivered' | 'skipped' | 'missed',
    skipReason?: string
  ): Promise<void> {
    try {
      const pending = await this.getPendingUpdates();
      
      // Check if already queued
      const existingIndex = pending.findIndex(p => p.orderId === orderId);
      if (existingIndex >= 0) {
        // Update existing
        pending[existingIndex] = {
          ...pending[existingIndex],
          action,
          timestamp: new Date().toISOString(),
          skipReason,
        };
      } else {
        // Add new
        pending.push({
          id: `${orderId}-${Date.now()}`,
          orderId,
          action,
          timestamp: new Date().toISOString(),
          skipReason,
        });
      }

      await AsyncStorage.setItem(STORAGE_KEYS.PENDING_UPDATES, JSON.stringify(pending));
      console.log(`[OfflineService] Queued ${action} for order ${orderId}`);

      // Update local cache optimistically
      await this.updateLocalCache(orderId, action);

      // Try to sync immediately if online
      if (this.isOnline) {
        await this.syncPendingUpdates();
      }
    } catch (error) {
      console.error('[OfflineService] Error queuing update:', error);
      throw error;
    }
  }

  /**
   * Update local cache with delivery status change
   */
  private async updateLocalCache(orderId: string, action: string): Promise<void> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.CACHED_DELIVERIES);
      if (!data) return;

      const cached: CachedData = JSON.parse(data);
      const deliveryIndex = cached.deliveries.findIndex(d => d.orderId === orderId);
      
      if (deliveryIndex >= 0) {
        cached.deliveries[deliveryIndex].status = action === 'delivered' ? 'delivered' : 'skipped';
        await AsyncStorage.setItem(STORAGE_KEYS.CACHED_DELIVERIES, JSON.stringify(cached));
      }
    } catch (error) {
      console.error('[OfflineService] Error updating local cache:', error);
    }
  }

  /**
   * Get pending updates that need to be synced
   */
  async getPendingUpdates(): Promise<PendingUpdate[]> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.PENDING_UPDATES);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('[OfflineService] Error getting pending updates:', error);
      return [];
    }
  }

  /**
   * Get count of pending updates
   */
  async getPendingCount(): Promise<number> {
    const pending = await this.getPendingUpdates();
    return pending.length;
  }

  /**
   * Sync pending updates with server
   * Returns: { synced: number, failed: number }
   */
  async syncPendingUpdates(): Promise<{ synced: number; failed: number }> {
    if (!this.isOnline) {
      console.log('[OfflineService] Cannot sync - offline');
      return { synced: 0, failed: 0 };
    }

    const pending = await this.getPendingUpdates();
    if (pending.length === 0) {
      console.log('[OfflineService] No pending updates to sync');
      return { synced: 0, failed: 0 };
    }

    console.log(`[OfflineService] Syncing ${pending.length} pending updates...`);

    let synced = 0;
    let failed = 0;
    const failedUpdates: PendingUpdate[] = [];

    for (const update of pending) {
      try {
        // Check if order still exists and is in valid state
        const { data: order, error: checkError } = await supabase
          .from('orders')
          .select('status')
          .eq('id', update.orderId)
          .single();

        if (checkError || !order) {
          console.log(`[OfflineService] Order ${update.orderId} not found, skipping`);
          synced++; // Count as synced since we don't need to retry
          continue;
        }

        // Skip if already processed
        if (order.status === 'delivered' || order.status === 'skipped') {
          console.log(`[OfflineService] Order ${update.orderId} already ${order.status}`);
          synced++;
          continue;
        }

        // Process the update
        const newStatus = update.action === 'delivered' ? 'delivered' : 'skipped';
        const { error: updateError } = await supabase
          .from('orders')
          .update({
            status: newStatus,
            delivered_at: update.action === 'delivered' ? update.timestamp : null,
            skip_reason: update.skipReason || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', update.orderId);

        if (updateError) {
          throw updateError;
        }

        console.log(`[OfflineService] Synced ${update.action} for order ${update.orderId}`);
        synced++;
      } catch (error) {
        console.error(`[OfflineService] Failed to sync order ${update.orderId}:`, error);
        failedUpdates.push(update);
        failed++;
      }
    }

    // Save failed updates for retry
    await AsyncStorage.setItem(STORAGE_KEYS.PENDING_UPDATES, JSON.stringify(failedUpdates));

    // Update last sync time
    await AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC, new Date().toISOString());

    console.log(`[OfflineService] Sync complete: ${synced} synced, ${failed} failed`);
    return { synced, failed };
  }

  /**
   * Get last sync timestamp
   */
  async getLastSyncTime(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(STORAGE_KEYS.LAST_SYNC);
    } catch {
      return null;
    }
  }

  /**
   * Clear all offline data (useful for logout)
   */
  async clearOfflineData(): Promise<void> {
    try {
      await AsyncStorage.multiRemove([
        STORAGE_KEYS.CACHED_DELIVERIES,
        STORAGE_KEYS.PENDING_UPDATES,
        STORAGE_KEYS.LAST_SYNC,
      ]);
      console.log('[OfflineService] Cleared all offline data');
    } catch (error) {
      console.error('[OfflineService] Error clearing offline data:', error);
    }
  }
}

// Export singleton instance
export const OfflineService = new OfflineServiceClass();
export type { CachedDelivery, PendingUpdate };
