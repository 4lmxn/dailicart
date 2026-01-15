// Supabase Edge Function: analytics-revenue
// Endpoint: /analytics/revenue?days=7
// Aggregates delivered order revenue for the past N days.
// NOTE: Adjust table/column names to match actual schema.

import 'https://deno.land/x/dotenv@v3.2.2/load.ts';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const days = Number(url.searchParams.get('days') || '7');
    if (!Number.isFinite(days) || days <= 0 || days > 30) {
      return new Response(JSON.stringify({ error: 'Invalid days' }), { status: 400 });
    }

    const end = new Date();
    const start = new Date(end.getTime() - (days - 1) * 86400000);
    const startDate = start.toISOString().slice(0, 10);
    const endDate = end.toISOString().slice(0, 10);

    // Example assumption: table orders(delivery_date date, status text, total_amount int)
    const { data, error } = await supabase.rpc('analytics_revenue_range', {
      p_start: startDate,
      p_end: endDate,
    });
    if (error) throw error;

    // Fallback if RPC not defined: perform manual query (adjust table names)
    let points: { date: string; amount: number }[] = [];
    if (Array.isArray(data) && data.length) {
      points = data.map((r: any) => ({ date: r.date, amount: r.revenue || 0 }));
    } else {
      // Manual query (replace table & columns if different)
      const { data: rows, error: qErr } = await supabase
        .from('orders')
        .select('delivery_date, total_amount, status')
        .gte('delivery_date', startDate)
        .lte('delivery_date', endDate)
        .eq('status', 'delivered');
      if (qErr) throw qErr;
      const map: Record<string, number> = {};
      rows?.forEach((r: any) => {
        map[r.delivery_date] = (map[r.delivery_date] || 0) + (r.total_amount || 0);
      });
      // Fill missing dates
      for (let i = 0; i < days; i++) {
        const d = new Date(start.getTime() + i * 86400000).toISOString().slice(0, 10);
        points.push({ date: d.slice(5, 10), amount: map[d] || 0 });
      }
    }

    return new Response(JSON.stringify(points), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('analytics-revenue error', e);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
  }
});
