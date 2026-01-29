// Razorpay payment verification Edge Function
// Verifies payment signature and credits wallet

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { checkRateLimit, rateLimitResponse, getRequestIdentifier } from '../_shared/rateLimit.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET') || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function verifySignature(orderId: string, paymentId: string, signature: string): Promise<boolean> {
  if (!RAZORPAY_KEY_SECRET) return false;
  const data = `${orderId}|${paymentId}`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(RAZORPAY_KEY_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  const computed = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return computed === signature;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  // Only allow POST
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    // Validate JWT - user must be authenticated
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return errorResponse('Missing authorization header', 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return errorResponse('Invalid or expired token', 401);
    }

    // Check rate limit for this user
    const rateLimitResult = await checkRateLimit(supabase, user.id, 'payment:verify');
    if (!rateLimitResult.allowed) {
      return rateLimitResponse(60);
    }

    // Parse and validate request body
    const payload = await req.json().catch(() => null);
    if (!payload) {
      return errorResponse('Invalid JSON body');
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount, idempotency_key } = payload;

    // Validate required fields
    if (!razorpay_order_id || typeof razorpay_order_id !== 'string') {
      return errorResponse('Missing or invalid razorpay_order_id');
    }
    if (!razorpay_payment_id || typeof razorpay_payment_id !== 'string') {
      return errorResponse('Missing or invalid razorpay_payment_id');
    }
    if (!razorpay_signature || typeof razorpay_signature !== 'string') {
      return errorResponse('Missing or invalid razorpay_signature');
    }
    if (typeof amount !== 'number' || amount <= 0) {
      return errorResponse('Missing or invalid amount');
    }

    // Verify Razorpay signature
    const isValid = await verifySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
    if (!isValid) {
      return errorResponse('Invalid payment signature', 400);
    }

    // Credit wallet using the secure RPC function
    const { data: ledgerId, error: walletError } = await supabase.rpc('credit_wallet', {
      p_user_id: user.id,
      p_amount: amount,
      p_reference_type: 'razorpay_topup',
      p_reference_id: null,
      p_idempotency_key: idempotency_key || `razorpay-${razorpay_payment_id}`,
      p_description: `Wallet top-up via Razorpay (${razorpay_payment_id})`,
    });

    if (walletError) {
      // Check if it's a duplicate (idempotency)
      if (walletError.message?.includes('duplicate')) {
        return jsonResponse({ ok: true, message: 'Payment already processed' });
      }
      return errorResponse(`Wallet credit failed: ${walletError.message}`, 500);
    }

    return jsonResponse({ 
      ok: true, 
      ledger_id: ledgerId,
      message: 'Payment verified and wallet credited' 
    });

  } catch (e) {
    return errorResponse(`Server error: ${e instanceof Error ? e.message : String(e)}`, 500);
  }
});
