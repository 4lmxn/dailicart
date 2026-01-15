import { supabase } from '../supabase';

export async function getEarnings(distributorId: string, start: string, end: string) {
  // Calculate earnings directly from orders (RPC doesn't exist in current schema)
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('id, total_amount, quantity')
    .eq('assigned_distributor_id', distributorId)
    .eq('status', 'delivered')
    .gte('delivery_date', start)
    .lte('delivery_date', end);
  
  if (ordersError) return { data: null, error: ordersError };
  
  const totalEarnings = (orders || []).reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0) * 0.1; // 10% commission
  const totalUnits = (orders || []).reduce((sum, o) => sum + (Number(o.quantity) || 0), 0);
  return { 
    data: [{ total_earnings: totalEarnings, total_orders: orders?.length || 0, total_units: totalUnits }], 
    error: null 
  };
}

export async function getSalarySlips(distributorId: string) {
  // Use distributor_payouts table (salary_slips doesn't exist)
  return supabase
    .from('distributor_payouts')
    .select('id, period_start, period_end, base_earnings, bonus_amount, deductions, final_amount, deliveries_count, status, paid_at, created_at')
    .eq('distributor_id', distributorId)
    .order('period_start', { ascending: false });
}

export async function createSalarySlip(params: { distributor_id: string; period_start: string; period_end: string; notes?: string }) {
  // Use distributor_payouts table
  return supabase
    .from('distributor_payouts')
    .insert({ distributor_id: params.distributor_id, period_start: params.period_start, period_end: params.period_end, base_earnings: 0, bonus_amount: 0, deductions: 0, final_amount: 0 })
    .select('id')
    .single();
}
