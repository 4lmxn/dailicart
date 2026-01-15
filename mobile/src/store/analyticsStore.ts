import { create } from 'zustand';
import { fetchAnalytics, RevenuePoint, DeliveryStatus, CustomerGrowthPoint, ProductPopularityPoint } from '../services/api/analytics';

interface AnalyticsState {
  revenueTrend: RevenuePoint[];
  deliveryPerf: DeliveryStatus[];
  customerGrowth: CustomerGrowthPoint[];
  productPopularity: ProductPopularityPoint[];
  loading: boolean;
  lastFetched: number | null;
  ttlMs: number;
  loadAnalytics: (force?: boolean) => Promise<void>;
  clear: () => void;
}

export const useAnalyticsStore = create<AnalyticsState>((set, get) => ({
  revenueTrend: [],
  deliveryPerf: [],
  customerGrowth: [],
  productPopularity: [],
  loading: false,
  lastFetched: null,
  ttlMs: 5 * 60 * 1000, // 5 minutes cache TTL
  clear: () => set({ revenueTrend: [], deliveryPerf: [], customerGrowth: [], productPopularity: [], lastFetched: null }),
  loadAnalytics: async (force = false) => {
    const { lastFetched, ttlMs, loading } = get();
    const now = Date.now();
    if (!force && lastFetched && now - lastFetched < ttlMs) return; // still fresh
    if (loading) return;
    set({ loading: true });
    try {
      const data = await fetchAnalytics();
      set({
        revenueTrend: data.revenue,
        deliveryPerf: data.deliveries,
        customerGrowth: data.growth,
        productPopularity: data.products,
        lastFetched: Date.now(),
      });
    } catch (e) {
      console.error('Analytics fetch failed', e);
    } finally {
      set({ loading: false });
    }
  },
}));
