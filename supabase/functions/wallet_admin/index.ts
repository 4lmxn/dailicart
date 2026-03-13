// Admin wallet operations Edge Function
// Only authenticated admin users can credit/debit wallets through this endpoint.
// Uses service_role to call credit_wallet RPC (which is blocked for client-side calls).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { checkRateLimit, rateLimitResponse, getRequestIdentifier } from '../_shared/rateLimit.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    // 1. Authenticate caller
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return errorResponse('Missing authorization header', 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return errorResponse('Invalid or expired token', 401);
    }

    // 2. Verify caller is admin
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (userError || !userData || userData.role !== 'admin') {
      return errorResponse('Admin access required', 403);
    }

    // 3. Rate limit
    const rateLimitResult = await checkRateLimit(supabase, user.id, 'wallet:admin');
    if (!rateLimitResult.allowed) {
      return rateLimitResponse(60);
    }

    // 4. Parse request
    const payload = await req.json().catch(() => null);
    if (!payload) {
      return errorResponse('Invalid JSON body');
    }

    const { action, user_id, amount, reference_type, reference_id, description, idempotency_key } = payload;

    // 5. Validate
    if (!user_id || typeof user_id !== 'string') {
      return errorResponse('Missing or invalid user_id');
    }
    if (typeof amount !== 'number' || amount <= 0) {
      return errorResponse('Amount must be a positive number');
    }
    if (!idempotency_key || typeof idempotency_key !== 'string') {
      return errorResponse('Missing or invalid idempotency_key');
    }

    // 6. Execute wallet operation
    if (action === 'credit') {
      const { data: ledgerId, error: walletError } = await supabase.rpc('credit_wallet', {
        p_user_id: user_id,
        p_amount: amount,
        p_reference_type: reference_type || 'admin_adjustment',
        p_reference_id: reference_id || null,
        p_idempotency_key: idempotency_key,
        p_description: description || 'Admin wallet credit',
        p_created_by: user.id,
      });

      if (walletError) {
        if (walletError.message?.includes('duplicate') || walletError.message?.includes('idempotency')) {
          return jsonResponse({ ok: true, message: 'Already processed (idempotency)' });
        }
        return errorResponse(`Credit failed: ${walletError.message}`, 500);
      }

      return jsonResponse({ ok: true, ledger_id: ledgerId });

    } else if (action === 'debit') {
      const { data: ledgerId, error: walletError } = await supabase.rpc('debit_wallet', {
        p_user_id: user_id,
        p_amount: amount,
        p_reference_type: reference_type || 'admin_adjustment',
        p_reference_id: reference_id || null,
        p_idempotency_key: idempotency_key,
        p_description: description || 'Admin wallet debit',
        p_created_by: user.id,
      });

      if (walletError) {
        if (walletError.message?.includes('duplicate') || walletError.message?.includes('idempotency')) {
          return jsonResponse({ ok: true, message: 'Already processed (idempotency)' });
        }
        return errorResponse(`Debit failed: ${walletError.message}`, 500);
      }

      return jsonResponse({ ok: true, ledger_id: ledgerId });

    } else {
      return errorResponse('Invalid action. Must be "credit" or "debit"', 400);
    }

  } catch (e) {
    return errorResponse(`Server error: ${e instanceof Error ? e.message : String(e)}`, 500);
  }
});
