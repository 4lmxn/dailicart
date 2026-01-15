// Minimal backend stub for Razorpay payment verification
// Uses Supabase Edge Functions (Deno). Replace placeholders with actual logic.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Razorpay key secret should be set in environment
const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET') || '';

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
  const computed = Array.from(new Uint8Array(sigBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  return computed === signature;
}

Deno.serve(async (req) => {
  try {
    const payload = await req.json().catch(() => null);
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, order_id } = payload || {};

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return new Response(JSON.stringify({ ok: false, error: 'Missing Razorpay fields' }), { status: 400 });
    }

    const ok = await verifySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
    if (!ok) {
      return new Response(JSON.stringify({ ok: false, error: 'Invalid signature' }), { status: 400 });
    }

    // Mark payment verified; update orders/payment table accordingly
    if (order_id) {
      await supabase
        .from('orders')
        .update({ payment_status: 'verified' })
        .eq('id', order_id);
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
  }
});
