import { create } from 'zustand';
import { supabase } from '../services/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface DistributorTodayMetrics {
  distributor_id: string;
  total_orders: number;
  delivered_orders: number;
  pending_orders: number;
  skipped_orders: number;
  cancelled_orders: number;
  delivered_revenue: number;
  total_quantity_units: number;
}

interface DashboardData {
  date: string;
  distributors: Array<{ distributor_id: string; active: boolean; areas: any; today: DistributorTodayMetrics }>;
  subscriptions: { active: number; paused: number; cancelled: number; currently_paused: number };
  orders_today: { pending: number; delivered: number; skipped: number; cancelled: number; revenue: number };
}

interface AdminDashboardState {
  loading: boolean;
  error: string | null;
  dashboard: DashboardData | null;
  lastUpdated: number | null;
  fetchDashboard: (date?: string) => Promise<void>;
  subscribeRealtime: () => void;
}

export const useAdminDashboardStore = create<AdminDashboardState>((set, get) => ({
  loading: false,
  error: null,
  dashboard: null,
  lastUpdated: null,
  fetchDashboard: async (date?: string) => {
    try {
      set({ loading: true, error: null });
      // Use local date helper to avoid timezone issues
      const { getLocalDateString } = await import('../utils/helpers');
      const targetDate = date || getLocalDateString();

      // Calculate month start for monthly revenue
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const monthStartStr = getLocalDateString(monthStart);

      const [ordersRes, allOrdersRes, subsRes, custRes, distRes, lowWalletRes] = await Promise.all([
        supabase.from('orders').select('status,total_amount,delivery_date,assigned_distributor_id').eq('delivery_date', targetDate),
        supabase.from('orders').select('status,total_amount,delivery_date').gte('delivery_date', monthStartStr),
        supabase.from('subscriptions').select('status'),
        supabase.from('customers').select('id, user_id', { count: 'exact' }),
        supabase.from('distributors').select('id, user_id, is_active'),
        supabase.from('customers').select('id', { count: 'exact' }).lt('wallet_balance', 200),
      ]);

      const orders = ordersRes.data || [];
      const allOrders = allOrdersRes.data || [];
      const revenue = orders.reduce((sum: number, o: any) => sum + (o.status === 'delivered' ? Number(o.total_amount || 0) : 0), 0);
      const monthlyRevenue = allOrders.reduce((sum: number, o: any) => sum + (o.status === 'delivered' ? Number(o.total_amount || 0) : 0), 0);
      const pending = orders.filter(o => ['pending','assigned','in_transit','scheduled'].includes(o.status)).length;
      const delivered = orders.filter(o => o.status === 'delivered').length;
      const skipped = orders.filter(o => o.status === 'skipped').length;
      const cancelled = orders.filter(o => ['cancelled','failed','missed'].includes(o.status)).length;

      const subs = subsRes.data || [];
      const subsActive = subs.filter(s => s.status === 'active').length;
      const subsPaused = subs.filter(s => s.status === 'paused').length;
      const subsCancelled = subs.filter(s => s.status === 'cancelled').length;

      const totalCustomers = custRes.count || 0;
      const lowWalletCustomers = lowWalletRes.count || 0;
      const activeDistributors = (distRes.data || []).filter(d => d.is_active).length;

      // Calculate per-distributor stats from today's orders
      const distributorOrderMap = new Map<string, { total: number; delivered: number; pending: number; revenue: number }>();
      orders.forEach((o: any) => {
        if (o.assigned_distributor_id) {
          const existing = distributorOrderMap.get(o.assigned_distributor_id) || { total: 0, delivered: 0, pending: 0, revenue: 0 };
          existing.total++;
          if (o.status === 'delivered') {
            existing.delivered++;
            existing.revenue += Number(o.total_amount || 0);
          }
          if (['pending', 'assigned', 'in_transit'].includes(o.status)) existing.pending++;
          distributorOrderMap.set(o.assigned_distributor_id, existing);
        }
      });

      const dashboard: DashboardData = {
        date: targetDate,
        distributors: (distRes.data || []).map(d => {
          const stats = distributorOrderMap.get(d.id) || { total: 0, delivered: 0, pending: 0, revenue: 0 };
          return {
            distributor_id: d.id,
            active: d.is_active,
            areas: [],
            today: {
              distributor_id: d.id,
              total_orders: stats.total,
              delivered_orders: stats.delivered,
              pending_orders: stats.pending,
              skipped_orders: 0,
              cancelled_orders: 0,
              delivered_revenue: stats.revenue,
              total_quantity_units: 0,
            }
          };
        }),
        subscriptions: { active: subsActive, paused: subsPaused, cancelled: subsCancelled, currently_paused: subsPaused },
        orders_today: { pending, delivered, skipped, cancelled, revenue },
        // Add customer and revenue data
        customers: { total: totalCustomers, low_wallet: lowWalletCustomers },
        revenue_month: { delivered_revenue: monthlyRevenue },
      } as DashboardData & { customers: any; revenue_month: any };

      try { await AsyncStorage.setItem('dashboard:last', JSON.stringify({ ts: Date.now(), data: dashboard })); } catch {}
      set({ dashboard, lastUpdated: Date.now(), loading: false });
    } catch (e: any) {
      try {
        const cached = await AsyncStorage.getItem('dashboard:last');
        if (cached) {
          const parsed = JSON.parse(cached);
            set({ dashboard: parsed.data as DashboardData, lastUpdated: parsed.ts, loading: false, error: 'Offline. Showing cached metrics.' });
            return;
        }
      } catch {}
      set({ error: e.message || 'Failed to load dashboard', loading: false });
    }
  },
  subscribeRealtime: () => {
    // Avoid double subscription
    const existing = (supabase as any)._adminRealtimeAttached;
    if (existing) return;
    (supabase as any)._adminRealtimeAttached = true;

    const refetch = () => {
      // Debounce by 500ms
      const pending = (supabase as any)._adminRealtimeTimer;
      if (pending) clearTimeout(pending);
      (supabase as any)._adminRealtimeTimer = setTimeout(() => {
        get().fetchDashboard();
      }, 500);
    };

    supabase.channel('admin-dashboard-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, refetch)
      .subscribe();
    supabase.channel('admin-dashboard-subscriptions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subscriptions' }, refetch)
      .subscribe();
    supabase.channel('admin-dashboard-distributors')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'distributors' }, refetch)
      .subscribe();
  },
}));

// Immediate cache hydration on module load (non-blocking)
(async () => {
  try {
    const cached = await AsyncStorage.getItem('dashboard:last');
    if (cached) {
      const parsed = JSON.parse(cached);
      useAdminDashboardStore.setState({ dashboard: parsed.data, lastUpdated: parsed.ts });
    }
  } catch {}
})();
