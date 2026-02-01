/**
 * Hook for using offline functionality in distributor screens
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { OfflineService, CachedDelivery, PendingUpdate } from '../services/offline/offlineService';

interface UseOfflineReturn {
  isOnline: boolean;
  pendingCount: number;
  lastSyncTime: string | null;
  syncPending: () => Promise<{ synced: number; failed: number }>;
  queueUpdate: (orderId: string, action: 'delivered' | 'skipped' | 'missed', skipReason?: string) => Promise<void>;
  cacheDeliveries: (deliveries: CachedDelivery[], date: string, distributorId: string) => Promise<void>;
  getCachedDeliveries: (date: string) => Promise<CachedDelivery[] | null>;
}

/**
 * Hook for managing offline state and sync
 */
export function useOffline(): UseOfflineReturn {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const mountedRef = useRef(true);

  // Initial setup and listener
  useEffect(() => {
    mountedRef.current = true;

    // Check initial status
    OfflineService.checkOnlineStatus().then(online => {
      if (mountedRef.current) setIsOnline(online);
    });

    // Get pending count
    OfflineService.getPendingCount().then(count => {
      if (mountedRef.current) setPendingCount(count);
    });

    // Get last sync time
    OfflineService.getLastSyncTime().then(time => {
      if (mountedRef.current) setLastSyncTime(time);
    });

    // Listen for online status changes
    const unsubscribe = OfflineService.addOnlineStatusListener((online) => {
      if (mountedRef.current) {
        setIsOnline(online);
        // Refresh pending count when status changes
        OfflineService.getPendingCount().then(count => {
          if (mountedRef.current) setPendingCount(count);
        });
      }
    });

    return () => {
      mountedRef.current = false;
      unsubscribe();
    };
  }, []);

  const syncPending = useCallback(async () => {
    const result = await OfflineService.syncPendingUpdates();
    if (mountedRef.current) {
      const count = await OfflineService.getPendingCount();
      setPendingCount(count);
      const time = await OfflineService.getLastSyncTime();
      setLastSyncTime(time);
    }
    return result;
  }, []);

  const queueUpdate = useCallback(async (
    orderId: string,
    action: 'delivered' | 'skipped' | 'missed',
    skipReason?: string
  ) => {
    await OfflineService.queueDeliveryUpdate(orderId, action, skipReason);
    if (mountedRef.current) {
      const count = await OfflineService.getPendingCount();
      setPendingCount(count);
    }
  }, []);

  const cacheDeliveries = useCallback(async (
    deliveries: CachedDelivery[],
    date: string,
    distributorId: string
  ) => {
    await OfflineService.cacheDeliveries(deliveries, date, distributorId);
  }, []);

  const getCachedDeliveries = useCallback(async (date: string) => {
    return await OfflineService.getCachedDeliveries(date);
  }, []);

  return {
    isOnline,
    pendingCount,
    lastSyncTime,
    syncPending,
    queueUpdate,
    cacheDeliveries,
    getCachedDeliveries,
  };
}

/**
 * Hook that provides just the online status (lighter weight)
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    OfflineService.checkOnlineStatus().then(setIsOnline);
    
    const unsubscribe = OfflineService.addOnlineStatusListener(setIsOnline);
    return unsubscribe;
  }, []);

  return isOnline;
}
