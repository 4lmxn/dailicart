// Supabase Edge Function: analytics-products-top
// Endpoint: /analytics/products/top?limit=5
// Returns top products by subscription quantity (admin only)

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
    const limit = Number(url.searchParams.get('limit') || '5');
    if (!Number.isFinite(limit) || limit <= 0 || limit > 25) {
      return errorResponse('Invalid limit parameter (1-25)');
    }

    const { data, error } = await supabase
      .from('subscriptions')
      .select('product_id, quantity, products:products ( name )')
      .eq('status', 'active');

    if (error) throw error;

    interface SubscriptionRow {
      product_id: string;
      quantity: number;
      products: { name: string } | null;
    }

    const tally: Record<string, { name: string; units: number }> = {};
    (data as SubscriptionRow[])?.forEach((r) => {
      const pid = r.product_id;
      const name = r.products?.name || 'Unknown';
      const units = Number(r.quantity) || 0;
      if (!tally[pid]) tally[pid] = { name, units: 0 };
      tally[pid].units += units;
    });

    const sorted = Object.values(tally)
      .sort((a, b) => b.units - a.units)
      .slice(0, limit);

    return jsonResponse(sorted);
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : 'Server error', 500);
  }
});
