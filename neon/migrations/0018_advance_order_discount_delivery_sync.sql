-- ============================================================================
-- Migration: 0018_advance_order_discount_delivery_sync.sql
-- Description: Preserve manual discount, coupon discount, delivery charge,
--              and shipping across advance order creation, balance completion,
--              and final invoices.
-- ============================================================================

-- 1. Ensure advance_orders table has delivery and discount type columns
ALTER TABLE public.advance_orders
  ADD COLUMN IF NOT EXISTS delivery_charge NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manual_discount_type TEXT NOT NULL DEFAULT 'flat',
  ADD COLUMN IF NOT EXISTS manual_discount_value NUMERIC(12,2) NOT NULL DEFAULT 0;

-- 2. Backfill existing completed advance orders into public.orders where discounts or delivery were missing
UPDATE public.orders o
SET
  discount_amount = COALESCE(ao.discount_amount, 0),
  manual_discount_amount = COALESCE(ao.manual_discount_amount, 0),
  manual_discount_type = COALESCE(ao.manual_discount_type, o.manual_discount_type, 'flat'),
  manual_discount_value = CASE 
    WHEN COALESCE(ao.manual_discount_value, 0) > 0 THEN ao.manual_discount_value 
    ELSE COALESCE(ao.manual_discount_amount, o.manual_discount_value, 0) 
  END,
  coupon_code = COALESCE(ao.coupon_code, o.coupon_code),
  coupon_percentage = COALESCE(ao.coupon_percentage, o.coupon_percentage, 0),
  delivery_charge = GREATEST(COALESCE(o.delivery_charge, 0), COALESCE(ao.delivery_charge, 0)),
  shipping = GREATEST(COALESCE(o.shipping, 0), COALESCE(ao.shipping, 0))
FROM public.advance_orders ao
WHERE ao.completed_order_id = o.id
  AND (
    (COALESCE(o.manual_discount_amount, 0) = 0 AND COALESCE(ao.manual_discount_amount, 0) > 0)
    OR (COALESCE(o.discount_amount, 0) = 0 AND COALESCE(ao.discount_amount, 0) > 0)
    OR (COALESCE(o.delivery_charge, 0) = 0 AND COALESCE(ao.delivery_charge, 0) > 0)
  );

-- 3. Update complete_advance_order_v2 to faithfully carry forward manual discounts, coupon discounts, and delivery charges
CREATE OR REPLACE FUNCTION public.complete_advance_order_v2(
  p_order_id UUID,
  p_payment_method TEXT,
  p_final_amount NUMERIC,
  p_coupon_code TEXT DEFAULT NULL::TEXT,
  p_coupon_percentage NUMERIC DEFAULT 0,
  p_manual_discount NUMERIC DEFAULT 0,
  p_remarks TEXT DEFAULT ''::TEXT,
  p_created_by TEXT DEFAULT NULL::TEXT,
  p_payments JSONB DEFAULT NULL::JSONB,
  p_change_given NUMERIC DEFAULT 0,
  p_total_gst NUMERIC DEFAULT 0,
  p_gst_rate NUMERIC DEFAULT 0,
  p_gst_enabled BOOLEAN DEFAULT FALSE
)
RETURNS TABLE(order_id UUID, invoice_no TEXT, completed_at TIMESTAMPTZ)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_advance              public.advance_orders;
  v_order_id             UUID;
  v_invoice              TEXT;
  v_now                  TIMESTAMPTZ := NOW();
  v_items                JSONB;
  v_item                 JSONB;
  v_clean_coupon         TEXT;
  v_coupon_pct           NUMERIC := 0;
  v_coupon_disc          NUMERIC := 0;
  v_manual_disc          NUMERIC := 0;
  v_total_discount       NUMERIC := 0;
  v_subtotal             NUMERIC := 0;
  v_delivery             NUMERIC := 0;
  v_order_total          NUMERIC := 0;
  v_effective_gst        NUMERIC := 0;
  v_effective_rate       NUMERIC := 0;
  v_pay_item             JSONB;
  v_pay_mode             TEXT;
  v_pay_amt              NUMERIC;
  v_total_balance_paid   NUMERIC := 0;
  v_balance_method_count INT     := 0;
  v_primary_balance_mode TEXT    := NULL;
  v_final_mode           TEXT    := 'cash';
  v_all_payments         JSONB   := '[]'::JSONB;
  v_all_modes_set        TEXT[];
  v_product_id           BIGINT;
  v_variant_id           UUID;
  v_variant_name         TEXT;
  v_quantity             NUMERIC;
  v_current_stock        NUMERIC;
  v_product_name         TEXT;
  v_is_manual            BOOLEAN;
  v_name                 TEXT;
  v_category             TEXT;
  v_item_type            TEXT;
BEGIN
  -- ── 1. Lock & fetch ─────────────────────────────────────────────────────────
  SELECT * INTO v_advance FROM public.advance_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Advance order % not found', p_order_id; END IF;
  IF v_advance.status = 'cancelled' THEN RAISE EXCEPTION 'Cannot complete a cancelled advance order'; END IF;

  -- ── 2. Idempotency protection ──────────────────────────────────────────────
  IF v_advance.completed_order_id IS NOT NULL OR v_advance.invoice_number IS NOT NULL THEN
    IF v_advance.status != 'completed' THEN
      UPDATE public.advance_orders SET status = 'completed', updated_at = v_now WHERE id = p_order_id;
    END IF;
    RETURN QUERY SELECT
      COALESCE(v_advance.completed_order_id, gen_random_uuid()),
      COALESCE(v_advance.invoice_number, 'INV00000000'),
      COALESCE(v_advance.completed_at, v_now);
    RETURN;
  END IF;

  IF v_advance.status = 'completed' THEN RAISE EXCEPTION 'Advance order % is already completed', p_order_id; END IF;

  -- ── 3. Build items snapshot ────────────────────────────────────────────────
  v_items := CASE
    WHEN jsonb_typeof(v_advance.products) = 'array' AND jsonb_array_length(v_advance.products) > 0
    THEN v_advance.products
    ELSE jsonb_build_array(
      jsonb_build_object(
        'product_id',  NULL,
        'name',        COALESCE(NULLIF(TRIM(v_advance.product_name), ''), 'Advance Order Item'),
        'category',    COALESCE(NULLIF(TRIM(v_advance.category), ''), 'Custom Orders'),
        'quantity',    1, 'unit', 'piece', 'unit_type', 'unit',
        'base_price',  v_advance.total_amount, 'line_total', v_advance.total_amount,
        'description', COALESCE(v_advance.description, ''),
        'source',      'advance_order', 'item_type', 'product'
      )
    )
  END;

  -- ── 4. Pre-validate stock before any mutation ──────────────────────────────
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_items) LOOP
    v_product_id   := NULLIF(v_item ->> 'product_id', '')::BIGINT;
    v_variant_id   := NULLIF(v_item ->> 'variant_id', '')::UUID;
    v_quantity     := GREATEST(COALESCE((v_item ->> 'quantity')::NUMERIC, 1), 0);
    v_is_manual    := COALESCE((v_item ->> 'is_manual')::BOOLEAN, FALSE);
    v_name         := COALESCE(v_item ->> 'product_name', v_item ->> 'name', 'Product');

    IF v_product_id IS NULL AND v_variant_id IS NULL AND NOT v_is_manual THEN
      SELECT id, item_type INTO v_product_id, v_item_type
      FROM public.products
      WHERE LOWER(TRIM(name)) = LOWER(TRIM(v_name))
      LIMIT 1;
    END IF;

    v_item_type := LOWER(TRIM(COALESCE(v_item_type, v_item ->> 'item_type', '')));
    IF v_item_type NOT IN ('product', 'service') THEN
      IF v_product_id IS NOT NULL THEN SELECT item_type INTO v_item_type FROM public.products WHERE id = v_product_id; END IF;
      IF v_item_type IS NULL OR v_item_type NOT IN ('product', 'service') THEN v_item_type := 'product'; END IF;
    END IF;

    IF NOT v_is_manual AND v_quantity > 0 AND v_item_type <> 'service' THEN
      IF v_variant_id IS NOT NULL THEN
        SELECT stock INTO v_current_stock FROM public.product_variants WHERE id = v_variant_id FOR UPDATE;
        IF v_current_stock IS NULL OR v_current_stock < v_quantity THEN
          RAISE EXCEPTION 'Insufficient stock for % (Available: %, Requested: %)', v_name, COALESCE(v_current_stock, 0), v_quantity;
        END IF;
      ELSIF v_product_id IS NOT NULL THEN
        SELECT stock_quantity INTO v_current_stock FROM public.products WHERE id = v_product_id FOR UPDATE;
        IF v_current_stock IS NULL OR v_current_stock < v_quantity THEN
          RAISE EXCEPTION 'Insufficient stock for % (Available: %, Requested: %)', v_name, COALESCE(v_current_stock, 0), v_quantity;
        END IF;
      END IF;
    END IF;
  END LOOP;

  -- ── 5. Process balance payments ────────────────────────────────────────────
  IF p_payments IS NOT NULL AND jsonb_typeof(p_payments) = 'array' AND jsonb_array_length(p_payments) > 0 THEN
    FOR v_pay_item IN SELECT value FROM jsonb_array_elements(p_payments) LOOP
      v_pay_amt := ROUND(COALESCE((v_pay_item->>'amount')::NUMERIC, 0), 2);
      v_pay_mode := LOWER(TRIM(COALESCE(v_pay_item->>'mode', '')));
      IF v_pay_mode = 'upi' THEN v_pay_mode := 'qr'; END IF;

      IF v_pay_amt > 0 THEN
        IF v_pay_mode NOT IN ('cash', 'qr', 'card') THEN RAISE EXCEPTION 'Invalid payment mode: %', v_pay_mode; END IF;
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
  END IF;

  -- ── 6. Insert remaining payments into advance_order_payments ───────────────
  IF p_payments IS NOT NULL AND jsonb_typeof(p_payments) = 'array' AND jsonb_array_length(p_payments) > 0 THEN
    FOR v_pay_item IN SELECT value FROM jsonb_array_elements(p_payments) LOOP
      v_pay_amt := ROUND(COALESCE((v_pay_item->>'amount')::NUMERIC, 0), 2);
      v_pay_mode := LOWER(TRIM(COALESCE(v_pay_item->>'mode', '')));
      IF v_pay_mode = 'upi' THEN v_pay_mode := 'qr'; END IF;
      IF v_pay_amt > 0 THEN
        INSERT INTO public.advance_order_payments (
          advance_order_id, payment_type, amount, payment_method, remarks,
          received_by, received_at, change_given, business_id
        ) VALUES (
          p_order_id, 'remaining', v_pay_amt, v_pay_mode,
          COALESCE(v_pay_item->>'notes', p_remarks, ''),
          p_created_by, v_now,
          CASE WHEN v_pay_mode = 'cash' THEN COALESCE(p_change_given, 0) ELSE 0 END,
          COALESCE(v_advance.business_id, '1')
        );
      END IF;
    END LOOP;
  ELSE
    INSERT INTO public.advance_order_payments (
      advance_order_id, payment_type, amount, payment_method, remarks,
      received_by, received_at, change_given, business_id
    ) VALUES (
      p_order_id, 'remaining', v_total_balance_paid, v_final_mode,
      COALESCE(p_remarks, ''), p_created_by, v_now,
      CASE WHEN v_final_mode = 'cash' THEN COALESCE(p_change_given, 0) ELSE 0 END,
      COALESCE(v_advance.business_id, '1')
    );
  END IF;

  -- ── 7. Aggregate all payments ──────────────────────────────────────────────
  SELECT jsonb_agg(
    jsonb_build_object(
      'mode',    CASE WHEN aop.payment_method = 'upi' THEN 'qr' ELSE aop.payment_method END,
      'amount',  aop.amount,
      'phase',   aop.payment_type,
      'paid_at', aop.received_at,
      'notes',   COALESCE(aop.remarks, '')
    ) ORDER BY aop.received_at ASC
  )
  INTO v_all_payments
  FROM public.advance_order_payments aop
  WHERE aop.advance_order_id = p_order_id;

  SELECT ARRAY_AGG(DISTINCT (value->>'mode')) INTO v_all_modes_set
  FROM jsonb_array_elements(COALESCE(v_all_payments, '[]'::JSONB));

  -- ── 8. Resolve discounts, coupon, delivery, taxes, and subtotal ────────────
  v_clean_coupon   := NULLIF(TRIM(COALESCE(p_coupon_code, v_advance.coupon_code, '')), '');
  v_coupon_pct     := COALESCE(p_coupon_percentage, v_advance.coupon_percentage, 0);
  v_coupon_disc    := ROUND(COALESCE(v_advance.discount_amount, 0), 2);
  v_manual_disc    := ROUND(CASE 
                        WHEN COALESCE(p_manual_discount, 0) > 0 THEN p_manual_discount 
                        ELSE COALESCE(v_advance.manual_discount_amount, 0) 
                      END, 2);
  v_total_discount := ROUND(v_coupon_disc + v_manual_disc, 2);
  v_effective_gst  := ROUND(GREATEST(COALESCE(p_total_gst, 0), COALESCE(v_advance.total_gst, 0)), 2);
  v_effective_rate := GREATEST(COALESCE(p_gst_rate, 0), COALESCE(v_advance.gst_rate, 0));
  v_subtotal       := ROUND(COALESCE(v_advance.subtotal, v_advance.total_amount), 2);
  v_delivery       := ROUND(COALESCE(v_advance.delivery_charge, v_advance.shipping, 0), 2);

  -- Derive delivery charge if not explicitly set but present in total_amount
  IF v_delivery <= 0 AND v_advance.total_amount > 0 AND v_subtotal > 0 THEN
    v_delivery := GREATEST(0, ROUND(v_advance.total_amount - (v_subtotal - v_total_discount + v_effective_gst), 2));
  END IF;

  v_order_total    := ROUND(GREATEST(0, v_subtotal - v_total_discount + v_effective_gst + v_delivery), 2);

  v_invoice  := LPAD(NEXTVAL('public.invoice_number_seq')::TEXT, 8, '0');
  v_order_id := gen_random_uuid();

  -- ── 9. Insert completed order record ───────────────────────────────────────
  INSERT INTO public.orders (
    id, invoice_no, customer_name, phone, address, user_id,
    items, subtotal, total, status, order_mode, order_type,
    shipping, delivery_charge, discount_amount, manual_discount_amount,
    coupon_code, coupon_percentage, manual_discount_type, manual_discount_value,
    total_gst, gst_amount, gst_enabled,
    payment_mode, payment_method, payments, change_given, business_id,
    created_at, updated_at
  ) VALUES (
    v_order_id, v_invoice,
    v_advance.customer_name, v_advance.phone, v_advance.address, p_created_by,
    v_items, v_subtotal, v_order_total, 'completed', 'offline', 'advance_order',
    v_delivery, v_delivery, v_coupon_disc, v_manual_disc,
    v_clean_coupon, v_coupon_pct,
    COALESCE(v_advance.manual_discount_type, 'flat'),
    CASE 
      WHEN COALESCE(v_advance.manual_discount_value, 0) > 0 THEN v_advance.manual_discount_value 
      ELSE v_manual_disc 
    END,
    v_effective_gst, v_effective_gst, (v_effective_gst > 0 OR p_gst_enabled OR v_advance.gst_enabled),
    CASE WHEN ARRAY_LENGTH(v_all_modes_set, 1) > 1 THEN 'split' ELSE COALESCE(v_all_modes_set[1], v_final_mode) END,
    CASE WHEN ARRAY_LENGTH(v_all_modes_set, 1) > 1 THEN 'split' ELSE COALESCE(v_all_modes_set[1], v_final_mode) END,
    COALESCE(v_all_payments, '[]'::JSONB),
    COALESCE(p_change_given, 0),
    COALESCE(v_advance.business_id, '1'),
    v_now, v_now
  );

  -- ── 10. Insert order items & record stock deduction + movement ledger ──────
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_items) LOOP
    v_product_id   := NULLIF(v_item->>'product_id', '')::BIGINT;
    v_variant_id   := NULLIF(v_item->>'variant_id', '')::UUID;
    v_variant_name := NULLIF(TRIM(COALESCE(v_item->>'variant_name', '')), '');
    v_name         := COALESCE(NULLIF(TRIM(v_item->>'name'), ''), 'Product');
    v_category     := COALESCE(NULLIF(TRIM(v_item->>'category'), ''), NULLIF(TRIM(v_advance.category), ''), 'Uncategorized');
    v_quantity     := GREATEST(COALESCE((v_item->>'quantity')::NUMERIC, 1), 0);
    v_is_manual    := COALESCE((v_item->>'is_manual')::BOOLEAN, FALSE);

    IF v_product_id IS NULL AND v_variant_id IS NULL AND NOT v_is_manual THEN
      SELECT id, item_type INTO v_product_id, v_item_type
      FROM public.products
      WHERE LOWER(TRIM(name)) = LOWER(TRIM(v_name))
      LIMIT 1;
    END IF;

    v_item_type := LOWER(TRIM(COALESCE(v_item_type, v_item->>'item_type', '')));
    IF v_item_type NOT IN ('product', 'service') THEN
      IF v_product_id IS NOT NULL THEN SELECT item_type INTO v_item_type FROM public.products WHERE id = v_product_id; END IF;
      IF v_item_type IS NULL OR v_item_type NOT IN ('product', 'service') THEN v_item_type := 'product'; END IF;
    END IF;

    INSERT INTO public.order_items (
      order_id, product_id, variant_id, product_name, name, variant_name,
      quantity, unit, unit_type, base_quantity, base_price, unit_price,
      line_total, is_manual, discount, gst_amount, gst_rate, source, note,
      category, item_type, created_at, business_id
    ) VALUES (
      v_order_id, v_product_id, v_variant_id, v_name, v_name, v_variant_name,
      v_quantity, COALESCE(v_item->>'unit', 'piece'),
      COALESCE(v_item->>'unit_type', 'unit'),
      COALESCE((v_item->>'base_quantity')::NUMERIC, 1),
      COALESCE((v_item->>'base_price')::NUMERIC, (v_item->>'unit_price')::NUMERIC, 0),
      COALESCE((v_item->>'unit_price')::NUMERIC, (v_item->>'base_price')::NUMERIC, 0),
      COALESCE((v_item->>'line_total')::NUMERIC, 0),
      v_is_manual,
      COALESCE((v_item->>'discount')::NUMERIC, 0),
      COALESCE((v_item->>'gst_amount')::NUMERIC, 0),
      COALESCE((v_item->>'gst_rate')::NUMERIC, (v_item->>'gst_percent')::NUMERIC, 0),
      'advance_order', COALESCE(v_item->>'note', ''), v_category,
      v_item_type, v_now, COALESCE(v_advance.business_id, '1')
    );

    IF NOT v_is_manual AND v_quantity > 0 AND v_item_type <> 'service' THEN
      PERFORM public.record_sale_stock_deduction(
        p_product_id      => v_product_id,
        p_variant_id      => v_variant_id,
        p_quantity        => v_quantity,
        p_reference_type  => 'order',
        p_reference_id    => v_invoice,
        p_note            => 'Advance Order ' || v_advance.deposit_id || ' completed (Invoice: ' || v_invoice || ')',
        p_created_by_name => COALESCE(p_created_by, '')
      );
    END IF;
  END LOOP;

  -- ── 11. Mark advance order complete ────────────────────────────────────────
  UPDATE public.advance_orders SET
    status               = 'completed',
    completed_at         = v_now,
    completed_order_id   = v_order_id,
    invoice_number       = v_invoice,
    final_payment_method = v_final_mode,
    delivery_charge      = v_delivery,
    shipping             = v_delivery,
    updated_at           = v_now
  WHERE id = p_order_id;

  INSERT INTO public.advance_order_timeline (
    advance_order_id, event_type, label, remarks, created_by, created_at
  ) VALUES (
    p_order_id, 'completed', 'Order Completed',
    CONCAT('Final bill generated: ', v_invoice, ' | Total: ', v_order_total, ' | Balance Paid: ', v_total_balance_paid, ' via ', v_final_mode),
    p_created_by, v_now
  );

  RETURN QUERY SELECT v_order_id, v_invoice, v_now;
END;
$$;
