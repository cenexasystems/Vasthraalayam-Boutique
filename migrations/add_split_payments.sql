-- Safe, idempotent migration: Add split payments and change_given to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payments JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS change_given NUMERIC(12,2) NOT NULL DEFAULT 0;

-- Backfill old single-mode orders so reports stay correct
-- Schema note: The actual total column in orders is `total` (NUMERIC(12,2))
UPDATE public.orders
SET payments = jsonb_build_array(
  jsonb_build_object('mode', lower(COALESCE(payment_mode, payment_method, 'cash')), 'amount', total)
)
WHERE payments = '[]'::jsonb AND (payment_mode IS NOT NULL OR payment_method IS NOT NULL);
