-- ============================================================================
-- Migration: 0016_advance_order_stock_deduction_ledger.sql
-- Description: Unify stock reduction and inventory movement audit ledger
--              recording for completed advance orders.
-- Safe: Reuses identical stock & ledger logic as complete_pos_sale_with_inventory.
--       No schema changes to existing tables.
-- ============================================================================

-- 1. Dedicated helper function for sale stock reduction and ledger recording
CREATE OR REPLACE FUNCTION public.record_sale_stock_deduction(
  p_product_id BIGINT,
  p_variant_id UUID DEFAULT NULL::UUID,
  p_quantity NUMERIC DEFAULT 1,
  p_reference_type TEXT DEFAULT 'order',
  p_reference_id TEXT DEFAULT NULL,
  p_note TEXT DEFAULT '',
  p_created_by_name TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_qty_before NUMERIC := 0;
  v_qty_after NUMERIC := 0;
  v_barcode_id UUID := NULL;
  v_actual_product_id BIGINT := p_product_id;
  v_item_name TEXT := 'Product';
BEGIN
  IF p_quantity <= 0 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'zero_quantity');
  END IF;

  -- ── Variant Item ──────────────────────────────────────────────────────────
  IF p_variant_id IS NOT NULL THEN
    SELECT stock, variant_name, product_id
    INTO v_qty_before, v_item_name, v_actual_product_id
    FROM public.product_variants
    WHERE id = p_variant_id
    FOR UPDATE;

    IF v_qty_before IS NULL THEN
      RAISE EXCEPTION 'Variant % not found', p_variant_id;
    END IF;

    IF v_item_name IS NULL OR TRIM(v_item_name) = '' THEN
      SELECT name INTO v_item_name FROM public.products WHERE id = v_actual_product_id;
    END IF;

    IF v_qty_before < p_quantity THEN
      RAISE EXCEPTION 'Insufficient stock for % (Available: %, Requested: %)', COALESCE(v_item_name, 'Variant'), v_qty_before, p_quantity;
    END IF;

    SELECT id INTO v_barcode_id
    FROM public.barcode_registry
    WHERE variant_id = p_variant_id AND is_active = TRUE
    LIMIT 1;

    v_qty_after := GREATEST(0, v_qty_before - p_quantity);

    UPDATE public.product_variants
    SET stock = v_qty_after, updated_at = NOW()
    WHERE id = p_variant_id;

    IF v_actual_product_id IS NOT NULL THEN
      UPDATE public.products
      SET stock_quantity = (SELECT COALESCE(SUM(stock), 0) FROM public.product_variants WHERE product_id = v_actual_product_id AND is_active = TRUE),
          stock = FLOOR((SELECT COALESCE(SUM(stock), 0) FROM public.product_variants WHERE product_id = v_actual_product_id AND is_active = TRUE))::INTEGER,
          updated_at = NOW()
      WHERE id = v_actual_product_id;
    END IF;

    INSERT INTO public.inventory_movements (
      product_id, variant_id, barcode_id, movement_type,
      quantity_delta, quantity_before, quantity_after,
      reference_type, reference_id, note, created_by_name
    ) VALUES (
      v_actual_product_id, p_variant_id, v_barcode_id, 'SALE',
      -p_quantity, v_qty_before, v_qty_after,
      COALESCE(p_reference_type, 'order'), p_reference_id, COALESCE(p_note, 'Sale'), COALESCE(p_created_by_name, '')
    );

    RETURN jsonb_build_object('success', true, 'quantity_before', v_qty_before, 'quantity_after', v_qty_after);

  -- ── Standalone Product Item ───────────────────────────────────────────────
  ELSIF v_actual_product_id IS NOT NULL THEN
    SELECT stock_quantity, COALESCE(name, 'Product')
    INTO v_qty_before, v_item_name
    FROM public.products
    WHERE id = v_actual_product_id
    FOR UPDATE;

    IF v_qty_before IS NULL THEN
      RAISE EXCEPTION 'Product % not found', v_actual_product_id;
    END IF;

    IF v_qty_before < p_quantity THEN
      RAISE EXCEPTION 'Insufficient stock for % (Available: %, Requested: %)', v_item_name, v_qty_before, p_quantity;
    END IF;

    SELECT id INTO v_barcode_id
    FROM public.barcode_registry
    WHERE product_id = v_actual_product_id AND variant_id IS NULL AND is_active = TRUE
    LIMIT 1;

    v_qty_after := GREATEST(0, v_qty_before - p_quantity);

    UPDATE public.products
    SET stock_quantity = v_qty_after,
        stock = FLOOR(v_qty_after)::INTEGER,
        updated_at = NOW()
    WHERE id = v_actual_product_id;

    INSERT INTO public.inventory_movements (
      product_id, variant_id, barcode_id, movement_type,
      quantity_delta, quantity_before, quantity_after,
      reference_type, reference_id, note, created_by_name
    ) VALUES (
      v_actual_product_id, NULL, v_barcode_id, 'SALE',
      -p_quantity, v_qty_before, v_qty_after,
      COALESCE(p_reference_type, 'order'), p_reference_id, COALESCE(p_note, 'Sale'), COALESCE(p_created_by_name, '')
    );

    RETURN jsonb_build_object('success', true, 'quantity_before', v_qty_before, 'quantity_after', v_qty_after);
  END IF;

  RETURN jsonb_build_object('success', false, 'reason', 'no_product_or_variant');
END;
$$;

-- Drop obsolete overloads so calls with default arguments resolve cleanly
DROP FUNCTION IF EXISTS public.complete_advance_order_v2(UUID, TEXT, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, JSONB, NUMERIC);
DROP FUNCTION IF EXISTS public.create_advance_order(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, DATE, TEXT, TEXT, TEXT, JSONB, TEXT, JSONB, TEXT);

-- 2. Update complete_advance_order_v2 to reuse record_sale_stock_deduction
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
  v_total_discount       NUMERIC := 0;
  v_subtotal             NUMERIC := 0;
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

    -- Resolve catalog product if product_id is null
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

  v_clean_coupon   := NULLIF(TRIM(COALESCE(p_coupon_code, v_advance.coupon_code, '')), '');
  v_total_discount := ROUND(COALESCE(p_manual_discount, 0) + COALESCE(v_advance.discount_amount, 0), 2);
  v_effective_gst  := ROUND(GREATEST(COALESCE(p_total_gst, 0), COALESCE(v_advance.total_gst, 0)), 2);
  v_effective_rate := GREATEST(COALESCE(p_gst_rate, 0), COALESCE(v_advance.gst_rate, 0));
  v_subtotal       := ROUND(COALESCE(v_advance.subtotal, v_advance.total_amount), 2);
  v_order_total    := ROUND(GREATEST(0, v_subtotal - v_total_discount + v_effective_gst), 2);

  v_invoice  := LPAD(NEXTVAL('public.invoice_number_seq')::TEXT, 8, '0');
  v_order_id := gen_random_uuid();

  -- ── 8. Insert completed order record ───────────────────────────────────────
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
    0, 0, v_total_discount, p_manual_discount,
    v_clean_coupon, COALESCE(p_coupon_percentage, v_advance.coupon_percentage, 0), 'flat', p_manual_discount,
    v_effective_gst, v_effective_gst, (v_effective_gst > 0 OR p_gst_enabled OR v_advance.gst_enabled),
    CASE WHEN ARRAY_LENGTH(v_all_modes_set, 1) > 1 THEN 'split' ELSE COALESCE(v_all_modes_set[1], v_final_mode) END,
    CASE WHEN ARRAY_LENGTH(v_all_modes_set, 1) > 1 THEN 'split' ELSE COALESCE(v_all_modes_set[1], v_final_mode) END,
    COALESCE(v_all_payments, '[]'::JSONB),
    COALESCE(p_change_given, 0),
    COALESCE(v_advance.business_id, '1'),
    v_now, v_now
  );

  -- ── 9. Insert order items & record stock deduction + movement ledger ───────
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_items) LOOP
    v_product_id   := NULLIF(v_item->>'product_id', '')::BIGINT;
    v_variant_id   := NULLIF(v_item->>'variant_id', '')::UUID;
    v_variant_name := NULLIF(TRIM(COALESCE(v_item->>'variant_name', '')), '');
    v_name         := COALESCE(NULLIF(TRIM(v_item->>'name'), ''), 'Product');
    v_category     := COALESCE(NULLIF(TRIM(v_item->>'category'), ''), NULLIF(TRIM(v_advance.category), ''), 'Uncategorized');
    v_quantity     := GREATEST(COALESCE((v_item->>'quantity')::NUMERIC, 1), 0);
    v_is_manual    := COALESCE((v_item->>'is_manual')::BOOLEAN, FALSE);

    -- If product_id is null, attempt to resolve catalog item by name
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
      order_id, product_id, variant_id, variant_name, product_name, name, category,
      quantity, unit, unit_type, base_price, line_total, is_manual, source, item_type
    ) VALUES (
      v_order_id, v_product_id, v_variant_id, v_variant_name, v_name, v_name, v_category,
      v_quantity, COALESCE(NULLIF(v_item->>'unit', ''), 'piece'),
      COALESCE(NULLIF(v_item->>'unit_type', ''), 'unit'),
      GREATEST(COALESCE((v_item->>'base_price')::NUMERIC, 0), 0),
      GREATEST(COALESCE((v_item->>'line_total')::NUMERIC, 0), 0),
      v_is_manual, 'advance_order', v_item_type
    );

    -- Deduct stock and record SALE movement via unified helper
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

  -- ── 10. Finalize advance order record ──────────────────────────────────────
  UPDATE public.advance_orders SET
    status               = 'completed',
    completed_at         = v_now,
    completed_order_id   = v_order_id,
    invoice_number       = v_invoice,
    final_payment_method = v_final_mode,
    updated_at           = v_now
  WHERE id = p_order_id;

  INSERT INTO public.advance_order_timeline (
    advance_order_id, event_type, label, remarks, created_by, created_at
  ) VALUES (
    p_order_id, 'completed', 'Order Completed — Final Payment',
    'Remaining balance received (' || v_final_mode || '). Tax invoice #' || v_invoice || ' generated.',
    p_created_by, v_now
  );

  RETURN QUERY SELECT v_order_id, v_invoice, v_now;
END;
$$;
