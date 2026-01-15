import { useState, useEffect, useCallback } from 'react';

interface UseLoadingRefreshResult<T> {
  data: T | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  reload: () => Promise<void>;
  setData: React.Dispatch<React.SetStateAction<T | null>>;
}

/**
 * Custom hook for handling loading and refresh states
 * Reduces boilerplate code in screens that fetch data
 * 
 * @param fetchFn - Async function that returns the data
 * @param options - Configuration options
 * @returns Object with data, loading states, and control functions
 * 
 * @example
 * const { data: orders, loading, refreshing, refresh } = useLoadingRefresh(
 *   () => OrderService.getOrders(userId),
 *   { deps: [userId] }
 * );
 */
export function useLoadingRefresh<T>(
  fetchFn: () => Promise<T>,
  options: {
    deps?: any[];
    initialData?: T | null;
    onError?: (error: any) => void;
    autoLoad?: boolean;
  } = {}
): UseLoadingRefreshResult<T> {
  const { 
    deps = [], 
    initialData = null, 
    onError,
    autoLoad = true 
  } = options;

  const [data, setData] = useState<T | null>(initialData);
  const [loading, setLoading] = useState(autoLoad);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      const result = await fetchFn();
      setData(result);
    } catch (e: any) {
      const errorMessage = e.message || 'An error occurred';
      setError(errorMessage);
      onError?.(e);
      console.error('useLoadingRefresh error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    if (autoLoad) {
      load();
    }
  }, [load, autoLoad]);

  const refresh = useCallback(async () => {
    await load(true);
  }, [load]);

  const reload = useCallback(async () => {
    await load(false);
  }, [load]);

  return { data, loading, refreshing, error, refresh, reload, setData };
}

/**
 * Simplified version for cases where you just need loading/refreshing states
 * without automatic data fetching
 */
export function useLoadingState() {
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const withLoading = useCallback(async <T>(fn: () => Promise<T>): Promise<T | null> => {
    try {
      setLoading(true);
      return await fn();
    } catch (e) {
      console.error('withLoading error:', e);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const withRefresh = useCallback(async <T>(fn: () => Promise<T>): Promise<T | null> => {
    try {
      setRefreshing(true);
      return await fn();
    } catch (e) {
      console.error('withRefresh error:', e);
      return null;
    } finally {
      setRefreshing(false);
    }
  }, []);

  return { loading, refreshing, setLoading, setRefreshing, withLoading, withRefresh };
}

export default useLoadingRefresh;
