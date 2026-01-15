// Supabase Edge Function: analytics-deliveries
// Endpoint: /analytics/deliveries/today
// Returns delivery status counts for today (admin only)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    // Validate JWT - admin only
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return errorResponse('Missing authorization header', 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return errorResponse('Invalid or expired token', 401);
    }

    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userData?.role !== 'admin') {
      return errorResponse('Admin access required', 403);
    }

    // Get today's date in ISO format
    const today = new Date().toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from('orders')
      .select('status')
      .eq('delivery_date', today);

    if (error) throw error;

    // Group order statuses into logical categories
    const pendingStatuses = ['scheduled', 'pending', 'assigned', 'in_transit'];
    const cancelledStatuses = ['cancelled', 'failed', 'missed', 'skipped'];

    let delivered = 0;
    let pending = 0;
    let cancelled = 0;

    data?.forEach((r) => {
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

    return jsonResponse(result);
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : 'Server error', 500);
  }
});
