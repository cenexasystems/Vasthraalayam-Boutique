-- ============================================================================
-- Migration: 20261003_0021_advance_split_payments.sql
-- Description: Enable split payments for advance order creation and completion.
-- ⚠️  NOTE: The CREATE OR REPLACE FUNCTION blocks in this file still contained
--     auth.uid() calls (Supabase-only, fails on Neon). They were superseded by
--     migration 20261003_0022_remove_auth_uid_from_advance_orders.sql which
--     dropped all overloads and recreated both functions without any auth.* refs.
--     The table/column ALTER statements below remain valid and idempotent.
-- Changes:
--   1. Drop unique constraint on advance_order_payments (allow multiple rows per phase).
--   2. Add change_given and business_id columns to advance_order_payments.
--   3. Allow 'qr' and 'split' in payment_method check constraint.
--   4. Add advance_payment_method column to advance_orders.
--   5. (Superseded) create_advance_order() — see migration 0022 for the auth-free version.
--   6. (Superseded) complete_advance_order_v2() — see migration 0022 for the auth-free version.


-- 1. Drop unique constraint to allow multiple payment rows per phase
ALTER TABLE public.advance_order_payments
  DROP CONSTRAINT IF EXISTS advance_order_payments_advance_order_id_payment_type_key;

-- 2. Add change_given and business_id columns to advance_order_payments
ALTER TABLE public.advance_order_payments
  ADD COLUMN IF NOT EXISTS change_given NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.advance_order_payments
  ADD COLUMN IF NOT EXISTS business_id TEXT NOT NULL DEFAULT '1';

-- 3. Update payment_method check constraint to allow 'qr' (alias for UPI) and 'split'
ALTER TABLE public.advance_order_payments
  DROP CONSTRAINT IF EXISTS advance_order_payments_payment_method_check;

ALTER TABLE public.advance_order_payments
  ADD CONSTRAINT advance_order_payments_payment_method_check
  CHECK (payment_method IN ('cash', 'upi', 'qr', 'card', 'split'));

-- 4. Add advance_payment_method column to advance_orders
ALTER TABLE public.advance_orders
  ADD COLUMN IF NOT EXISTS advance_payment_method TEXT DEFAULT 'cash';

-- 5. Backfill advance_payment_method from existing deposit records
UPDATE public.advance_orders ao
SET advance_payment_method = COALESCE(
  (
    SELECT CASE WHEN aop.payment_method = 'upi' THEN 'qr' ELSE aop.payment_method END
    FROM public.advance_order_payments aop
    WHERE aop.advance_order_id = ao.id AND aop.payment_type = 'deposit'
    LIMIT 1
  ),
  'cash'
)
WHERE ao.advance_payment_method IS NULL OR ao.advance_payment_method = 'cash';

-- 6. Drop old create_advance_order signatures before replacing
DROP FUNCTION IF EXISTS public.create_advance_order(text,text,text,text,text,text,numeric,numeric,date,text,text,text);
DROP FUNCTION IF EXISTS public.create_advance_order(text,text,text,text,text,text,numeric,numeric,date,text,text,text,jsonb);

-- 7. New create_advance_order with split payment support
CREATE OR REPLACE FUNCTION public.create_advance_order(
  p_customer_name TEXT,
  p_phone TEXT,
  p_address TEXT,
  p_product_name TEXT,
  p_category TEXT,
  p_description TEXT,
  p_total_amount NUMERIC,
  p_deposit_amount NUMERIC,
  p_expected_delivery_date DATE,
  p_remarks TEXT,
  p_payment_method TEXT,
  p_created_by_name TEXT,
  p_products JSONB DEFAULT '[]'::JSONB,
  p_created_by TEXT DEFAULT NULL,
  p_payments JSONB DEFAULT NULL,
  p_business_id TEXT DEFAULT '1'
)
RETURNS public.advance_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.advance_orders;
  v_now TIMESTAMPTZ := NOW();
  v_deposit_id TEXT;
  v_item JSONB;
  v_pay_mode TEXT;
  v_pay_amt NUMERIC;
  v_total_deposit NUMERIC := 0;
  v_method_count INT := 0;
  v_primary_mode TEXT := NULL;
  v_adv_mode TEXT := 'cash';
BEGIN
  IF TRIM(COALESCE(p_customer_name, '')) = '' THEN RAISE EXCEPTION 'Customer name is required'; END IF;
  IF TRIM(COALESCE(p_phone, '')) = '' THEN RAISE EXCEPTION 'Phone number is required'; END IF;
  IF TRIM(COALESCE(p_product_name, '')) = '' THEN RAISE EXCEPTION 'Product name is required'; END IF;
  IF COALESCE(p_total_amount, 0) <= 0 THEN RAISE EXCEPTION 'Total amount must be greater than zero'; END IF;

  -- Process payments array if provided (split payment path)
  IF p_payments IS NOT NULL AND jsonb_typeof(p_payments) = 'array' AND jsonb_array_length(p_payments) > 0 THEN
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_payments) LOOP
      v_pay_amt := ROUND(COALESCE((v_item->>'amount')::NUMERIC, 0), 2);
      v_pay_mode := LOWER(TRIM(COALESCE(v_item->>'mode', '')));
      IF v_pay_mode = 'upi' THEN v_pay_mode := 'qr'; END IF;

      IF v_pay_amt > 0 THEN
        IF v_pay_mode NOT IN ('cash', 'qr', 'card') THEN
          RAISE EXCEPTION 'Invalid payment mode in deposit breakdown: %', v_pay_mode;
        END IF;
        v_total_deposit := v_total_deposit + v_pay_amt;
        v_method_count := v_method_count + 1;
        IF v_primary_mode IS NULL THEN v_primary_mode := v_pay_mode; END IF;
      END IF;
    END LOOP;

    IF v_total_deposit <= 0 THEN
      RAISE EXCEPTION 'Deposit must be greater than zero';
    END IF;
    IF v_total_deposit > p_total_amount THEN
      RAISE EXCEPTION 'Deposit amount cannot exceed the order total';
    END IF;

    v_adv_mode := CASE WHEN v_method_count > 1 THEN 'split' ELSE COALESCE(v_primary_mode, 'cash') END;
  ELSE
    -- Single payment fallback
    v_total_deposit := ROUND(COALESCE(p_deposit_amount, 0), 2);
    IF v_total_deposit <= 0 OR v_total_deposit > p_total_amount THEN
      RAISE EXCEPTION 'Deposit must be greater than zero and less than or equal to total amount';
    END IF;
    v_adv_mode := LOWER(TRIM(COALESCE(p_payment_method, 'cash')));
    IF v_adv_mode = 'upi' THEN v_adv_mode := 'qr'; END IF;
    IF v_adv_mode NOT IN ('cash', 'qr', 'card') THEN
      RAISE EXCEPTION 'Select a valid deposit payment method';
    END IF;
  END IF;

  v_deposit_id := 'DEP-' || TO_CHAR(v_now AT TIME ZONE 'Asia/Kolkata', 'YYYYMMDD') || '-' || LPAD(NEXTVAL('public.deposit_number_seq')::TEXT, 4, '0');

  INSERT INTO public.advance_orders(
    deposit_id, customer_name, phone, address, product_name, products,
    category, description, total_amount, deposit_amount, expected_delivery_date,
    remarks, created_by, created_by_name, created_at, updated_at,
    advance_payment_method, business_id
  )
  VALUES (
    v_deposit_id, TRIM(p_customer_name), TRIM(p_phone), TRIM(COALESCE(p_address, '')),
    TRIM(p_product_name),
    CASE WHEN jsonb_typeof(COALESCE(p_products, '[]'::JSONB)) = 'array' THEN COALESCE(p_products, '[]'::JSONB) ELSE '[]'::JSONB END,
    TRIM(COALESCE(p_category, '')), TRIM(COALESCE(p_description, '')),
    ROUND(p_total_amount, 2), v_total_deposit, p_expected_delivery_date,
    TRIM(COALESCE(p_remarks, '')), auth.uid(), TRIM(COALESCE(p_created_by_name, '')),
    v_now, v_now, v_adv_mode, COALESCE(p_business_id, '1')
  )
  RETURNING * INTO v_order;

  -- Insert payment rows (split or single)
  IF p_payments IS NOT NULL AND jsonb_typeof(p_payments) = 'array' AND jsonb_array_length(p_payments) > 0 THEN
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_payments) LOOP
      v_pay_amt := ROUND(COALESCE((v_item->>'amount')::NUMERIC, 0), 2);
      v_pay_mode := LOWER(TRIM(COALESCE(v_item->>'mode', '')));
      IF v_pay_mode = 'upi' THEN v_pay_mode := 'qr'; END IF;

      IF v_pay_amt > 0 THEN
        INSERT INTO public.advance_order_payments(
          advance_order_id, payment_type, amount, payment_method, remarks,
          received_by, received_at, change_given, business_id
        )
        VALUES (
          v_order.id, 'deposit', v_pay_amt, v_pay_mode,
          COALESCE(v_item->>'notes', p_remarks, ''),
          auth.uid(), v_now, 0, COALESCE(p_business_id, '1')
        );
      END IF;
    END LOOP;
  ELSE
    INSERT INTO public.advance_order_payments(
      advance_order_id, payment_type, amount, payment_method, remarks,
      received_by, received_at, change_given, business_id
    )
    VALUES (
      v_order.id, 'deposit', v_total_deposit, v_adv_mode,
      COALESCE(p_remarks, ''), auth.uid(), v_now, 0, COALESCE(p_business_id, '1')
    );
  END IF;

  INSERT INTO public.advance_order_timeline(advance_order_id, event_type, label, created_by, created_at)
  VALUES
    (v_order.id, 'created', 'Created', auth.uid(), v_now),
    (v_order.id, 'deposit_received', 'Deposit Received (' || UPPER(v_adv_mode) || ')', auth.uid(), v_now);

  RETURN v_order;
END;
$$;

-- 8. Drop old complete_advance_order_v2 signature and replace with split payment version
DROP FUNCTION IF EXISTS public.complete_advance_order_v2(uuid,text,numeric,text,numeric,numeric,text);

CREATE OR REPLACE FUNCTION public.complete_advance_order_v2(
  p_order_id UUID,
  p_payment_method TEXT,
  p_final_amount NUMERIC,
  p_coupon_code TEXT DEFAULT NULL,
  p_coupon_percentage NUMERIC DEFAULT 0,
  p_manual_discount NUMERIC DEFAULT 0,
  p_remarks TEXT DEFAULT '',
  p_created_by TEXT DEFAULT NULL,
  p_payments JSONB DEFAULT NULL,
  p_change_given NUMERIC DEFAULT 0
)
RETURNS TABLE(order_id UUID, invoice_no TEXT, completed_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_advance public.advance_orders;
  v_order_id UUID;
  v_invoice TEXT;
  v_now TIMESTAMPTZ := NOW();
  v_items JSONB;
  v_item JSONB;
  v_clean_coupon TEXT;
  v_total_discount NUMERIC := 0;
  v_item_type TEXT;
  v_product_id BIGINT;
  v_name TEXT;
  v_category TEXT;
  v_pay_item JSONB;
  v_pay_mode TEXT;
  v_pay_amt NUMERIC;
  v_total_balance_paid NUMERIC := 0;
  v_balance_method_count INT := 0;
  v_primary_balance_mode TEXT := NULL;
  v_final_mode TEXT := 'cash';
  v_all_payments JSONB := '[]'::JSONB;
  v_all_modes_set TEXT[];
BEGIN
  SELECT * INTO v_advance FROM public.advance_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Advance order % not found', p_order_id;
  END IF;

  IF v_advance.status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot complete a cancelled advance order';
  END IF;

  -- Self-heal: if invoice already exists, return it
  IF v_advance.completed_order_id IS NOT NULL OR v_advance.invoice_number IS NOT NULL THEN
    IF v_advance.status != 'completed' THEN
      UPDATE public.advance_orders
      SET status = 'completed', updated_at = v_now
      WHERE id = p_order_id;
    END IF;
    RETURN QUERY SELECT
      COALESCE(v_advance.completed_order_id, gen_random_uuid()),
      COALESCE(v_advance.invoice_number, 'INV00000000'),
      COALESCE(v_advance.completed_at, v_now);
    RETURN;
  END IF;

  -- Validate and calculate remaining balance payments
  IF p_payments IS NOT NULL AND jsonb_typeof(p_payments) = 'array' AND jsonb_array_length(p_payments) > 0 THEN
    FOR v_pay_item IN SELECT value FROM jsonb_array_elements(p_payments) LOOP
      v_pay_amt := ROUND(COALESCE((v_pay_item->>'amount')::NUMERIC, 0), 2);
      v_pay_mode := LOWER(TRIM(COALESCE(v_pay_item->>'mode', '')));
      IF v_pay_mode = 'upi' THEN v_pay_mode := 'qr'; END IF;

      IF v_pay_amt > 0 THEN
        IF v_pay_mode NOT IN ('cash', 'qr', 'card') THEN
          RAISE EXCEPTION 'Invalid payment mode in balance breakdown: %', v_pay_mode;
        END IF;
        v_total_balance_paid := v_total_balance_paid + v_pay_amt;
        v_balance_method_count := v_balance_method_count + 1;
        IF v_primary_balance_mode IS NULL THEN v_primary_balance_mode := v_pay_mode; END IF;
      END IF;
    END LOOP;

    v_final_mode := CASE WHEN v_balance_method_count > 1 THEN 'split' ELSE COALESCE(v_primary_balance_mode, 'cash') END;
  ELSE
    v_total_balance_paid := ROUND(COALESCE(p_final_amount, 0), 2);
    v_final_mode := LOWER(TRIM(COALESCE(p_payment_method, 'cash')));
    IF v_final_mode = 'upi' THEN v_final_mode := 'qr'; END IF;
    IF v_final_mode NOT IN ('cash', 'qr', 'card') THEN
      RAISE EXCEPTION 'Select a valid payment method';
    END IF;
  END IF;

  -- Insert remaining payment rows
  IF p_payments IS NOT NULL AND jsonb_typeof(p_payments) = 'array' AND jsonb_array_length(p_payments) > 0 THEN
    FOR v_pay_item IN SELECT value FROM jsonb_array_elements(p_payments) LOOP
      v_pay_amt := ROUND(COALESCE((v_pay_item->>'amount')::NUMERIC, 0), 2);
      v_pay_mode := LOWER(TRIM(COALESCE(v_pay_item->>'mode', '')));
      IF v_pay_mode = 'upi' THEN v_pay_mode := 'qr'; END IF;

      IF v_pay_amt > 0 THEN
        INSERT INTO public.advance_order_payments(
          advance_order_id, payment_type, amount, payment_method, remarks,
          received_by, received_at, change_given, business_id
        )
        VALUES (
          p_order_id, 'remaining', v_pay_amt, v_pay_mode,
          COALESCE(v_pay_item->>'notes', p_remarks, ''),
          auth.uid(), v_now,
          CASE WHEN v_pay_mode = 'cash' THEN COALESCE(p_change_given, 0) ELSE 0 END,
          COALESCE(v_advance.business_id, '1')
        );
      END IF;
    END LOOP;
  ELSE
    INSERT INTO public.advance_order_payments(
      advance_order_id, payment_type, amount, payment_method, remarks,
      received_by, received_at, change_given, business_id
    )
    VALUES (
      p_order_id, 'remaining', v_total_balance_paid, v_final_mode,
      COALESCE(p_remarks, ''), auth.uid(), v_now,
      CASE WHEN v_final_mode = 'cash' THEN COALESCE(p_change_given, 0) ELSE 0 END,
      COALESCE(v_advance.business_id, '1')
    );
  END IF;

  -- Build aggregated payments from all advance_order_payments
  SELECT jsonb_agg(
    jsonb_build_object(
      'mode', CASE WHEN aop.payment_method = 'upi' THEN 'qr' ELSE aop.payment_method END,
      'amount', aop.amount,
      'phase', aop.payment_type,
      'paid_at', aop.received_at,
      'notes', COALESCE(aop.remarks, '')
    ) ORDER BY aop.received_at ASC
  )
  INTO v_all_payments
  FROM public.advance_order_payments aop
  WHERE aop.advance_order_id = p_order_id;

  SELECT ARRAY_AGG(DISTINCT (value->>'mode'))
  INTO v_all_modes_set
  FROM jsonb_array_elements(COALESCE(v_all_payments, '[]'::JSONB));

  v_clean_coupon := NULLIF(TRIM(COALESCE(p_coupon_code, '')), '');
  v_total_discount := ROUND(COALESCE(p_manual_discount, 0), 2);

  -- Generate invoice number
  v_invoice := LPAD(nextval('public.invoice_number_seq')::TEXT, 8, '0');
  v_order_id := gen_random_uuid();

  -- Build items JSONB
  v_items := CASE
    WHEN jsonb_typeof(v_advance.products) = 'array' AND jsonb_array_length(v_advance.products) > 0
    THEN v_advance.products
    ELSE jsonb_build_array(
      jsonb_build_object(
        'product_id',  NULL,
        'name',        COALESCE(NULLIF(TRIM(v_advance.product_name), ''), 'Advance Order Item'),
        'category',    COALESCE(NULLIF(TRIM(v_advance.category), ''), 'Custom Orders'),
        'quantity',    1,
        'unit',        'piece',
        'unit_type',   'unit',
        'base_price',  v_advance.total_amount,
        'line_total',  v_advance.total_amount,
        'description', COALESCE(v_advance.description, ''),
        'source',      'advance_order'
      )
    )
  END;

  INSERT INTO public.orders (
    id, invoice_no, customer_name, phone, address, user_id,
    items, subtotal, total, status, order_mode, order_type,
    shipping, delivery_charge, discount_amount, manual_discount_amount,
    coupon_code, coupon_percentage, manual_discount_type, manual_discount_value,
    payment_mode, payment_method, payments, change_given, business_id,
    created_at, updated_at
  ) VALUES (
    v_order_id, v_invoice,
    v_advance.customer_name, v_advance.phone, v_advance.address, auth.uid(),
    v_items, v_advance.total_amount, GREATEST(0, v_advance.total_amount - v_total_discount),
    'completed', 'offline', 'advance_order',
    0, 0, v_total_discount, p_manual_discount,
    v_clean_coupon, p_coupon_percentage, 'flat', p_manual_discount,
    CASE WHEN ARRAY_LENGTH(v_all_modes_set, 1) > 1 THEN 'split' ELSE COALESCE(v_all_modes_set[1], v_final_mode) END,
    CASE WHEN ARRAY_LENGTH(v_all_modes_set, 1) > 1 THEN 'split' ELSE COALESCE(v_all_modes_set[1], v_final_mode) END,
    COALESCE(v_all_payments, '[]'::JSONB),
    COALESCE(p_change_given, 0),
    COALESCE(v_advance.business_id, '1'),
    v_now, v_now
  );

  IF v_clean_coupon IS NOT NULL THEN
    UPDATE public.coupons
    SET usage_count = usage_count + 1, updated_at = NOW()
    WHERE LOWER(TRIM(code)) = LOWER(v_clean_coupon);
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_items) LOOP
    v_product_id := NULLIF(v_item->>'product_id', '')::BIGINT;
    v_name := COALESCE(NULLIF(TRIM(v_item->>'name'), ''), 'Product');
    v_category := COALESCE(NULLIF(TRIM(v_item->>'category'), ''), NULLIF(TRIM(v_advance.category), ''), 'Uncategorized');

    v_item_type := LOWER(TRIM(COALESCE(v_item->>'item_type', '')));
    IF v_item_type NOT IN ('product', 'service') THEN
      IF v_product_id IS NOT NULL THEN
        SELECT item_type INTO v_item_type FROM public.products WHERE id = v_product_id;
      END IF;
      IF v_item_type IS NULL OR v_item_type NOT IN ('product', 'service') THEN
        SELECT item_type INTO v_item_type FROM public.products WHERE LOWER(TRIM(name)) = LOWER(TRIM(v_name)) LIMIT 1;
      END IF;
      IF v_item_type IS NULL OR v_item_type NOT IN ('product', 'service') THEN
        v_item_type := 'product';
      END IF;
    END IF;

    INSERT INTO public.order_items (
      order_id, product_id, product_name, name, category, quantity, unit, unit_type,
      base_price, line_total, is_manual, source, item_type
    ) VALUES (
      v_order_id, v_product_id, v_name, v_name, v_category,
      GREATEST(COALESCE((v_item->>'quantity')::NUMERIC, 1), 0),
      COALESCE(NULLIF(v_item->>'unit', ''), 'piece'),
      COALESCE(NULLIF(v_item->>'unit_type', ''), 'unit'),
      GREATEST(COALESCE((v_item->>'base_price')::NUMERIC, 0), 0),
      GREATEST(COALESCE((v_item->>'line_total')::NUMERIC, 0), 0),
      FALSE, 'advance_order', v_item_type
    );
  END LOOP;

  UPDATE public.advance_orders SET
    status               = 'completed',
    completed_at         = v_now,
    completed_order_id   = v_order_id,
    invoice_number       = v_invoice,
    final_payment_method = v_final_mode,
    remarks              = CASE WHEN TRIM(COALESCE(p_remarks, '')) = '' THEN remarks ELSE p_remarks END,
    updated_at           = v_now
  WHERE id = p_order_id;

  INSERT INTO public.advance_order_timeline (
    advance_order_id, event_type, label, remarks, created_by, created_at
  ) VALUES
    (p_order_id, 'remaining_payment_received', 'Remaining Payment Received (' || UPPER(v_final_mode) || ')', COALESCE(p_remarks, ''), auth.uid(), v_now),
    (p_order_id, 'invoice_generated',          'Invoice Generated',          v_invoice,               auth.uid(), v_now);

  RETURN QUERY SELECT v_order_id, v_invoice, v_now;
END;
$$;

-- 9. Grant permissions for new function signatures (Neon uses public role only)
GRANT EXECUTE ON FUNCTION public.create_advance_order(text,text,text,text,text,text,numeric,numeric,date,text,text,text,jsonb,text,jsonb,text) TO public;
GRANT EXECUTE ON FUNCTION public.complete_advance_order_v2(uuid,text,numeric,text,numeric,numeric,text,text,jsonb,numeric) TO public;

-- 10. Backfill payments JSONB in orders linked to completed advance orders
UPDATE public.orders o
SET payments = sub.payments_agg,
    payment_mode = CASE WHEN jsonb_array_length(sub.payments_agg) > 1 THEN 'split' ELSE (sub.payments_agg->0->>'mode') END,
    payment_method = CASE WHEN jsonb_array_length(sub.payments_agg) > 1 THEN 'split' ELSE (sub.payments_agg->0->>'mode') END
FROM (
  SELECT
    ao.completed_order_id,
    jsonb_agg(
      jsonb_build_object(
        'mode', CASE WHEN aop.payment_method = 'upi' THEN 'qr' ELSE aop.payment_method END,
        'amount', aop.amount,
        'phase', aop.payment_type,
        'paid_at', aop.received_at,
        'notes', COALESCE(aop.remarks, '')
      ) ORDER BY aop.received_at ASC
    ) AS payments_agg
  FROM public.advance_orders ao
  JOIN public.advance_order_payments aop ON aop.advance_order_id = ao.id
  WHERE ao.completed_order_id IS NOT NULL
  GROUP BY ao.completed_order_id
) sub
WHERE o.id = sub.completed_order_id AND (o.payments IS NULL OR o.payments = '[]'::jsonb);

NOTIFY pgrst, 'reload schema';
