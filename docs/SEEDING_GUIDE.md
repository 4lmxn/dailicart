# Database Seeding Guide

This guide explains the purpose and execution order of the seed SQL files located in `supabase/seeds/`.

## Files & Order

1. `01_reset_schema.sql` – Creates simplified tables if they do not exist. Safe to run repeatedly (idempotent-ish). Avoid in production.
2. `03_seed_core.sql` – Inserts core reference data: products, customers, distributors.
3. `04_seed_subscriptions_orders.sql` – Generates active subscriptions and rolling 7‑day orders.
4. `05_seed_inventory_salary.sql` – Derives inventory movements and distributor earnings from delivered orders.
5. `06_seed_comprehensive_test_data.sql` – Generates 30-day order history, wallet transactions, multiple addresses, and comprehensive app flow test data.
6. `07_seed_societies_projects.sql` – Adds Sattva and Prestige societies, towers/blocks, units; maps existing customers to real units and assigns distributors.

(`02_*.sql` intentionally skipped for future use such as roles/RLS setup.)

## Execution

Run using psql or Supabase SQL Editor in the listed order:

```sql
\i supabase/seeds/01_reset_schema.sql;
\i supabase/seeds/03_seed_core.sql;
\i supabase/seeds/04_seed_subscriptions_orders.sql;
\i supabase/seeds/05_seed_inventory_salary.sql;
\i supabase/seeds/06_seed_comprehensive_test_data.sql;
\i supabase/seeds/07_seed_societies_projects.sql;
```

**For comprehensive app testing**, ensure you run all files including `06_seed_comprehensive_test_data.sql` and `07_seed_societies_projects.sql` which provide:
- 30 days of order history (delivered, cancelled, failed orders)
- Complete wallet transaction history (recharges, debits, refunds, bonuses)
- Multiple delivery addresses per customer
- Real societies/projects (Sattva, Prestige) with towers/units mapped to customers
- Various subscription frequencies and states
- Future scheduled deliveries (7 days ahead)
- Realistic payment scenarios

## Cleanup / Reset

To reset, re-run `01_reset_schema.sql` then subsequent seeds. If you need a full wipe, uncomment the DROP statements at the top of `01_reset_schema.sql`.

## Customization

- Adjust product pricing or categories in `03_seed_core.sql`.
- Change subscriptions frequency or quantity generation logic in `04_seed_subscriptions_orders.sql`.
- Modify distributor earning logic (flat 20–50) in `05_seed_inventory_salary.sql`.

## Next Steps

- Introduce RLS policies and move to reference + transactional separation.
- Materialize daily revenue & delivery stats for faster analytics.
- Add seed for test admin/user auth records if needed.
