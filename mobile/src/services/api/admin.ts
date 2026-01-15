import { supabase } from '../supabase';
import { Distributor, DashboardStats } from './types';

export class AdminService {
  /**
   * Get dashboard statistics
   */
  static async getDashboardStats(): Promise<DashboardStats> {
    try {
      // Get customer count
      const { count: customerCount } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'customer');

      // Get active subscriptions count
      const { count: subscriptionCount } = await supabase
        .from('subscriptions')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');

      // Get paused subscriptions count
      const { count: pausedCount } = await supabase
        .from('subscriptions')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'paused');

      // Get distributor count
      const { count: distributorCount } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'distributor');

      // Get today's deliveries
      const today = new Date().toISOString().split('T')[0];
      const { data: deliveries } = await supabase
        .from('orders')
        .select('status')
        .eq('delivery_date', today);

      const todayDeliveries = deliveries?.length || 0;
      const completedDeliveries = deliveries?.filter(d => d.status === 'delivered').length || 0;
      const pendingDeliveries = deliveries?.filter(d => 
        ['pending', 'assigned', 'in_transit'].includes(d.status)
      ).length || 0;

      // Get revenue (sum of successful transactions)
      const { data: todayTransactions } = await supabase
        .from('wallet_transactions')
        .select('amount')
        .eq('status', 'completed')
        .gte('created_at', today + 'T00:00:00')
        .lt('created_at', today + 'T23:59:59');

      const todayRevenue = todayTransactions?.reduce((sum, txn) => sum + txn.amount, 0) || 0;

      // Get monthly revenue
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const { data: monthTransactions } = await supabase
        .from('wallet_transactions')
        .select('amount')
        .eq('status', 'completed')
        .gte('created_at', monthStart.toISOString());

      const monthlyRevenue = monthTransactions?.reduce((sum, txn) => sum + txn.amount, 0) || 0;

      // Get low wallet customers
      const { count: lowWalletCount } = await supabase
        .from('customers')
        .select('*', { count: 'exact', head: true })
        .lt('wallet_balance', 200);

      return {
        totalCustomers: customerCount || 0,
        activeSubscriptions: subscriptionCount || 0,
        totalDistributors: distributorCount || 0,
        todayDeliveries,
        pendingDeliveries,
        completedDeliveries,
        todayRevenue,
        monthlyRevenue,
        lowWalletCustomers: lowWalletCount || 0,
        pausedSubscriptions: pausedCount || 0,
      };
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      throw error;
    }
  }

  /**
   * Generate orders from subscriptions for a date range
   * First tries Edge Function, then falls back to direct RPC call
   * @param user_id - The user's ID (users.id)
   */
  static async generateOrders(params: { start?: string; end?: string; user_id?: string }) {
    const start = params.start || new Date().toISOString().slice(0, 10);
    const end = params.end || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    // Try Edge Function first
    try {
      const { data, error } = await supabase.functions.invoke('generate_orders', {
        body: { start, end, user_id: params.user_id || null },
      });

      if (!error) {
        return { data, error: null };
      }
      console.warn('Edge function failed, falling back to RPC:', error);
    } catch (edgeFnError) {
      console.warn('Edge function unavailable, falling back to RPC:', edgeFnError);
    }

    // Fallback: call RPC directly
    const { data, error } = await supabase.rpc('generate_subscription_orders', {
      p_start: start,
      p_end: end,
      p_user_id: params.user_id || null,
    });

    if (error) {
      return { data: null, error };
    }

    return { 
      data: { ok: true, start, end, result: data }, 
      error: null 
    };
  }

  /**
   * Get all distributors
   */
  static async getAllDistributors(): Promise<Distributor[]> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select(`
          *,
          distributors (*)
        `)
        .eq('role', 'distributor')
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map(user => ({
        id: user.id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        zone: Array.isArray(user.distributors?.[0]?.assigned_areas)
          ? (user.distributors?.[0]?.assigned_areas[0] || '')
          : '',
        vehicleNumber: user.distributors?.[0]?.vehicle_number || '',
        deliveries: 0,
        onTime: 0,
        rating: 0,
        collection: 0,
        isActive: user.distributors?.[0]?.is_active || false,
      }));
    } catch (error) {
      console.error('Error fetching distributors:', error);
      throw error;
    }
  }

  /**
   * Update distributor profile
   */
  static async updateDistributor(
    distributorId: string,
    updates: Partial<{
      zone: string;
      vehicleNumber: string;
      isActive: boolean;
    }>
  ): Promise<void> {
    try {
      const updateData: any = {
        assigned_areas: updates.zone ? [updates.zone] : undefined,
        vehicle_number: updates.vehicleNumber,
        is_active: updates.isActive,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('distributors')
        .update(updateData)
        .eq('user_id', distributorId);

      if (error) throw error;
    } catch (error) {
      console.error('Error updating distributor:', error);
      throw error;
    }
  }

  /**
   * Get unassigned or pending orders that need distributor assignment
   */
  static async getUnassignedOrders(filters?: { date?: string; status?: string }) {
    let query = supabase
      .from('orders')
      .select('id,order_number,delivery_date,status,total_amount,quantity,unit_price,assigned_distributor_id,product:products(id,name,unit),customer:customers(id,user:users(name,phone)),address:addresses(id,society:societies!addresses_society_id_fkey(name),tower:society_towers!addresses_tower_id_fkey(name),unit:tower_units!addresses_unit_id_fkey(number,floor))')
      .order('delivery_date', { ascending: true });

    if (filters?.date) {
      query = query.eq('delivery_date', filters.date);
    }
    // Only filter by status if it's not 'all'
    if (filters?.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }

    return query;
  }

  /**
   * Assign or reassign a distributor to an order
   */
  static async assignDistributorToOrder(orderId: string, distributorId: string) {
    return supabase
      .from('orders')
      .update({ assigned_distributor_id: distributorId })
      .eq('id', orderId)
      .select('id,order_number,assigned_distributor_id')
      .single();
  }

  /**
   * Bulk assign distributor to multiple orders
   */
  static async bulkAssignDistributor(orderIds: string[], distributorId: string) {
    return supabase
      .from('orders')
      .update({ assigned_distributor_id: distributorId })
      .in('id', orderIds)
      .select('id');
  }

  /**
   * Get all active distributors for assignment dropdown
   */
  static async getActiveDistributors() {
    return supabase
      .from('distributors')
      .select('id,user:users(id,name,phone)')
      .eq('is_active', true)
      .order('id');
  }

  /**
   * Create a manual order (admin adds extra delivery)
   * Note: Current schema supports single product per order.
   * If multiple items needed, creates multiple orders.
   * @param user_id - The user's ID (users.id)
   */
  static async createManualOrder(params: {
    user_id: string;
    address_id: string;
    delivery_date: string;
    items: Array<{ product_id: string; quantity: number; unit_price: number }>;
    assigned_distributor_id?: string;
  }) {
    // Schema has product_id directly on orders (single product per order)
    // Create one order per item
    const orders: any[] = [];
    
    for (const item of params.items) {
      const total = item.quantity * item.unit_price;
      
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          user_id: params.user_id,
          address_id: params.address_id,
          delivery_date: params.delivery_date,
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          assigned_distributor_id: params.assigned_distributor_id || null,
          status: 'pending',
          total_amount: total,
          payment_status: 'created',
        })
        .select('id,order_number')
        .single();

      if (orderError) return { data: null, error: orderError };
      orders.push(order);
    }

    return { data: orders.length === 1 ? orders[0] : orders, error: null };
  }

  /**
   * Get distributor detail with real schema data
   */
  static async getDistributorDetails(distributorUserId: string) {
    // Accept either distributor.id or users.id; try distributor.id first then fallback
    let { data, error } = await supabase
      .from('distributors')
      .select(`
        id,
        user_id,
        assigned_areas,
        vehicle_number,
        is_active,
        created_at,
        users:users!inner (id, name, phone, email)
      `)
      .eq('id', distributorUserId)
      .single();

    if (error) {
      // Fallback: treat provided id as user_id
      const fallback = await supabase
        .from('distributors')
        .select(`
          id,
          user_id,
          assigned_areas,
          vehicle_number,
          is_active,
          created_at,
          users:users!inner (id, name, phone, email)
        `)
        .eq('user_id', distributorUserId)
        .single();
      data = fallback.data as any;
      error = fallback.error as any;
    }

    if (error) return { data: null, error };
    return { data, error: null };
  }

  /**
   * Get distributor building/society assignments
   */
  static async getDistributorAssignments(distributorId: string) {
      const { data, error } = await supabase
      .from('distributor_building_assignments')
      .select(`
        id,
        assigned_at,
        is_active,
        society:societies (id, name, pincode),
        tower:society_towers (id, name)
      `)
      .eq('distributor_id', distributorId)
      .eq('is_active', true)
      .order('assigned_at', { ascending: false });    return { data, error };
  }

  /**
   * Get distributor earnings (calculated from orders)
   */
  static async getDistributorEarnings(distributorId: string, periodStart: string, periodEnd: string) {
    // Calculate directly from orders (RPC doesn't exist)
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('id, total_amount')
      .eq('assigned_distributor_id', distributorId)
      .eq('status', 'delivered')
      .gte('delivery_date', periodStart)
      .lte('delivery_date', periodEnd);
    
    if (ordersError) return { data: null, error: ordersError };
    
    const totalEarnings = (orders || []).reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0) * 0.1;
    return { 
      data: { total_earnings: totalEarnings, total_orders: orders?.length || 0, total_units: 0 }, 
      error: null 
    };
  }

  /**
   * Get distributor payouts (salary slips)
   */
  static async getDistributorSalarySlips(distributorId: string, limit = 12) {
    const { data, error } = await supabase
      .from('distributor_payouts')
      .select('*')
      .eq('distributor_id', distributorId)
      .order('period_start', { ascending: false })
      .limit(limit);

    return { data, error };
  }

  /**
   * Get distributor stock movements (from handover table)
   */
  static async getDistributorStockMovements(distributorId: string, limit = 50) {
    // Query distributor_stock_handover for actual handover records
    const { data, error } = await supabase
      .from('distributor_stock_handover')
      .select(`
        id,
        handover_date,
        stock_given,
        stock_returned,
        given_at,
        returned_at,
        discrepancy_notes
      `)
      .eq('distributor_id', distributorId)
      .order('handover_date', { ascending: false })
      .limit(limit);

    if (error) return { data: [], error };

    // Flatten into movements
    const movements: any[] = [];
    (data || []).forEach((record: any) => {
      // Stock given (issued to distributor)
      if (record.stock_given && Array.isArray(record.stock_given)) {
        record.stock_given.forEach((item: any) => {
          movements.push({
            id: `${record.id}-given-${item.product_id || movements.length}`,
            movement_date: record.given_at || record.handover_date,
            movement_type: 'issue',
            quantity: item.quantity || 0,
            product_name: item.product_name || 'Product',
            notes: `Issued on ${record.handover_date}`
          });
        });
      }
      // Stock returned
      if (record.stock_returned && Array.isArray(record.stock_returned)) {
        record.stock_returned.forEach((item: any) => {
          movements.push({
            id: `${record.id}-return-${item.product_id || movements.length}`,
            movement_date: record.returned_at || record.handover_date,
            movement_type: 'return',
            quantity: item.quantity || 0,
            product_name: item.product_name || 'Product',
            notes: record.discrepancy_notes || `Returned on ${record.handover_date}`
          });
        });
      }
    });

    return { data: movements, error: null };
  }

  /**
   * Get stock collections for admin view
   */
  static async getStockCollections(date?: string) {
    const targetDate = date || new Date().toISOString().split('T')[0];
    // Use direct query with distributor details - join through distributors table
    const { data, error } = await supabase
      .from('distributor_stock_handover')
      .select(`
        id,
        distributor_id,
        handover_date,
        stock_given,
        given_at,
        stock_returned,
        returned_at,
        given_by,
        discrepancy_notes,
        distributor:distributors!distributor_id(user_id, users(name, phone))
      `)
      .eq('handover_date', targetDate);

    if (error) return { data: null, error };

    // Map to StockCollection interface
    const mapped = (data || []).map((row: any) => {
      const stockGiven = row.stock_given || [];
      const stockReturned = row.stock_returned || [];
      const totalGiven = stockGiven.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0);
      const totalReturned = stockReturned.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0);
      
      let status: 'pending' | 'collected' | 'verified' | 'returned' = 'pending';
      if (row.returned_at) status = 'returned';
      else if (row.given_at) status = 'collected';
      
      return {
        collection_id: row.id,
        distributor_id: row.distributor_id,
        distributor_name: row.distributor?.users?.name || 'Unknown',
        distributor_phone: row.distributor?.users?.phone || '',
        collection_date: row.handover_date,
        status,
        total_items: stockGiven.length,
        total_required: totalGiven,
        total_collected: row.given_at ? totalGiven : 0, // Only show collected if actually given
        total_returned: totalReturned,
        collected_at: row.given_at,
        verified_at: row.given_at,
        discrepancy_notes: row.discrepancy_notes,
      };
    });

    return { data: mapped, error: null };
  }

  /**
   * Generate/create stock collection for a distributor (upsert handover record)
   * This creates a PENDING collection - admin must verify/give stock separately
   */
  static async generateStockCollection(distributorId: string, date?: string, stockItems?: Array<{product_id: string, quantity: number}>) {
    const targetDate = date || new Date().toISOString().split('T')[0];
    // Create or update distributor_stock_handover record
    // Explicitly set given_at to null so status stays "pending"
    return supabase
      .from('distributor_stock_handover')
      .upsert({
        distributor_id: distributorId,
        handover_date: targetDate,
        stock_given: stockItems || [],
        given_at: null, // Not yet collected - will be set when admin gives stock
        given_by: null,
      }, { onConflict: 'distributor_id,handover_date' })
      .select('id')
      .single();
  }

  /**
   * Mark stock as given to distributor (changes status from pending to collected)
   */
  static async giveStockToDistributor(
    collectionId: string, 
    adminId: string, 
    stockGiven?: Array<{ product_id: string; quantity: number }>,
    notes?: string
  ) {
    const updateData: any = {
      given_at: new Date().toISOString(),
      given_by: adminId,
      discrepancy_notes: notes || null,
    };
    
    // If stockGiven is provided, update the quantities
    if (stockGiven && stockGiven.length > 0) {
      updateData.stock_given = stockGiven;
    }
    
    return supabase
      .from('distributor_stock_handover')
      .update(updateData)
      .eq('id', collectionId)
      .select('id')
      .single();
  }

  /**
   * Verify a distributor's stock collection (mark as given) - ALIAS for backwards compat
   */
  static async verifyStockCollection(collectionId: string, adminId: string, notes?: string) {
    return supabase
      .from('distributor_stock_handover')
      .update({
        given_at: new Date().toISOString(),
        given_by: adminId,
        discrepancy_notes: notes || null,
      })
      .eq('id', collectionId)
      .select('id')
      .single();
  }

  /**
   * Get inventory summary - directly from products table (no RPC needed)
   */
  static async getInventorySummary() {
    const { data, error } = await supabase
      .from('products')
      .select(`
        id,
        name,
        unit,
        stock_quantity,
        min_stock_alert,
        updated_at
      `)
      .eq('is_active', true)
      .order('name');

    return {
      data: (data || []).map((p: any) => ({
        product_id: p.id,
        product_name: p.name,
        product_unit: p.unit,
        quantity_on_hand: p.stock_quantity || 0,
        min_stock_alert: p.min_stock_alert || 0,
        last_updated: p.updated_at
      })),
      error
    };
  }
}
