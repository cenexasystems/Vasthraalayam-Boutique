-- ============================================================================
-- Migration: 0023_advance_order_item_type_reset.sql
-- Description: Fix "Insufficient stock for <service>" when completing an
--              advance order that mixes products and services.
--
-- Root cause:  complete_advance_order_v2 never reset v_item_type between loop
--              iterations, and COALESCE(v_item_type, item ->> 'item_type')
--              preferred the stale value. After a product line, a following
--              service line (e.g. "Blouse", DEP000049) was treated as a product
--              and stock-checked against its 0 stock.
--
-- Fix:         Reset v_item_type for every item, and resolve the type from the
--              catalog product first, then the item's own item_type tag.
--              Everything else is unchanged from 0022.
-- ============================================================================

-- Drop old overloads to avoid ambiguity
DROP FUNCTION IF EXISTS public.complete_advance_order_v2(UUID, TEXT, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, JSONB, NUMERIC);
DROP FUNCTION IF EXISTS public.complete_advance_order_v2(UUID, TEXT, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, JSONB, NUMERIC, NUMERIC, NUMERIC, BOOLEAN);

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
  v_source               TEXT;
  v_original_product_id  TEXT;  -- track whether product_id was in original payload
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
  --    IMPORTANT: Items that originated from advance_order source without an
  --    explicit product_id in the original payload are treated as custom/service
  --    items. We do NOT name-match them to catalog products for stock validation.
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_items) LOOP
    v_item_type    := NULL;  -- reset per item; never inherit the previous item's type
    v_product_id   := NULLIF(v_item ->> 'product_id', '')::BIGINT;
    v_variant_id   := NULLIF(v_item ->> 'variant_id', '')::UUID;
    v_quantity     := GREATEST(COALESCE((v_item ->> 'quantity')::NUMERIC, 1), 0);
    v_is_manual    := COALESCE((v_item ->> 'is_manual')::BOOLEAN, FALSE);
    v_name         := COALESCE(v_item ->> 'product_name', v_item ->> 'name', 'Product');
    v_source       := LOWER(TRIM(COALESCE(v_item ->> 'source', '')));

    -- Remember whether this item originally had a product_id
    v_original_product_id := v_item ->> 'product_id';

    -- Only attempt catalog name-matching if the item was NOT an advance_order
    -- source item without an explicit product_id. Items typed in during advance
    -- order creation (source='advance_order', no product_id) should never be
    -- matched to catalog inventory — they are custom/service items.
    IF v_product_id IS NULL AND v_variant_id IS NULL AND NOT v_is_manual THEN
      IF v_source <> 'advance_order' THEN
        -- Non-advance items: try to resolve by name for stock tracking
        SELECT id, item_type INTO v_product_id, v_item_type
        FROM public.products
        WHERE LOWER(TRIM(name)) = LOWER(TRIM(v_name))
        LIMIT 1;
      END IF;
      -- advance_order source items without product_id: skip name matching entirely
    END IF;

    -- Catalog type wins (a service product is never stocked); then the item's own tag; else product
    IF v_product_id IS NOT NULL THEN
      SELECT LOWER(TRIM(item_type)) INTO v_item_type FROM public.products WHERE id = v_product_id;
    END IF;
    IF v_item_type IS NULL OR v_item_type NOT IN ('product', 'service') THEN
      v_item_type := LOWER(TRIM(COALESCE(v_item ->> 'item_type', '')));
    END IF;
    IF v_item_type NOT IN ('product', 'service') THEN v_item_type := 'product'; END IF;

    IF NOT v_is_manual AND v_quantity > 0 AND v_item_type <> 'service' THEN
      -- Only validate stock if item had an explicit product_id/variant_id in the
      -- original payload. Items created without linking to inventory are custom items.
      IF (v_original_product_id IS NOT NULL AND TRIM(v_original_product_id) <> '') OR v_variant_id IS NOT NULL THEN
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
      -- Items without original product_id: skip stock validation (custom items)
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
    v_item_type    := NULL;  -- reset per item; never inherit the previous item's type
    v_product_id   := NULLIF(v_item->>'product_id', '')::BIGINT;
    v_variant_id   := NULLIF(v_item->>'variant_id', '')::UUID;
    v_variant_name := NULLIF(TRIM(COALESCE(v_item->>'variant_name', '')), '');
    v_name         := COALESCE(NULLIF(TRIM(v_item->>'name'), ''), 'Product');
    v_category     := COALESCE(NULLIF(TRIM(v_item->>'category'), ''), NULLIF(TRIM(v_advance.category), ''), 'Uncategorized');
    v_quantity     := GREATEST(COALESCE((v_item->>'quantity')::NUMERIC, 1), 0);
    v_is_manual    := COALESCE((v_item->>'is_manual')::BOOLEAN, FALSE);
    v_source       := LOWER(TRIM(COALESCE(v_item->>'source', '')));

    -- Remember whether this item originally had a product_id
    v_original_product_id := v_item ->> 'product_id';

    -- Only attempt catalog name-matching for non-advance-order source items
    IF v_product_id IS NULL AND v_variant_id IS NULL AND NOT v_is_manual THEN
      IF v_source <> 'advance_order' THEN
        SELECT id, item_type INTO v_product_id, v_item_type
        FROM public.products
        WHERE LOWER(TRIM(name)) = LOWER(TRIM(v_name))
        LIMIT 1;
      END IF;
    END IF;

    -- Catalog type wins (a service product is never stocked); then the item's own tag; else product
    IF v_product_id IS NOT NULL THEN
      SELECT LOWER(TRIM(item_type)) INTO v_item_type FROM public.products WHERE id = v_product_id;
    END IF;
    IF v_item_type IS NULL OR v_item_type NOT IN ('product', 'service') THEN
      v_item_type := LOWER(TRIM(COALESCE(v_item ->> 'item_type', '')));
    END IF;
    IF v_item_type NOT IN ('product', 'service') THEN v_item_type := 'product'; END IF;

    INSERT INTO public.order_items (
      order_id, product_id, variant_id, variant_name, product_name, name, category,
      quantity, unit, unit_type, base_price, line_total, is_manual, source, item_type
    ) VALUES (
      v_order_id, v_product_id, v_variant_id, v_variant_name, v_name, v_name, v_category,
      v_quantity, COALESCE(NULLIF(v_item->>'unit', ''), 'piece'),
      COALESCE(NULLIF(v_item->>'unit_type', ''), 'unit'),
      GREATEST(COALESCE((v_item->>'base_price')::NUMERIC, 0), 0),
      GREATEST(COALESCE((v_item->>'line_total')::NUMERIC, 0), 0),
      v_is_manual, COALESCE(v_source, 'advance_order'), v_item_type
    );

    -- Deduct stock ONLY if the item originally had a product_id or variant_id.
    -- Advance order items without explicit product links are custom items — no stock.
    IF NOT v_is_manual AND v_quantity > 0 AND v_item_type <> 'service' THEN
      IF (v_original_product_id IS NOT NULL AND TRIM(v_original_product_id) <> '') OR v_variant_id IS NOT NULL THEN
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
