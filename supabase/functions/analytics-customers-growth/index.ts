// Supabase Edge Function: analytics-customers-growth
// Endpoint: /analytics/customers/growth?weeks=4
// Returns weekly new customer counts (admin only)

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
    const weeks = Number(url.searchParams.get('weeks') || '4');
    if (!Number.isFinite(weeks) || weeks <= 0 || weeks > 12) {
      return errorResponse('Invalid weeks parameter (1-12)');
    }

    const now = new Date();
    const start = new Date(now.getTime() - weeks * 7 * 86400000);
    const startDate = start.toISOString();

    const { data, error } = await supabase
      .from('customers')
      .select('id, created_at')
      .gte('created_at', startDate);

    if (error) throw error;

    // Bucket by week index
    const buckets: Record<number, number> = {};
    data?.forEach((r) => {
      const created = new Date(r.created_at).getTime();
      const diffDays = (now.getTime() - created) / 86400000;
      const weekIndexFromEnd = Math.floor(diffDays / 7);
      const bucket = weeks - weekIndexFromEnd - 1;
      if (bucket >= 0 && bucket < weeks) {
        buckets[bucket] = (buckets[bucket] || 0) + 1;
      }
    });

    const result = Array.from({ length: weeks }).map((_, i) => ({
      label: `Week ${i + 1}`,
      count: buckets[i] || 0,
    }));

    return jsonResponse(result);
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : 'Server error', 500);
  }
});
