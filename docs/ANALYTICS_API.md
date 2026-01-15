# Analytics API Endpoints

This document defines backend analytics endpoints implemented as Supabase Edge Functions under `supabase/functions/`.

## Endpoints Summary

| Endpoint | Function Directory | Purpose |
|----------|-------------------|---------|
| `/analytics/revenue?days=7` | `analytics-revenue` | Revenue per day for past N days (delivered orders). |
| `/analytics/deliveries/today` | `analytics-deliveries` | Delivery status counts for current day. |
| `/analytics/customers/growth?weeks=4` | `analytics-customers-growth` | Weekly new customer counts. |
| `/analytics/products/top?limit=5` | `analytics-products-top` | Top products by active subscription quantity. |

## Deployment

Deploy each function via the Supabase CLI:

```bash
supabase functions deploy analytics-revenue
supabase functions deploy analytics-deliveries
supabase functions deploy analytics-customers-growth
supabase functions deploy analytics-products-top
```

Add rewrites / API gateway mapping if you need clean paths. Example (Vercel/NGINX) mapping `/analytics/*` to Supabase functions.

## Environment Variables

All functions require:
```
SUPABASE_URL=<project-url>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```
Never expose the service role key to the mobile app.

## Mobile Integration

The mobile `AnalyticsService` hits these endpoints through `config.api.baseURL`.
Caching is handled by `analyticsStore` with a TTL of 5 minutes.

## Schema Assumptions

Adjust queries if your schema differs:
| Table | Expected Columns |
|-------|------------------|
| `orders` | `delivery_date` (date), `status` ('delivered','pending','cancelled'), `total_amount` (int) |
| `subscriptions` | `product_id`, `quantity`, `status` ('active') |
| `products` | `id`, `name` |
| `customers` | `id`, `created_at` |

## Extending

Add new analytics by creating additional edge function directories, e.g. `analytics-churn` or `analytics-retention`.

## Error Handling

Functions return `500` JSON `{"error":"Server error"}` on failures. Consider adding structured error codes later.

## Security

- Restrict invocation with JWT validation if exposing publicly.
- For now these use service role; move to a restricted role or RLS-safe RPCs when stabilizing.

## Roadmap

- Replace service role usage with signed JWT + RLS-safe views.
- Pre-aggregate daily metrics into materialized views (performance).
- Add instrumentation (timing, success/failure counters).
