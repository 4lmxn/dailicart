// Supabase Edge Function: generate_orders
// Triggers idempotent order generation from subscriptions
// Should be called by a cron job or admin action

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.1';
import { corsHeaders, handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getIstDateString, addDaysIst } from '../_shared/date.ts';
import { checkRateLimit, rateLimitResponse } from '../_shared/rateLimit.ts';

Deno.serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return errorResponse('Missing Supabase env vars', 500);
    }

    // Validate JWT - only admins should trigger this
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return errorResponse('Missing authorization header', 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return errorResponse('Invalid or expired token', 401);
    }

    // Check rate limit (very strict - only 2 per minute for this heavy operation)
    const rateLimitResult = await checkRateLimit(supabase, user.id, 'orders:generate');
    if (!rateLimitResult.allowed) {
      return rateLimitResponse(60);
    }

    // Check if user is admin
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userData?.role !== 'admin') {
      return errorResponse('Admin access required', 403);
    }

    // Parse parameters from URL or body
    const url = new URL(req.url);
    let body: Record<string, unknown> = {};
    if (req.headers.get('content-type')?.includes('application/json')) {
      try { body = await req.json(); } catch { /* ignore */ }
    }

    const today = getIstDateString();
    const thirtyDaysLater = addDaysIst(new Date(), 30);

    const p_start = String(body.start || url.searchParams.get('start') || today);
    const p_end = String(body.end || url.searchParams.get('end') || thirtyDaysLater);
    const p_user_id = body.user_id || url.searchParams.get('user_id') || null;

    // Call SQL function
    const { data, error } = await supabase.rpc('generate_subscription_orders', {
      p_start,
      p_end,
      p_user_id,
    });

    if (error) {
      return errorResponse(error.message);
    }

    return jsonResponse({ 
      ok: true, 
      start: p_start, 
      end: p_end, 
      user_id: p_user_id, 
      result: data 
    });

  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : String(e), 500);
  }
});
