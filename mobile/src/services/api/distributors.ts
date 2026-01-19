import { supabase } from '../supabase';

export async function getAssignedSocieties(distributorId: string) {
  return supabase
    .from('distributor_building_assignments')
    .select('id, society:societies(id,name), tower:society_towers(id,name)')
    .eq('distributor_id', distributorId)
    .eq('is_active', true)
    .order('created_at', { ascending: false });
}

export async function getSocietyDeliveries(societyId: string, date: string) {
  return supabase
    .from('orders')
    .select(`
      id,
      order_number,
      delivery_date,
      status,
      total_amount,
      quantity,
      unit_price,
      product:products(id,name,unit),
      address:addresses(
        id,
        society:societies!addresses_society_id_fkey(name),
        tower:society_towers!addresses_tower_id_fkey(name),
        unit:tower_units!addresses_unit_id_fkey(number,floor)
      )
    `)
    .eq('delivery_date', date)
    .eq('addresses.society_id', societyId)
    .order('order_number');
}

export async function markDelivered(orderId: string, distributorId: string, otp?: string) {
  // Update order status to delivered - ONLY if assigned to this distributor
  // Note: Wallet debit is handled separately in processDelivery in TodaysDeliveriesScreen
  const { data, error } = await supabase
    .from('orders')
    .update({ status: 'delivered', delivered_at: new Date().toISOString() })
    .eq('id', orderId)
    .eq('assigned_distributor_id', distributorId) // Ownership check - only assigned distributor can mark
    .in('status', ['scheduled', 'pending', 'assigned', 'in_transit']) // Only valid statuses
    .select('id, status, delivered_at')
    .single();
  
  if (error && error.code === 'PGRST116') {
    throw new Error('Order not found or not assigned to you');
  }
  
  return { data, error };
}

/**
 * Mark an order as confirmed not delivered (customer not at home, etc.)
 * Uses photo_proofs for evidence
 */
export async function markNoDelivery(
  orderId: string, 
  reason: string, 
  distributorId: string, 
  photoProofId?: string
) {
  // Schema uses 'missed' status and skip_reason for undelivered orders
  // SECURITY: Verify the distributor is assigned to this order
  const { data, error } = await supabase
    .from('orders')
    .update({ 
      status: 'missed',
      skip_reason: reason,
    })
    .eq('id', orderId)
    .eq('assigned_distributor_id', distributorId) // Authorization check
    .select('id, status, skip_reason')
    .single();

  if (error) throw error;
  return data;
}

/**
 * Upload a photo proof for stock received, returns, or delivery issues
 */
export async function uploadPhotoProof(
  distributorId: string,
  proofType: 'stock_received' | 'stock_returned' | 'delivery_issue' | 'product_damage',
  photoUrl: string,
  notes?: string,
  relatedOrderId?: string
) {
  const { data, error } = await supabase
    .from('photo_proofs')
    .insert({
      distributor_id: distributorId,
      proof_type: proofType,
      photo_url: photoUrl,
      notes,
      related_order_id: relatedOrderId,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get photo proofs for a distributor
 */
export async function getPhotoProofs(
  distributorId: string,
  proofType?: 'stock_received' | 'stock_returned' | 'delivery_issue' | 'product_damage',
  date?: string
) {
  let query = supabase
    .from('photo_proofs')
    .select('*')
    .eq('distributor_id', distributorId)
    .order('created_at', { ascending: false });

  if (proofType) {
    query = query.eq('proof_type', proofType);
  }

  if (date) {
    query = query.gte('created_at', `${date}T00:00:00`)
                 .lte('created_at', `${date}T23:59:59`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// ============================================================================
// Earnings & Payouts
// ============================================================================

export async function getEarnings(distributorId: string, start: string, end: string) {
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('id, total_amount, quantity')
    .eq('assigned_distributor_id', distributorId)
    .eq('status', 'delivered')
    .gte('delivery_date', start)
    .lte('delivery_date', end);
  
  if (ordersError) return { data: null, error: ordersError };
  
  const totalEarnings = (orders || []).reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0) * 0.1;
  const totalUnits = (orders || []).reduce((sum, o) => sum + (Number(o.quantity) || 0), 0);
  return { 
    data: [{ total_earnings: totalEarnings, total_orders: orders?.length || 0, total_units: totalUnits }], 
    error: null 
  };
}

export async function getSalarySlips(distributorId: string) {
  return supabase
    .from('distributor_payouts')
    .select('id, period_start, period_end, base_earnings, bonus_amount, deductions, final_amount, deliveries_count, status, paid_at, created_at')
    .eq('distributor_id', distributorId)
    .order('period_start', { ascending: false });
}

export async function createSalarySlip(params: { 
  distributor_id: string; 
  period_start: string; 
  period_end: string; 
  notes?: string 
}) {
  return supabase
    .from('distributor_payouts')
    .insert({ 
      distributor_id: params.distributor_id, 
      period_start: params.period_start, 
      period_end: params.period_end, 
      base_earnings: 0, 
      bonus_amount: 0, 
      deductions: 0, 
      final_amount: 0 
    })
    .select('id')
    .single();
}
