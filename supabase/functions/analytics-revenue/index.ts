// Supabase Edge Function: analytics-revenue
// Endpoint: /analytics/revenue?days=7
// Returns daily revenue for the past N days (admin only)

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

    // Parse and validate parameters
    const url = new URL(req.url);
    const days = Number(url.searchParams.get('days') || '7');
    if (!Number.isFinite(days) || days <= 0 || days > 30) {
      return errorResponse('Invalid days parameter (1-30)');
    }

    const end = new Date();
    const start = new Date(end.getTime() - (days - 1) * 86400000);
    const startDate = start.toISOString().slice(0, 10);
    const endDate = end.toISOString().slice(0, 10);

    // Query delivered orders
    const { data: rows, error: qErr } = await supabase
      .from('orders')
      .select('delivery_date, total_amount, status')
      .gte('delivery_date', startDate)
      .lte('delivery_date', endDate)
      .eq('status', 'delivered');

    if (qErr) throw qErr;

    const map: Record<string, number> = {};
    rows?.forEach((r) => {
      map[r.delivery_date] = (map[r.delivery_date] || 0) + (r.total_amount || 0);
    });

    // Fill missing dates
    const points: { date: string; amount: number }[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(start.getTime() + i * 86400000).toISOString().slice(0, 10);
      points.push({ date: d.slice(5, 10), amount: map[d] || 0 });
    }

    return jsonResponse(points);
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : 'Server error', 500);
  }
});
