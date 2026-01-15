// Supabase Edge Function: analytics-products-top
// Endpoint: /analytics/products/top?limit=5
// Returns top products by subscription quantity or order items (adjust logic). 

import 'https://deno.land/x/dotenv@v3.2.2/load.ts';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const limit = Number(url.searchParams.get('limit') || '5');
    if (!Number.isFinite(limit) || limit <= 0 || limit > 25) {
      return new Response(JSON.stringify({ error: 'Invalid limit' }), { status: 400 });
    }
    // Assumption: subscriptions(product_id, quantity) + products(id, name)
    const { data, error } = await supabase
      .from('subscriptions')
      .select('product_id, quantity, products:products ( name )')
      .eq('status', 'active');
    if (error) throw error;
    const tally: Record<string, { name: string; units: number }> = {};
    data?.forEach((r: any) => {
      const pid = r.product_id;
      const name = r.products?.name || 'Unknown';
      const units = Number(r.quantity) || 0;
      if (!tally[pid]) tally[pid] = { name, units: 0 };
      tally[pid].units += units;
    });
    const sorted = Object.values(tally).sort((a, b) => b.units - a.units).slice(0, limit);
    return new Response(JSON.stringify(sorted), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('analytics-products-top error', e);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
  }
});
