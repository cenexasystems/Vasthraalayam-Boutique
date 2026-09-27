# VASTHRAALAYAM BOUTIQUE — Neon database (Phase 1: billing core)

This is a **separate, independent database** from Chaji Mens Wear's and Purple
Boutique's Supabase projects — no data, credentials, or schema history is
shared. See `supabase/migrations/` for the historical Supabase-based schema
these files were ported from (that folder is left untouched and still
describes the Supabase-hosted projects only).

## What's here

Phase 1 covers the billing core: products, variants, categories, coupons,
orders, order items, advance (deposit) orders, inventory movements, and the
barcode registry. Customer accounts, expenses, and store reviews are not part
of this database yet — see the migration plan for the full phase breakdown.

## Applying the migrations

Run the three files **in order** against your Neon database (the same one
whose connection string is in `DATABASE_URL`):

1. `migrations/0001_billing_core_schema.sql` — tables, indexes, sync triggers.
2. `migrations/0002_billing_core_functions.sql` — the transactional RPCs
   (`complete_pos_sale_with_inventory`, `complete_advance_order_v2`, etc.).
3. `migrations/0003_billing_core_seed.sql` — minimal seed data (the
   `Unregistered` system category and a starter `store_settings` row).

For example, with `psql`:

```
psql "$DATABASE_URL" -f neon/migrations/0001_billing_core_schema.sql
psql "$DATABASE_URL" -f neon/migrations/0002_billing_core_functions.sql
psql "$DATABASE_URL" -f neon/migrations/0003_billing_core_seed.sql
```

All three files are idempotent (`IF NOT EXISTS` / `CREATE OR REPLACE` /
`ON CONFLICT`) — safe to re-run.

## What's different from the Supabase originals

- No `auth.users` foreign keys or `auth.uid()` calls — this database has no
  built-in auth service. "Who did this" columns are plain nullable `TEXT`
  now, filled in by the API layer instead of a JWT claim.
- No Row Level Security / policies — the trust boundary is "only the API
  server holds `DATABASE_URL`", enforced by the API layer's own auth guard,
  not by RLS.
- No `storage.*` or `supabase_realtime` statements — not applicable outside
  Supabase's stack.
