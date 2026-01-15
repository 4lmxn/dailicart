import { supabase } from '../supabase';

export interface RevenuePoint { date: string; amount: number; }
export interface DeliveryStatus { status: string; count: number; }
export interface CustomerGrowthPoint { label: string; count: number; }
export interface ProductPopularityPoint { name: string; units: number; }

export const AnalyticsService = {
  async revenueTrend(days: number = 7): Promise<RevenuePoint[]> {
    try {
      const today = new Date();
      const startDate = new Date(today.getTime() - (days - 1) * 86400000);
      const startStr = startDate.toISOString().split('T')[0];
      
      const { data: orders, error } = await supabase
        .from('orders')
        .select('delivery_date, total_amount, status')
        .gte('delivery_date', startStr)
        .eq('status', 'delivered');
      
      if (error) throw error;
      
      // Group by date
      const revenueByDate = new Map<string, number>();
      (orders || []).forEach((order: any) => {
        const date = order.delivery_date;
        const amount = Number(order.total_amount || 0);
        revenueByDate.set(date, (revenueByDate.get(date) || 0) + amount);
      });
      
      // Generate all dates in range
      const result: RevenuePoint[] = [];
      for (let i = 0; i < days; i++) {
        const d = new Date(today.getTime() - (days - i - 1) * 86400000);
        const dateStr = d.toISOString().split('T')[0];
        result.push({ 
          date: d.toISOString().slice(5, 10), 
          amount: revenueByDate.get(dateStr) || 0 
        });
      }
      
      return result;
    } catch (e) {
      console.error('Revenue trend error:', e);
      return [];
    }
  },
  
  async deliveryPerformance(): Promise<DeliveryStatus[]> {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const { data: orders, error } = await supabase
        .from('orders')
        .select('status')
        .eq('delivery_date', today);
      
      if (error) throw error;
      
      // Count by status
      const statusCounts = new Map<string, number>();
      (orders || []).forEach((order: any) => {
        const status = order.status || 'unknown';
        statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
      });
      
      const statusLabels: Record<string, string> = {
        'delivered': 'Completed',
        'pending': 'Pending',
        'assigned': 'Assigned',
        'in_transit': 'In Transit',
        'cancelled': 'Cancelled',
        'skipped': 'Skipped',
        'failed': 'Failed',
      };
      
      return Array.from(statusCounts.entries()).map(([status, count]) => ({
        status: statusLabels[status] || status,
        count
      }));
    } catch (e) {
      console.error('Delivery performance error:', e);
      return [];
    }
  },
  
  async customerGrowth(weeks: number = 4): Promise<CustomerGrowthPoint[]> {
    try {
      const result: CustomerGrowthPoint[] = [];
      const today = new Date();
      
      for (let i = weeks - 1; i >= 0; i--) {
        const weekEnd = new Date(today.getTime() - i * 7 * 86400000);
        const weekEndStr = weekEnd.toISOString();
        
        const { count, error } = await supabase
          .from('customers')
          .select('id', { count: 'exact', head: true })
          .lte('created_at', weekEndStr);
        
        if (error) throw error;
        
        result.push({ 
          label: `Week ${weeks - i}`, 
          count: count || 0 
        });
      }
      
      return result;
    } catch (e) {
      console.error('Customer growth error:', e);
      return [];
    }
  },
  
  async productPopularity(limit: number = 5): Promise<ProductPopularityPoint[]> {
    try {
      // Get order counts grouped by product
      const { data: orders, error } = await supabase
        .from('orders')
        .select('product_id, quantity, products:product_id (name)')
        .eq('status', 'delivered');
      
      if (error) throw error;
      
      // Aggregate by product
      const productUnits = new Map<string, { name: string; units: number }>();
      (orders || []).forEach((order: any) => {
        const productName = order.products?.name || 'Unknown';
        const existing = productUnits.get(productName) || { name: productName, units: 0 };
        existing.units += Number(order.quantity || 1);
        productUnits.set(productName, existing);
      });
      
      // Sort by units and take top N
      return Array.from(productUnits.values())
        .sort((a, b) => b.units - a.units)
        .slice(0, limit);
    } catch (e) {
      console.error('Product popularity error:', e);
      return [];
    }
  },
};

export type AnalyticsBundle = {
  revenue: RevenuePoint[];
  deliveries: DeliveryStatus[];
  growth: CustomerGrowthPoint[];
  products: ProductPopularityPoint[];
};

export async function fetchAnalytics(): Promise<AnalyticsBundle> {
  const [revenue, deliveries, growth, products] = await Promise.all([
    AnalyticsService.revenueTrend(7),
    AnalyticsService.deliveryPerformance(),
    AnalyticsService.customerGrowth(4),
    AnalyticsService.productPopularity(5),
  ]);
  return { revenue, deliveries, growth, products };
}
