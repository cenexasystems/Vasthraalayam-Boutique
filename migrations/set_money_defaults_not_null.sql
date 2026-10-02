-- Idempotent migration to ensure money columns have DEFAULT 0 and NOT NULL
-- Run safely on public.orders and public.advance_orders

DO $$
BEGIN
  -- 1. Ensure zero for any NULLs in public.orders
  UPDATE public.orders SET subtotal = 0 WHERE subtotal IS NULL;
  UPDATE public.orders SET shipping = 0 WHERE shipping IS NULL;
  UPDATE public.orders SET total = 0 WHERE total IS NULL;
  UPDATE public.orders SET delivery_charge = 0 WHERE delivery_charge IS NULL;
  UPDATE public.orders SET discount_amount = 0 WHERE discount_amount IS NULL;
  UPDATE public.orders SET manual_discount_amount = 0 WHERE manual_discount_amount IS NULL;
  UPDATE public.orders SET total_gst = 0 WHERE total_gst IS NULL;
  UPDATE public.orders SET gst_amount = 0 WHERE gst_amount IS NULL;
  UPDATE public.orders SET change_given = 0 WHERE change_given IS NULL;

  -- 2. Alter column constraints and defaults on public.orders
  ALTER TABLE public.orders ALTER COLUMN subtotal SET DEFAULT 0;
  ALTER TABLE public.orders ALTER COLUMN subtotal SET NOT NULL;

  ALTER TABLE public.orders ALTER COLUMN shipping SET DEFAULT 0;
  ALTER TABLE public.orders ALTER COLUMN shipping SET NOT NULL;

  ALTER TABLE public.orders ALTER COLUMN total SET DEFAULT 0;
  ALTER TABLE public.orders ALTER COLUMN total SET NOT NULL;

  ALTER TABLE public.orders ALTER COLUMN delivery_charge SET DEFAULT 0;
  ALTER TABLE public.orders ALTER COLUMN delivery_charge SET NOT NULL;

  ALTER TABLE public.orders ALTER COLUMN discount_amount SET DEFAULT 0;
  ALTER TABLE public.orders ALTER COLUMN discount_amount SET NOT NULL;

  ALTER TABLE public.orders ALTER COLUMN manual_discount_amount SET DEFAULT 0;
  ALTER TABLE public.orders ALTER COLUMN manual_discount_amount SET NOT NULL;

  ALTER TABLE public.orders ALTER COLUMN total_gst SET DEFAULT 0;
  ALTER TABLE public.orders ALTER COLUMN total_gst SET NOT NULL;

  ALTER TABLE public.orders ALTER COLUMN gst_amount SET DEFAULT 0;
  ALTER TABLE public.orders ALTER COLUMN gst_amount SET NOT NULL;

  ALTER TABLE public.orders ALTER COLUMN change_given SET DEFAULT 0;
  ALTER TABLE public.orders ALTER COLUMN change_given SET NOT NULL;

  -- 3. Ensure zero for any NULLs in public.advance_orders
  UPDATE public.advance_orders SET total_amount = 0 WHERE total_amount IS NULL;
  UPDATE public.advance_orders SET deposit_amount = 0 WHERE deposit_amount IS NULL;
  UPDATE public.advance_orders SET remaining_balance = 0 WHERE remaining_balance IS NULL;

  -- 4. Alter column constraints and defaults on public.advance_orders
  ALTER TABLE public.advance_orders ALTER COLUMN total_amount SET DEFAULT 0;
  ALTER TABLE public.advance_orders ALTER COLUMN total_amount SET NOT NULL;

  ALTER TABLE public.advance_orders ALTER COLUMN deposit_amount SET DEFAULT 0;
  ALTER TABLE public.advance_orders ALTER COLUMN deposit_amount SET NOT NULL;

  ALTER TABLE public.advance_orders ALTER COLUMN remaining_balance SET DEFAULT 0;
  ALTER TABLE public.advance_orders ALTER COLUMN remaining_balance SET NOT NULL;
END $$;
