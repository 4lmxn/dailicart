import { supabase } from '../../services/supabase';
import { getLocalDateString } from '../../utils/helpers';

export interface CalendarEventItem {
  product: string;
  quantity: string;
  price?: number;
}

export interface CalendarEvent {
  date: string; // YYYY-MM-DD
  items: CalendarEventItem[];
  status: 'scheduled' | 'delivered' | 'skipped' | 'paused' | 'missed' | 'pending' | 'assigned' | 'in_transit';
}

// RPC response type
interface DeliveryRpcResponse {
  success: boolean;
  error?: string;
  message: string;
  orders_updated?: number;
  orders_created?: number;
  days_skipped?: number;
}

export const DeliveryService = {
  async getCalendar(customerId: string, startDate: string, endDate: string): Promise<CalendarEvent[]> {
    // Since the remote DB schema may differ, go directly to subscriptions
    // to generate calendar events
    return await getCalendarFromSubscriptions(customerId, startDate, endDate);
  },

  /**
   * Skip delivery for a specific date (server-side RPC)
   */
  async skipDelivery(userId: string, deliveryDate: Date, reason?: string): Promise<DeliveryRpcResponse> {
    const dateStr = getLocalDateString(deliveryDate);
    const { data, error } = await supabase.rpc('skip_delivery', {
      p_user_id: userId,
      p_delivery_date: dateStr,
      p_reason: reason || 'Skipped by customer',
    });

    if (error) {
      throw new Error(error.message || 'Failed to skip delivery');
    }
    return data as DeliveryRpcResponse;
  },

  /**
   * Resume (unskip) delivery for a specific date (server-side RPC)
   */
  async unskipDelivery(userId: string, deliveryDate: Date): Promise<DeliveryRpcResponse> {
    const dateStr = getLocalDateString(deliveryDate);
    const { data, error } = await supabase.rpc('unskip_delivery', {
      p_user_id: userId,
      p_delivery_date: dateStr,
    });

    if (error) {
      throw new Error(error.message || 'Failed to resume delivery');
    }
    return data as DeliveryRpcResponse;
  },

  /**
   * Apply vacation (skip multiple dates) - server-side RPC
   */
  async applyVacation(userId: string, startDate: Date, endDate: Date, reason?: string): Promise<DeliveryRpcResponse> {
    const startStr = getLocalDateString(startDate);
    const endStr = getLocalDateString(endDate);
    const { data, error } = await supabase.rpc('apply_vacation', {
      p_user_id: userId,
      p_start_date: startStr,
      p_end_date: endStr,
      p_reason: reason || 'On vacation',
    });

    if (error) {
      throw new Error(error.message || 'Failed to apply vacation');
    }
    return data as DeliveryRpcResponse;
  },
};

// Get calendar from orders and subscriptions
async function getCalendarFromSubscriptions(
  userId: string,
  startDate: string,
  endDate: string
): Promise<CalendarEvent[]> {
  try {
    // First, fetch actual orders for this date range to get real statuses
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('id, delivery_date, status, quantity, product_id, products(id, name, price, unit)')
      .eq('user_id', userId)
      .gte('delivery_date', startDate)
      .lte('delivery_date', endDate);

    if (ordersError) {
      console.error('Orders fetch error:', ordersError);
    }

    // Build events from orders first (they have actual status)
    const events: Record<string, CalendarEvent> = {};

    if (orders && orders.length > 0) {
      for (const order of orders) {
        const dateStr = order.delivery_date;
        const product = order.products as any;
        const productName = product?.name || 'Product';
        const unit = product?.unit || '';
        const qty = order.quantity || 1;
        const unitPrice = product?.price || 0;
        const totalPrice = qty * unitPrice;

        // Map order status to calendar status
        // Note: order_status enum = 'scheduled', 'pending', 'assigned', 'in_transit', 'delivered', 'skipped', 'missed', 'cancelled', 'failed'
        let calendarStatus: 'scheduled' | 'delivered' | 'skipped' | 'paused' | 'missed' | 'pending' | 'assigned' | 'in_transit' = 'scheduled';
        if (order.status === 'delivered') {
          calendarStatus = 'delivered';
        } else if (order.status === 'missed') {
          calendarStatus = 'missed';
        } else if (order.status === 'skipped' || order.status === 'cancelled' || order.status === 'failed') {
          calendarStatus = 'skipped';
        } else if (order.status === 'pending' || order.status === 'assigned' || order.status === 'in_transit') {
          calendarStatus = order.status;
        }
        // Note: 'paused' is a subscription status, not an order status - orders are generated from paused subscriptions with 'skipped' status

        if (!events[dateStr]) {
          events[dateStr] = {
            date: dateStr,
            items: [],
            status: calendarStatus
          };
        } else {
          // Update status: prioritize showing active/positive statuses over skipped
          // Priority: delivered > in_transit > assigned > pending > scheduled > missed > skipped > paused
          // This ensures if there are still items to deliver, we show that status (not skipped)
          const statusPriority: Record<string, number> = {
            'delivered': 8, 'in_transit': 7, 'assigned': 6, 'pending': 5,
            'scheduled': 4, 'missed': 3, 'skipped': 2, 'paused': 1
          };
          if (statusPriority[calendarStatus] > statusPriority[events[dateStr].status]) {
            events[dateStr].status = calendarStatus;
          }
        }

        events[dateStr].items.push({
          product: productName,
          quantity: `${qty} × ${unit}`,  // Show as "2 × 500ml" not "2500ml"
          price: totalPrice,  // Total price, not unit price
        });
      }
    }

    // For future dates without orders yet, generate from subscriptions
    const { data: subscriptions, error } = await supabase
      .from('subscriptions')
      .select('id, product_id, quantity, frequency, custom_days, status, start_date, pause_start_date, pause_end_date')
      .eq('user_id', userId)
      .eq('status', 'active');

    if (error || !subscriptions || subscriptions.length === 0) {
      return Object.values(events).sort((a, b) => a.date.localeCompare(b.date));
    }

    // Get product info
    const productIds = [...new Set(subscriptions.map(s => s.product_id))];
    const { data: productsData } = await supabase
      .from('products')
      .select('id, name, price, unit')
      .in('id', productIds);

    const productsMap = new Map(
      (productsData || []).map(p => [p.id, p])
    );

    // Generate calendar events from subscriptions for dates without orders
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(startDate);
    const end = new Date(endDate);

    for (const sub of subscriptions) {
      const product = productsMap.get(sub.product_id);
      const productName = product?.name || 'Product';
      const unit = product?.unit || '';

      // Start from subscription start_date or range start, whichever is later
      let current = new Date(Math.max(start.getTime(), new Date(sub.start_date).getTime()));

      while (current <= end) {
        const dateStr = getLocalDateString(current);
        const dayOfWeek = current.getDay();

        // Skip if we already have an order for this date
        if (events[dateStr]) {
          current.setDate(current.getDate() + 1);
          continue;
        }

        // Check if date is in pause period
        let isPaused = false;
        if (sub.pause_start_date && sub.pause_end_date) {
          const pauseStart = new Date(sub.pause_start_date);
          const pauseEnd = new Date(sub.pause_end_date);
          if (current >= pauseStart && current <= pauseEnd) {
            isPaused = true;
          }
        }

        let shouldDeliver = false;
        if (sub.frequency === 'daily') {
          shouldDeliver = true;
        } else if (sub.frequency === 'alternate') {
          // Use date-only comparison to avoid timezone issues
          const currentDateOnly = new Date(current.getFullYear(), current.getMonth(), current.getDate());
          const startDateParts = sub.start_date.split('-').map(Number);
          const startDateOnly = new Date(startDateParts[0], startDateParts[1] - 1, startDateParts[2]);
          const daysSinceStart = Math.round((currentDateOnly.getTime() - startDateOnly.getTime()) / (1000 * 60 * 60 * 24));
          shouldDeliver = daysSinceStart % 2 === 0;
        } else if (sub.frequency === 'custom' && sub.custom_days) {
          shouldDeliver = sub.custom_days.includes(dayOfWeek);
        }

        if (shouldDeliver) {
          // For subscription-generated events (no actual order exists):
          // - Past dates: don't show (no order was generated/delivered)
          // - Today/Future: show as scheduled (order may be generated)
          // Only show future dates for subscription-generated events
          if (current < today) {
            // Skip past dates - if there was a delivery, there would be an order
            current.setDate(current.getDate() + 1);
            continue;
          }

          const status = isPaused ? 'paused' : 'scheduled';

          if (!events[dateStr]) {
            events[dateStr] = {
              date: dateStr,
              items: [],
              status: status
            };
          }
          events[dateStr].items.push({
            product: productName,
            quantity: `${sub.quantity} × ${unit}`,  // Show as "2 × 500ml"
            price: (sub.quantity || 1) * (product?.price || 0),  // Total price
          });
        }

        current.setDate(current.getDate() + 1);
      }
    }

    return Object.values(events).sort((a, b) => a.date.localeCompare(b.date));
  } catch (e) {
    console.error('Calendar error:', e);
    return [];
  }
}