// Shared CORS headers for all Edge Functions
// Production domain: dailicart.in

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ALLOWED_ORIGINS = [
  'https://dailicart.in',
  'https://www.dailicart.in',
  'https://app.dailicart.in',
];

// Check if we're in development mode
const isDevelopment = () => {
  const env = Deno.env.get('ENVIRONMENT') || Deno.env.get('DENO_ENV');
  return env === 'development' || env === 'local';
};

const getAllowedOrigin = (requestOrigin: string | null): string => {
  // Check environment override first
  const envOrigins = Deno.env.get('ALLOWED_ORIGINS');
  const origins = envOrigins ? envOrigins.split(',').map(o => o.trim()) : ALLOWED_ORIGINS;
  
  // If origin is provided and matches allowed list, return it
  if (requestOrigin && origins.includes(requestOrigin)) {
    return requestOrigin;
  }
  
  // Allow localhost only in development mode
  if (requestOrigin && requestOrigin.includes('localhost') && isDevelopment()) {
    return requestOrigin;
  }
  
  // SECURITY: Never return '*' in production
  // If no matching origin, return the primary allowed origin
  // This will cause CORS to fail for unauthorized origins (which is correct)
  return origins[0] || 'https://dailicart.in';
};

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // Will be overridden per-request
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// Get CORS headers with proper origin for a request
export const getCorsHeaders = (req: Request) => {
  const origin = req.headers.get('origin');
  return {
    ...corsHeaders,
    'Access-Control-Allow-Origin': getAllowedOrigin(origin),
  };
};

// Handle OPTIONS preflight requests
export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }
  return null;
}

// Wrap response with CORS headers (use getCorsHeaders for proper origin)
export function jsonResponse(data: unknown, status = 200, req?: Request): Response {
  const headers = req ? getCorsHeaders(req) : corsHeaders;
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

// Error response helper
export function errorResponse(message: string, status = 400, req?: Request): Response {
  return jsonResponse({ ok: false, error: message }, status, req);
}
