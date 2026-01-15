// Supabase Edge Function: generate_orders
// Schedules or triggers idempotent order generation from subscriptions
// Runtime: Deno

import "https://deno.land/x/xhr@0.3.1/mod.ts";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.1";

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const start = url.searchParams.get("start");
    const end = url.searchParams.get("end");
    const user_id = url.searchParams.get("user_id");

    // Support JSON body overrides
    let body: any = {};
    if (req.headers.get("content-type")?.includes("application/json")) {
      try { body = await req.json(); } catch (_) {}
    }

    const p_start = body.start || start || new Date().toISOString().slice(0,10);
    const p_end = body.end || end || new Date(Date.now() + 30*24*60*60*1000).toISOString().slice(0,10);
    const p_user_id = body.user_id || user_id || null;

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: "Missing Supabase env vars" }), { status: 500, headers: { "content-type": "application/json" } });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Call SQL function
    const { data, error } = await supabase.rpc("generate_subscription_orders", {
      p_start,
      p_end,
      p_user_id,
    });

    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 400, headers: { "content-type": "application/json" } });
    }

    return new Response(JSON.stringify({ ok: true, start: p_start, end: p_end, user_id: p_user_id, result: data }), { status: 200, headers: { "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), { status: 500, headers: { "content-type": "application/json" } });
  }
});
