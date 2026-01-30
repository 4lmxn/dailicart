import { supabase } from '../supabase';
import { Subscription } from './types';
import { uuidSchema, safeValidate, z } from '../../utils/validation';
import { getLocalDateString } from '../../utils/helpers';
import { checkRateLimit } from '../../utils/rateLimit';

// Local subscription validation schema
const subscriptionQuantitySchema = z.number().int().min(1, 'Minimum quantity is 1').max(10, 'Maximum quantity is 10');
const subscriptionFrequencySchema = z.enum(['daily', 'alternate', 'custom']);
const customDaysSchema = z.array(z.number().min(0).max(6)).max(7);

// Helper function to calculate next delivery date based on frequency
function calculateNextDeliveryDate(
  startDate: string,
  frequency: 'daily' | 'alternate' | 'custom',
  customDays?: number[],
  pauseEndDate?: string | null
): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // If paused, next delivery is after pause ends
  let searchStart = today;
  if (pauseEndDate) {
    const pauseEnd = new Date(pauseEndDate);
    pauseEnd.setHours(0, 0, 0, 0);
    if (pauseEnd > today) {
      searchStart = pauseEnd;
      searchStart.setDate(searchStart.getDate() + 1);
    }
  }
  
  const subStart = new Date(startDate);
  subStart.setHours(0, 0, 0, 0);
  
  // Start searching from today or subscription start, whichever is later
  let current = new Date(Math.max(searchStart.getTime(), subStart.getTime()));
  
  // If current is today or before, start from tomorrow for "next" delivery
  if (current <= today) {
    current = new Date(today);
    current.setDate(current.getDate() + 1);
  }
  
  // Search for up to 14 days to find next delivery
  for (let i = 0; i < 14; i++) {
    const dayOfWeek = current.getDay();
    const daysSinceStart = Math.floor((current.getTime() - subStart.getTime()) / (1000 * 60 * 60 * 24));
    
    let isDeliveryDay = false;
    
    if (frequency === 'daily') {
      isDeliveryDay = true;
    } else if (frequency === 'alternate') {
      isDeliveryDay = daysSinceStart % 2 === 0;
    } else if (frequency === 'custom' && customDays && customDays.length > 0) {
      isDeliveryDay = customDays.includes(dayOfWeek);
    }
    
    if (isDeliveryDay) {
      return getLocalDateString(current);
    }
    
    current.setDate(current.getDate() + 1);
  }
  
  // Fallback to tomorrow if no delivery found
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return getLocalDateString(tomorrow);
}

export class SubscriptionService {
  /**
   * Get all subscriptions for a customer (using user_id)
   * @param userId - The users.id (user_id) for the customer
   */
  static async getCustomerSubscriptions(userId: string): Promise<Subscription[]> {
    try {
      // Query using user_id directly
      let { data, error } = await supabase
        .from('subscriptions')
        .select(`
          id,
          user_id,
          product_id,
          quantity,
          frequency,
          custom_days,
          status,
          start_date,
          pause_start_date,
          pause_end_date
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Get product info separately to avoid join issues
      const productIds = [...new Set((data || []).map(s => s.product_id))];
      const { data: productsData } = await supabase
        .from('products')
        .select('id, name, unit, price, brand_id, brands(name)')
        .in('id', productIds);
      
      const productsMap = new Map(
        (productsData || []).map(p => [p.id, { ...p, brandName: (p.brands as any)?.name }])
      );

      // Fetch order stats for all subscriptions in one query
      // Only count orders with delivery_date <= today (past/current deliveries, not future scheduled ones)
      const subscriptionIds = (data || []).map(s => s.id);
      const today = getLocalDateString();
      const { data: ordersData } = await supabase
        .from('orders')
        .select('subscription_id, status, delivery_date')
        .in('subscription_id', subscriptionIds.length > 0 ? subscriptionIds : ['00000000-0000-0000-0000-000000000000'])
        .lte('delivery_date', today);
      
      // Calculate stats per subscription (only for past/current deliveries)
      const statsMap = new Map<string, { total: number; delivered: number; skipped: number; missed: number }>();
      for (const order of (ordersData || [])) {
        const subId = order.subscription_id;
        if (!subId) continue;
        const stats = statsMap.get(subId) || { total: 0, delivered: 0, skipped: 0, missed: 0 };
        stats.total++;
        if (order.status === 'delivered') stats.delivered++;
        else if (order.status === 'skipped' || order.status === 'cancelled') stats.skipped++;
        else if (order.status === 'missed' || order.status === 'failed') stats.missed++;
        // Pending orders for today or past are counted as 'missed' if not delivered
        else if (order.status === 'pending' || order.status === 'scheduled') stats.missed++;
        statsMap.set(subId, stats);
      }

      return (data || []).map((sub: any) => {
        const product = productsMap.get(sub.product_id);
        const stats = statsMap.get(sub.id) || { total: 0, delivered: 0, skipped: 0, missed: 0 };
        // Calculate next delivery date client-side
        const nextDelivery = calculateNextDeliveryDate(
          sub.start_date,
          sub.frequency,
          sub.custom_days,
          sub.pause_end_date
        );
        
        return {
          id: sub.id,
          customerId: sub.user_id,
          productId: sub.product_id,
          productName: product?.name,
          brand: product?.brandName || '',
          quantity: sub.quantity,
          unit: product?.unit,
          frequency: sub.frequency,
          customDays: sub.custom_days,
          deliveryTime: 'morning',
          status: sub.status === 'cancelled' ? 'paused' : sub.status,
          startDate: sub.start_date,
          pausedUntil: sub.pause_end_date || null,
          nextDeliveryDate: nextDelivery,
          price: product?.price,
          totalDeliveries: stats.total,
          successfulDeliveries: stats.delivered,
          skippedDeliveries: stats.skipped,
          missedDeliveries: stats.missed,
        };
      });
    } catch (error) {
      console.error('Error fetching subscriptions:', error);
      throw error;
    }
  }

  /**
   * Get a single subscription by ID
   */
  static async getSubscriptionById(subscriptionId: string): Promise<Subscription> {
    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .select(`
          id,
          user_id,
          product_id,
          quantity,
          frequency,
          custom_days,
          status,
          start_date,
          pause_start_date,
          pause_end_date
        `)
        .eq('id', subscriptionId)
        .single();

      if (error) throw error;
      
      // Get product info separately
      const { data: product } = await supabase
        .from('products')
        .select('id, name, unit, price')
        .eq('id', (data as any).product_id)
        .single();

      // Calculate next delivery date client-side
      const nextDelivery = calculateNextDeliveryDate(
        (data as any).start_date,
        (data as any).frequency,
        (data as any).custom_days,
        (data as any).pause_end_date
      );

      return {
        id: (data as any).id,
        customerId: (data as any).user_id,
        productId: (data as any).product_id,
        productName: product?.name,
        brand: '',
        quantity: (data as any).quantity,
        unit: product?.unit,
        frequency: (data as any).frequency,
        customDays: (data as any).custom_days,
        deliveryTime: 'morning',
        status: (data as any).status === 'cancelled' ? 'paused' : (data as any).status,
        startDate: (data as any).start_date,
        pausedUntil: (data as any).pause_end_date || null,
        nextDeliveryDate: nextDelivery,
        price: product?.price,
        totalDeliveries: 0,
        successfulDeliveries: 0,
        skippedDeliveries: 0,
        missedDeliveries: 0,
      };
    } catch (error) {
      console.error('Error fetching subscription:', error);
      throw error;
    }
  }

  /**
   * Pause a subscription (with ownership verification)
   */
  static async pauseSubscription(
    subscriptionId: string,
    pauseDays: number
  ): Promise<void> {
    try {
      // Verify current user owns this subscription
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      
      // Validate pause days (max 90 days)
      if (pauseDays < 1 || pauseDays > 90) {
        throw new Error('Pause duration must be between 1 and 90 days');
      }
      
      const pausedUntil = new Date();
      pausedUntil.setDate(pausedUntil.getDate() + pauseDays);

      // Use local date helper to avoid timezone issues
      const { getLocalDateString } = await import('../../utils/helpers');
      const todayLocal = getLocalDateString();
      const pauseEndLocal = getLocalDateString(pausedUntil);

      const { data, error } = await supabase
        .from('subscriptions')
        .update({
          status: 'paused',
          pause_start_date: todayLocal,
          pause_end_date: pauseEndLocal,
          updated_at: new Date().toISOString(),
        })
        .eq('id', subscriptionId)
        .eq('user_id', user.id) // Ownership check
        .select('id');

      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Subscription not found or access denied');
      }
    } catch (error) {
      console.error('Error pausing subscription:', error);
      throw error;
    }
  }

  /**
   * Resume a paused subscription (with ownership verification)
   */
  static async resumeSubscription(subscriptionId: string): Promise<void> {
    try {
      // Verify current user owns this subscription
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      
      const { data, error } = await supabase
        .from('subscriptions')
        .update({
          status: 'active',
          pause_start_date: null,
          pause_end_date: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', subscriptionId)
        .eq('user_id', user.id) // Ownership check
        .select('id');

      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Subscription not found or access denied');
      }
    } catch (error) {
      console.error('Error resuming subscription:', error);
      throw error;
    }
  }

  /**
   * Cancel a subscription (with ownership verification)
   */
  static async cancelSubscription(subscriptionId: string): Promise<void> {
    try {
      // Verify current user owns this subscription
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      
      const { data, error } = await supabase
        .from('subscriptions')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', subscriptionId)
        .eq('user_id', user.id) // Ownership check
        .select('id');

      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Subscription not found or access denied');
      }
    } catch (error) {
      console.error('Error cancelling subscription:', error);
      throw error;
    }
  }

  /**
   * Skip next delivery - marks the next scheduled order as skipped
   */
  static async skipNextDelivery(subscriptionId: string): Promise<void> {
    try {
      // Get subscription to find user_id
      const { data: sub, error: subError } = await supabase
        .from('subscriptions')
        .select('user_id')
        .eq('id', subscriptionId)
        .single();
      
      if (subError || !sub) throw new Error('Subscription not found');
      
      // Find the next scheduled order for this subscription
      const today = getLocalDateString();
      const { data: nextOrder, error: orderError } = await supabase
        .from('orders')
        .select('id')
        .eq('subscription_id', subscriptionId)
        .gte('delivery_date', today)
        .in('status', ['scheduled', 'pending', 'assigned'])
        .order('delivery_date', { ascending: true })
        .limit(1)
        .single();
      
      if (orderError && orderError.code !== 'PGRST116') throw orderError;
      
      if (nextOrder) {
        // Mark the next order as skipped
        const { error: updateError } = await supabase
          .from('orders')
          .update({ status: 'skipped', skip_reason: 'Skipped by customer' })
          .eq('id', nextOrder.id);
        
        if (updateError) throw updateError;
      } else {
        // No order exists yet - create a skipped order for the next delivery date
        const { data: subDetails } = await supabase
          .from('subscriptions')
          .select('product_id, quantity, address_id, frequency, custom_days, start_date')
          .eq('id', subscriptionId)
          .single();
        
        if (subDetails) {
          const { data: product } = await supabase
            .from('products')
            .select('price')
            .eq('id', subDetails.product_id)
            .single();
          
          const nextDate = calculateNextDeliveryDate(
            subDetails.start_date,
            subDetails.frequency,
            subDetails.custom_days,
            null
          );
          
          if (nextDate) {
            const unitPrice = product?.price || 0;
            const qty = subDetails.quantity || 1;
            await supabase.from('orders').insert({
              order_number: `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              user_id: sub.user_id,
              address_id: subDetails.address_id,
              product_id: subDetails.product_id,
              quantity: qty,
              unit_price: unitPrice,
              total_amount: qty * unitPrice,
              delivery_date: nextDate,
              status: 'skipped',
              subscription_id: subscriptionId,
              skip_reason: 'Skipped by customer',
            });
          }
        }
      }
    } catch (error) {
      console.error('Error skipping delivery:', error);
      throw error;
    }
  }

  /**
   * Change subscription frequency
   */
  static async changeFrequency(
    subscriptionId: string,
    frequency: 'daily' | 'alternate' | 'custom',
    customDays?: number[]
  ): Promise<void> {
    try {
      // Update subscription frequency
      const { error } = await supabase
        .from('subscriptions')
        .update({
          frequency,
          custom_days: customDays || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', subscriptionId);

      if (error) throw error;

      // Delete future pending orders and regenerate them based on new frequency
      const today = getLocalDateString();
      
      // Delete future orders that are still pending/scheduled
      const { error: deleteError } = await supabase
        .from('orders')
        .delete()
        .eq('subscription_id', subscriptionId)
        .gt('delivery_date', today)
        .in('status', ['pending', 'scheduled']);

      if (deleteError) {
        console.warn('Error deleting future orders:', deleteError);
      }

      // Trigger order regeneration via edge function or let the daily cron job handle it
      // For now, we'll call a simple RPC if available, otherwise orders will be regenerated by cron
      try {
        await supabase.rpc('generate_subscription_orders', { 
          p_subscription_id: subscriptionId,
          p_days_ahead: 7
        });
      } catch (rpcError) {
        // RPC might not exist, that's OK - orders will be generated by cron job
        console.log('Order regeneration RPC not available, will be handled by cron');
      }
    } catch (error) {
      console.error('Error changing frequency:', error);
      throw error;
    }
  }

  /**
   * Update subscription details
   */
  static async updateSubscription(
    subscriptionId: string,
    updates: Partial<{
      quantity: number;
      deliveryTime: 'morning' | 'evening'; // Not in DB schema, kept for UI only
      frequency: 'daily' | 'alternate' | 'custom';
      customDays: number[];
    }>
  ): Promise<void> {
    // Validate subscription ID
    const idValidation = safeValidate(uuidSchema, subscriptionId);
    if (!idValidation.success) {
      throw new Error(`Invalid subscription ID: ${idValidation.error}`);
    }
    // Validate quantity if provided
    if (updates.quantity !== undefined) {
      const qtyValidation = safeValidate(subscriptionQuantitySchema, updates.quantity);
      if (!qtyValidation.success) {
        throw new Error(qtyValidation.error);
      }
    }
    // Validate frequency if provided
    if (updates.frequency !== undefined) {
      const freqValidation = safeValidate(subscriptionFrequencySchema, updates.frequency);
      if (!freqValidation.success) {
        throw new Error(freqValidation.error);
      }
    }
    // Validate custom days if provided
    if (updates.customDays !== undefined) {
      const daysValidation = safeValidate(customDaysSchema, updates.customDays);
      if (!daysValidation.success) {
        throw new Error(daysValidation.error);
      }
    }

    try {
      // Only include fields that exist in the database schema
      const updateData: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };
      
      if (updates.quantity !== undefined) {
        updateData.quantity = updates.quantity;
      }
      if (updates.frequency !== undefined) {
        updateData.frequency = updates.frequency;
      }
      if (updates.customDays !== undefined) {
        updateData.custom_days = updates.customDays;
      }
      // Note: deliveryTime is not in the remote schema, so we skip it

      const { error } = await supabase
        .from('subscriptions')
        .update(updateData)
        .eq('id', subscriptionId);

      if (error) throw error;
    } catch (error) {
      console.error('Error updating subscription:', error);
      throw error;
    }
  }

  /**
   * Create a new subscription
   */
  static async createSubscription(params: {
    customerId: string;
    addressId: string;
    productId: string;
    quantity: number;
    frequency: 'daily' | 'alternate' | 'custom';
    customDays?: number[];
    deliveryTime: 'morning' | 'evening';
    startDate?: string;
  }): Promise<string> {
    // Rate limit check (10 subscription creates per minute)
    const rateLimitCheck = checkRateLimit('api:write', params.customerId);
    if (!rateLimitCheck.allowed) {
      const waitSeconds = Math.ceil((rateLimitCheck.retryAfterMs || 0) / 1000);
      throw new Error(`Too many requests. Please wait ${waitSeconds} seconds.`);
    }

    // Validate all inputs
    const customerValidation = safeValidate(uuidSchema, params.customerId);
    if (!customerValidation.success) {
      throw new Error(`Invalid customer ID: ${customerValidation.error}`);
    }
    const addressValidation = safeValidate(uuidSchema, params.addressId);
    if (!addressValidation.success) {
      throw new Error(`Invalid address ID: ${addressValidation.error}`);
    }
    const productValidation = safeValidate(uuidSchema, params.productId);
    if (!productValidation.success) {
      throw new Error(`Invalid product ID: ${productValidation.error}`);
    }
    const qtyValidation = safeValidate(subscriptionQuantitySchema, params.quantity);
    if (!qtyValidation.success) {
      throw new Error(qtyValidation.error);
    }
    const freqValidation = safeValidate(subscriptionFrequencySchema, params.frequency);
    if (!freqValidation.success) {
      throw new Error(freqValidation.error);
    }
    if (params.customDays) {
      const daysValidation = safeValidate(customDaysSchema, params.customDays);
      if (!daysValidation.success) {
        throw new Error(daysValidation.error);
      }
    }

    try {
      if (!params.addressId) {
        throw new Error('Address is required to create a subscription');
      }
      const startDate = params.startDate || getLocalDateString();
      
      // Get the product price and max quantity for validation
      const { data: product, error: productError } = await supabase
        .from('products')
        .select('price, max_order_quantity')
        .eq('id', params.productId)
        .single();
      
      if (productError || !product) {
        throw new Error('Product not found');
      }

      // Validate quantity against product's max_order_quantity (server-side validation)
      const maxQty = product.max_order_quantity || 10;
      if (params.quantity > maxQty) {
        throw new Error(`Maximum quantity for this product is ${maxQty}`);
      }

      const { data, error } = await supabase
        .from('subscriptions')
        .insert({
          user_id: params.customerId,
          address_id: params.addressId,
          product_id: params.productId,
          quantity: params.quantity,
          unit_price_locked: product.price, // Lock the price at subscription time
          frequency: params.frequency,
          custom_days: params.customDays || null,
          status: 'active',
          start_date: startDate,
          next_delivery_date: startDate,
        })
        .select('id')
        .single();

      if (error) {
        console.error('Subscription insert error details:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });
        throw error;
      }

      // Auto-generate orders for this subscription (30 days ahead)
      // The database trigger will handle this automatically once deployed,
      // but we also call it here as a fallback for immediate order generation
      try {
        await supabase.rpc('generate_orders_for_subscription', {
          p_subscription_id: data.id,
          p_days_ahead: 30,
        });
      } catch (rpcError) {
        // If RPC doesn't exist yet, fall back to the old method
        console.log('Auto-generation RPC not available, using legacy method');
        const { getLocalDateString } = await import('../../utils/helpers');
        const today = getLocalDateString();
        const endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        const end = getLocalDateString(endDate);
        try {
          await supabase.rpc('generate_subscription_orders', {
            p_start: today,
            p_end: end,
            p_user_id: params.customerId,
          });
        } catch {
          // Ignore if this also fails - orders will be generated by other means
        }
      }

      return data.id;
    } catch (error) {
      console.error('Error creating subscription:', error);
      throw error;
    }
  }

  /**
   * Get subscription count by status
   */
  static async getSubscriptionStats(customerId?: string): Promise<{
    active: number;
    paused: number;
    cancelled: number;
  }> {
    try {
      let query = supabase.from('subscriptions').select('status', { count: 'exact' });
      
      if (customerId) {
        query = query.eq('user_id', customerId);
      }

      const { data, error } = await query;

      if (error) throw error;

      const stats = {
        active: data?.filter(s => s.status === 'active').length || 0,
        paused: data?.filter(s => s.status === 'paused').length || 0,
        cancelled: data?.filter(s => s.status === 'cancelled').length || 0,
      };

      return stats;
    } catch (error) {
      console.error('Error fetching subscription stats:', error);
      throw error;
    }
  }
}
