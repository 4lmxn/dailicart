// Supabase Edge Function: analytics-customers-growth
// Endpoint: /analytics/customers/growth?weeks=4
// Returns weekly new customer counts for past N weeks.

import 'https://deno.land/x/dotenv@v3.2.2/load.ts';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!SERVICE_ROLE_KEY) throw new Error('Missing service role key');
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const weeks = Number(url.searchParams.get('weeks') || '4');
    if (!Number.isFinite(weeks) || weeks <= 0 || weeks > 12) {
      return new Response(JSON.stringify({ error: 'Invalid weeks' }), { status: 400 });
    }
    const now = new Date();
    const start = new Date(now.getTime() - weeks * 7 * 86400000);
    const startDate = start.toISOString();
    // Assumption: customers(created_at timestamp)
    const { data, error } = await supabase
      .from('customers')
      .select('id, created_at')
      .gte('created_at', startDate);
    if (error) throw error;
    // Bucket by week index
    const buckets: Record<number, number> = {};
    data?.forEach((r: any) => {
      const created = new Date(r.created_at).getTime();
      const diffDays = (now.getTime() - created) / 86400000;
      const weekIndexFromEnd = Math.floor(diffDays / 7); // 0 is current week
      const bucket = weeks - weekIndexFromEnd - 1; // left to right chronological
      if (bucket >= 0 && bucket < weeks) {
        buckets[bucket] = (buckets[bucket] || 0) + 1;
      }
    });
    const result = Array.from({ length: weeks }).map((_, i) => ({ label: `Week ${i + 1}`, count: buckets[i] || 0 }));
    return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('analytics-customers-growth error', e);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
  }
});
