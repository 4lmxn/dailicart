// Supabase Edge Function: analytics-deliveries
// Endpoint: /analytics/deliveries/today
// Returns counts for delivery statuses for today.

import 'https://deno.land/x/dotenv@v3.2.2/load.ts';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

serve(async () => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    // Example assumption: table orders(delivery_date, status)
    const { data, error } = await supabase
      .from('orders')
      .select('status')
      .eq('delivery_date', today);
    if (error) throw error;
    
    // Group order statuses into logical categories
    // order_status enum: 'scheduled', 'pending', 'assigned', 'in_transit', 'delivered', 'skipped', 'missed', 'cancelled', 'failed'
    const pendingStatuses = ['scheduled', 'pending', 'assigned', 'in_transit'];
    const cancelledStatuses = ['cancelled', 'failed', 'missed', 'skipped'];
    
    let delivered = 0;
    let pending = 0;
    let cancelled = 0;
    
    data?.forEach((r: any) => {
      const s = r.status || 'unknown';
      if (s === 'delivered') {
        delivered++;
      } else if (pendingStatuses.includes(s)) {
        pending++;
      } else if (cancelledStatuses.includes(s)) {
        cancelled++;
      }
    });
    
    const result = [
      { status: 'Delivered', count: delivered },
      { status: 'Pending', count: pending },
      { status: 'Cancelled', count: cancelled },
    ];
    return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('analytics-deliveries error', e);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
  }
});
