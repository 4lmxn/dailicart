// Shared CORS headers for all Edge Functions
// Set ALLOWED_ORIGINS in your Supabase Edge Function secrets
// For multiple origins: "https://app1.com,https://app2.com"

const getAllowedOrigin = (requestOrigin: string | null): string => {
  const allowedOrigins = Deno.env.get('ALLOWED_ORIGINS') || '*';
  
  // In development, allow all
  if (allowedOrigins === '*') return '*';
  
  // Check if request origin is in allowed list
  const origins = allowedOrigins.split(',').map(o => o.trim());
  if (requestOrigin && origins.includes(requestOrigin)) {
    return requestOrigin;
  }
  
  // Return first allowed origin as fallback
  return origins[0] || '*';
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
