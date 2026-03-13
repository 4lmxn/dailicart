// Supabase Edge Function: send_notifications
// Processes queued notifications and sends them via Expo Push API

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.1';
import { corsHeaders, handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface NotificationRecord {
  id: string;
  user_id: string;
  notification_type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  push_token: string;
}

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: string;
  badge?: number;
  channelId?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const CRON_SECRET = Deno.env.get('CRON_SECRET');

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return errorResponse('Missing Supabase env vars', 500);
    }

    // Auth: require either a valid service_role JWT or a CRON_SECRET header.
    // This function has verify_jwt=false so cron jobs can call it without a JWT.
    const authHeader = req.headers.get('Authorization') || '';
    const cronHeader = req.headers.get('x-cron-secret') || '';

    const hasServiceRole = authHeader.includes(SUPABASE_SERVICE_ROLE_KEY);
    const hasCronSecret = CRON_SECRET && cronHeader === CRON_SECRET;

    if (!hasServiceRole && !hasCronSecret) {
      return errorResponse('Unauthorized — provide service_role key or x-cron-secret header', 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get pending notifications with user push tokens
    const { data: notifications, error: fetchError } = await supabase
      .from('notification_queue')
      .select(`
        id,
        user_id,
        notification_type,
        title,
        body,
        data,
        users!inner(push_token)
      `)
      .eq('status', 'pending')
      .not('users.push_token', 'is', null)
      .order('created_at', { ascending: true })
      .limit(100);

    if (fetchError) {
      return errorResponse(fetchError.message, 500);
    }

    if (!notifications || notifications.length === 0) {
      return jsonResponse({ ok: true, sent: 0, message: 'No pending notifications' });
    }

    // Map to Expo push format
    const messages: ExpoPushMessage[] = notifications.map((n: any) => ({
      to: n.users.push_token,
      title: n.title,
      body: n.body,
      data: { 
        type: n.notification_type,
        ...n.data 
      },
      sound: 'default',
      channelId: getChannelId(n.notification_type),
    }));

    // Send to Expo Push API (in chunks of 100)
    const chunks = chunkArray(messages, 100);
    const results: { success: string[]; failed: { id: string; error: string }[] } = {
      success: [],
      failed: [],
    };

    for (const chunk of chunks) {
      try {
        const response = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip, deflate',
          },
          body: JSON.stringify(chunk),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Expo API error: ${response.status} - ${errorText}`);
        }

        const expoPushResponse = await response.json();
        
        // Process each ticket in the response
        for (let i = 0; i < expoPushResponse.data.length; i++) {
          const ticket = expoPushResponse.data[i];
          const notificationId = notifications[i].id;
          
          if (ticket.status === 'ok') {
            results.success.push(notificationId);
          } else {
            results.failed.push({
              id: notificationId,
              error: ticket.message || ticket.details?.error || 'Unknown error',
            });
          }
        }
      } catch (error) {
        // Mark all in this chunk as failed
        for (const msg of chunk) {
          const idx = messages.indexOf(msg);
          if (idx >= 0) {
            results.failed.push({
              id: notifications[idx].id,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }
    }

    // Update successful notifications
    if (results.success.length > 0) {
      await supabase
        .from('notification_queue')
        .update({ 
          status: 'sent',
          sent_at: new Date().toISOString(),
        })
        .in('id', results.success);
    }

    // Update failed notifications
    for (const failed of results.failed) {
      await supabase
        .from('notification_queue')
        .update({ 
          status: 'failed',
          error_message: failed.error,
        })
        .eq('id', failed.id);
    }

    return jsonResponse({
      ok: true,
      sent: results.success.length,
      failed: results.failed.length,
      details: results,
    });

  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : String(e), 500);
  }
});

function getChannelId(notificationType: string): string {
  switch (notificationType) {
    case 'delivery_arriving':
    case 'delivery_completed':
    case 'delivery_missed':
    case 'delivery_skipped':
      return 'deliveries';
    case 'low_balance':
    case 'payment_success':
    case 'payment_failed':
      return 'payments';
    case 'subscription_paused':
    case 'subscription_resumed':
    case 'order_created':
      return 'subscriptions';
    case 'support_reply':
      return 'support';
    default:
      return 'default';
  }
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
