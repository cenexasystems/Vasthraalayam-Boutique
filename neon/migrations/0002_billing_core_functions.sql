-- VASTHRAALAYAM BOUTIQUE — Neon billing-core functions (Phase 1)
-- Ported from supabase/migrations/*.sql (final/active version of each function,
-- per the audit). Every `auth.uid()` call is replaced with a `p_created_by TEXT
-- DEFAULT NULL` parameter — the API layer passes the portal role/id it already
-- knows (e.g. 'ADMIN' / 'staff') instead of relying on a JWT. No GRANT statements
-- (Neon has a single application role via DATABASE_URL) and no
-- `NOTIFY pgrst, 'reload schema'` (no PostgREST in front of this database).
-- All transactional/locking behavior (FOR UPDATE, atomic stock checks) is
-- preserved exactly as in the Supabase originals.

-- ─── Invoice numbering ─────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq START WITH 10000001;

CREATE OR REPLACE FUNCTION public.get_next_invoice_no()
RETURNS TEXT
LANGUAGE sql
SET search_path = public
VOLATILE
AS $$
  SELECT LPAD(nextval('public.invoice_number_seq')::TEXT, 8, '0');
$$;

-- ─── Public invoice lookup (no auth required — matches today's public page) ──
CREATE OR REPLACE FUNCTION public.get_public_invoice_by_number(p_invoice_no TEXT)
RETURNS SETOF public.orders
LANGUAGE sql
SET search_path = public
STABLE
AS $$
  SELECT * FROM public.orders
  WHERE invoice_no = NULLIF(BTRIM(p_invoice_no), '')
     OR LOWER(invoice_no) = LOWER(NULLIF(BTRIM(p_invoice_no), ''))
     OR invoice_no = REGEXP_REPLACE(BTRIM(p_invoice_no), '^(INV|PB)[-_ ]*', '', 'i')
     OR (
       REGEXP_REPLACE(BTRIM(p_invoice_no), '\D', '', 'g') <> ''
       AND invoice_no = LPAD(REGEXP_REPLACE(BTRIM(p_invoice_no), '\D', '', 'g'), 8, '0')
     )
     OR (
       REGEXP_REPLACE(BTRIM(p_invoice_no), '\D', '', 'g') <> ''
       AND invoice_no = REGEXP_REPLACE(REGEXP_REPLACE(BTRIM(p_invoice_no), '\D', '', 'g'), '^0+', '')
     )
     OR (
       p_invoice_no ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       AND id = p_invoice_no::UUID
     )
  LIMIT 1;
$$;

-- ─── POS checkout: atomic stock check, order + items, movement ledger ───────
CREATE OR REPLACE FUNCTION public.complete_pos_sale_with_inventory(
  p_customer_name TEXT,
  p_phone TEXT,
  p_address TEXT,
  p_items JSONB,
  p_shipping NUMERIC DEFAULT 0,
  p_status TEXT DEFAULT 'completed',
  p_order_mode TEXT DEFAULT 'offline',
  p_order_type TEXT DEFAULT 'pos_sale',
  p_delivery_charge NUMERIC DEFAULT 0,
  p_discount_amount NUMERIC DEFAULT 0,
  p_manual_discount_amount NUMERIC DEFAULT 0,
  p_manual_discount_type TEXT DEFAULT 'flat',
  p_manual_discount_value NUMERIC DEFAULT 0,
  p_coupon_code TEXT DEFAULT NULL,
  p_coupon_percentage NUMERIC DEFAULT 0,
  p_payment_method TEXT DEFAULT 'cash',
  p_split_details JSONB DEFAULT '{}'::JSONB,
  p_total_gst NUMERIC DEFAULT 0,
  p_gst_enabled BOOLEAN DEFAULT FALSE,
  p_remarks TEXT DEFAULT NULL,
  p_reference_number TEXT DEFAULT NULL,
  p_billing_date TIMESTAMPTZ DEFAULT NULL,
  p_created_by TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_invoice_no TEXT;
  v_order_id UUID;
  v_subtotal NUMERIC := 0;
  v_total NUMERIC := 0;
  v_item JSONB;
  v_product_id BIGINT;
  v_variant_id UUID;
  v_quantity NUMERIC;
  v_unit_price NUMERIC;
  v_line_total NUMERIC;
  v_product_name TEXT;
  v_name_ta TEXT;
  v_unit TEXT;
  v_unit_type TEXT;
  v_base_quantity NUMERIC;
  v_is_manual BOOLEAN;
  v_discount NUMERIC;
  v_gst_amount NUMERIC;
  v_gst_rate NUMERIC;
  v_image_url TEXT;
  v_variant_name TEXT;
  v_source TEXT;
  v_note TEXT;
  v_category TEXT;
  v_current_stock NUMERIC;
  v_barcode_id UUID;
  v_created_at TIMESTAMPTZ := COALESCE(p_billing_date, NOW());
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Order items cannot be empty';
  END IF;

  -- 1. Atomic pre-validation of available stock for all items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := NULLIF(v_item ->> 'product_id', '')::BIGINT;
    v_variant_id := NULLIF(v_item ->> 'variant_id', '')::UUID;
    v_quantity := COALESCE((v_item ->> 'quantity')::NUMERIC, 0);
    v_is_manual := COALESCE((v_item ->> 'is_manual')::BOOLEAN, FALSE);
    v_product_name := COALESCE(v_item ->> 'product_name', v_item ->> 'name', 'Product');

    IF NOT v_is_manual AND v_quantity > 0 THEN
      IF v_variant_id IS NOT NULL THEN
        SELECT stock INTO v_current_stock FROM public.product_variants WHERE id = v_variant_id FOR UPDATE;
        IF v_current_stock IS NULL OR v_current_stock < v_quantity THEN
          RAISE EXCEPTION 'Insufficient stock for % (Available: %, Requested: %)', v_product_name, COALESCE(v_current_stock, 0), v_quantity;
        END IF;
      ELSIF v_product_id IS NOT NULL THEN
        SELECT stock_quantity INTO v_current_stock FROM public.products WHERE id = v_product_id FOR UPDATE;
        IF v_current_stock IS NULL OR v_current_stock < v_quantity THEN
          RAISE EXCEPTION 'Insufficient stock for % (Available: %, Requested: %)', v_product_name, COALESCE(v_current_stock, 0), v_quantity;
        END IF;
      END IF;
    END IF;
  END LOOP;

  -- 2. Calculate subtotal & generate invoice number
  v_invoice_no := public.get_next_invoice_no();

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_quantity := COALESCE((v_item ->> 'quantity')::NUMERIC, 0);
    v_unit_price := COALESCE(
      (v_item ->> 'unit_price')::NUMERIC,
      (v_item ->> 'base_price')::NUMERIC,
      (v_item ->> 'price')::NUMERIC,
      0
    );
    v_line_total := COALESCE((v_item ->> 'line_total')::NUMERIC, ROUND(v_quantity * v_unit_price, 2));
    v_subtotal := v_subtotal + v_line_total;
  END LOOP;

  v_total := GREATEST(0, ROUND(v_subtotal + COALESCE(p_shipping, 0) + COALESCE(p_delivery_charge, 0) - COALESCE(p_discount_amount, 0), 2));

  -- 3. Insert order record
  INSERT INTO public.orders (
    invoice_no, user_id, customer_name, phone, address, items,
    subtotal, shipping, total, status, order_mode, order_type,
    delivery_charge, discount_amount, manual_discount_amount,
    manual_discount_type, manual_discount_value, coupon_code,
    coupon_percentage, total_gst, gst_amount, gst_enabled,
    payment_method, payment_mode, split_details, remarks,
    reference_number, billing_date, created_at, updated_at
  )
  VALUES (
    v_invoice_no, p_created_by, COALESCE(NULLIF(BTRIM(p_customer_name), ''), 'Customer'),
    COALESCE(p_phone, ''), COALESCE(p_address, ''), p_items,
    v_subtotal, COALESCE(p_shipping, 0), v_total, COALESCE(p_status, 'completed'),
    COALESCE(p_order_mode, 'offline'), COALESCE(p_order_type, 'pos_sale'),
    COALESCE(p_delivery_charge, 0), COALESCE(p_discount_amount, 0),
    COALESCE(p_manual_discount_amount, 0), COALESCE(p_manual_discount_type, 'flat'),
    COALESCE(p_manual_discount_value, 0), p_coupon_code,
    COALESCE(p_coupon_percentage, 0), COALESCE(p_total_gst, 0),
    COALESCE(p_total_gst, 0), COALESCE(p_gst_enabled, FALSE),
    COALESCE(p_payment_method, 'cash'), COALESCE(p_payment_method, 'cash'),
    COALESCE(p_split_details, '{}'::JSONB), COALESCE(p_remarks, ''),
    COALESCE(p_reference_number, ''), p_billing_date, v_created_at, NOW()
  )
  RETURNING id INTO v_order_id;

  -- 4. Insert order items, deduct stock & record SALE movements
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := NULLIF(v_item ->> 'product_id', '')::BIGINT;
    v_variant_id := NULLIF(v_item ->> 'variant_id', '')::UUID;
    v_quantity := COALESCE((v_item ->> 'quantity')::NUMERIC, 0);
    v_unit_price := COALESCE((v_item ->> 'unit_price')::NUMERIC, (v_item ->> 'base_price')::NUMERIC, 0);
    v_line_total := COALESCE((v_item ->> 'line_total')::NUMERIC, ROUND(v_quantity * v_unit_price, 2));
    v_product_name := COALESCE(v_item ->> 'product_name', v_item ->> 'name', 'Product');
    v_name_ta := COALESCE(v_item ->> 'product_tamil_name', v_item ->> 'tamil_name', '');
    v_unit := COALESCE(v_item ->> 'unit', 'piece');
    v_unit_type := COALESCE(v_item ->> 'unit_type', 'unit');
    v_base_quantity := COALESCE((v_item ->> 'base_quantity')::NUMERIC, 1);
    v_is_manual := COALESCE((v_item ->> 'is_manual')::BOOLEAN, FALSE);
    v_discount := COALESCE((v_item ->> 'discount')::NUMERIC, 0);
    v_gst_amount := COALESCE((v_item ->> 'gst_amount')::NUMERIC, 0);
    v_gst_rate := COALESCE((v_item ->> 'gst_rate')::NUMERIC, 0);
    v_image_url := v_item ->> 'image_url';
    v_variant_name := v_item ->> 'variant_name';
    v_source := COALESCE(v_item ->> 'source', 'catalogue');
    v_note := v_item ->> 'note';
    v_category := v_item ->> 'category';

    INSERT INTO public.order_items (
      order_id, product_id, variant_id, product_name, name,
      product_tamil_name, tamil_name, quantity, unit, unit_type,
      base_quantity, base_price, unit_price, line_total, image_url,
      is_manual, discount, gst_amount, gst_rate, variant_name,
      source, note, category, created_at
    )
    VALUES (
      v_order_id, v_product_id, v_variant_id, v_product_name, v_product_name,
      v_name_ta, v_name_ta, v_quantity, v_unit, v_unit_type,
      v_base_quantity, v_unit_price, v_unit_price, v_line_total, v_image_url,
      v_is_manual, v_discount, v_gst_amount, v_gst_rate, v_variant_name,
      v_source, v_note, v_category, v_created_at
    );

    -- Deduct stock and insert SALE movement
    IF NOT v_is_manual AND v_quantity > 0 THEN
      IF v_variant_id IS NOT NULL THEN
        SELECT stock INTO v_current_stock FROM public.product_variants WHERE id = v_variant_id;
        SELECT id INTO v_barcode_id FROM public.barcode_registry WHERE variant_id = v_variant_id AND is_active = TRUE LIMIT 1;

        UPDATE public.product_variants
        SET stock = GREATEST(0, stock - v_quantity), updated_at = NOW()
        WHERE id = v_variant_id;

        UPDATE public.products
        SET stock_quantity = (SELECT COALESCE(SUM(stock), 0) FROM public.product_variants WHERE product_id = v_product_id AND is_active = TRUE),
            stock = FLOOR((SELECT COALESCE(SUM(stock), 0) FROM public.product_variants WHERE product_id = v_product_id AND is_active = TRUE))::INTEGER,
            updated_at = NOW()
        WHERE id = v_product_id;

        INSERT INTO public.inventory_movements (
          product_id, variant_id, barcode_id, movement_type,
          quantity_delta, quantity_before, quantity_after,
          reference_type, reference_id, note
        )
        VALUES (
          v_product_id, v_variant_id, v_barcode_id, 'SALE',
          -v_quantity, v_current_stock, GREATEST(0, v_current_stock - v_quantity),
          'order', v_invoice_no, 'POS Sale checkout'
        );

      ELSIF v_product_id IS NOT NULL THEN
        SELECT stock_quantity INTO v_current_stock FROM public.products WHERE id = v_product_id;
        SELECT id INTO v_barcode_id FROM public.barcode_registry WHERE product_id = v_product_id AND variant_id IS NULL AND is_active = TRUE LIMIT 1;

        UPDATE public.products
        SET stock_quantity = GREATEST(0, stock_quantity - v_quantity),
            stock = GREATEST(0, stock - FLOOR(v_quantity)::INTEGER),
            updated_at = NOW()
        WHERE id = v_product_id;

        INSERT INTO public.inventory_movements (
          product_id, variant_id, barcode_id, movement_type,
          quantity_delta, quantity_before, quantity_after,
          reference_type, reference_id, note
        )
        VALUES (
          v_product_id, NULL, v_barcode_id, 'SALE',
          -v_quantity, v_current_stock, GREATEST(0, v_current_stock - v_quantity),
          'order', v_invoice_no, 'POS Sale checkout'
        );
      END IF;
    END IF;
  END LOOP;

  -- 5. Increment coupon usage count
  IF p_coupon_code IS NOT NULL AND BTRIM(p_coupon_code) <> '' THEN
    UPDATE public.coupons
    SET usage_count = usage_count + 1, updated_at = NOW()
    WHERE UPPER(BTRIM(code)) = UPPER(BTRIM(p_coupon_code));
  END IF;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'invoice_no', v_invoice_no,
    'total', v_total
  );
END;
$$;

-- ─── Barcode helpers ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.generate_barcode_value(p_entity_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_entity_type = 'variant' THEN
    RETURN 'VBV' || LPAD(nextval('public.barcode_variant_seq')::TEXT, 8, '0');
  ELSE
    RETURN 'VBP' || LPAD(nextval('public.barcode_product_seq')::TEXT, 8, '0');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_barcode_and_receive_stock(
  p_product_id BIGINT,
  p_variant_id UUID DEFAULT NULL,
  p_quantity_received NUMERIC DEFAULT 0,
  p_unit_cost NUMERIC DEFAULT NULL,
  p_created_by_name TEXT DEFAULT '',
  p_custom_barcode TEXT DEFAULT NULL,
  p_note TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_entity_type TEXT;
  v_barcode_id UUID;
  v_barcode_value TEXT;
  v_is_new_barcode BOOLEAN := FALSE;
  v_movement_type TEXT;
  v_qty_before NUMERIC := 0;
  v_qty_after NUMERIC := 0;
  v_prod_name TEXT;
  v_var_name TEXT := '';
BEGIN
  IF p_quantity_received < 0 THEN
    RAISE EXCEPTION 'Quantity received cannot be negative';
  END IF;

  SELECT name INTO v_prod_name FROM public.products WHERE id = p_product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product with ID % not found', p_product_id;
  END IF;

  IF p_variant_id IS NOT NULL THEN
    v_entity_type := 'variant';
    SELECT variant_name, stock INTO v_var_name, v_qty_before
    FROM public.product_variants
    WHERE id = p_variant_id AND product_id = p_product_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Variant % does not belong to Product %', p_variant_id, p_product_id;
    END IF;
  ELSE
    v_entity_type := 'product';
    SELECT stock_quantity INTO v_qty_before
    FROM public.products
    WHERE id = p_product_id;
  END IF;

  IF v_entity_type = 'variant' THEN
    SELECT id, barcode_value INTO v_barcode_id, v_barcode_value
    FROM public.barcode_registry
    WHERE variant_id = p_variant_id AND is_active = TRUE
    ORDER BY created_at DESC
    LIMIT 1;
  ELSE
    SELECT id, barcode_value INTO v_barcode_id, v_barcode_value
    FROM public.barcode_registry
    WHERE product_id = p_product_id AND variant_id IS NULL AND is_active = TRUE
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF v_barcode_id IS NOT NULL THEN
    v_is_new_barcode := FALSE;
    v_movement_type := CASE WHEN v_qty_before = 0 THEN 'INITIAL_BARCODE_STOCK' ELSE 'RESTOCK' END;
  ELSE
    v_is_new_barcode := TRUE;
    v_movement_type := 'INITIAL_BARCODE_STOCK';
    v_barcode_value := COALESCE(NULLIF(UPPER(BTRIM(p_custom_barcode)), ''), public.generate_barcode_value(v_entity_type));

    INSERT INTO public.barcode_registry (
      barcode_value, entity_type, product_id, variant_id, is_active, created_by_name
    )
    VALUES (
      v_barcode_value, v_entity_type, p_product_id, p_variant_id, TRUE, COALESCE(p_created_by_name, '')
    )
    RETURNING id INTO v_barcode_id;
  END IF;

  IF v_entity_type = 'variant' THEN
    UPDATE public.product_variants
    SET barcode = v_barcode_value, updated_at = NOW()
    WHERE id = p_variant_id;
  ELSE
    UPDATE public.products
    SET barcode = v_barcode_value, updated_at = NOW()
    WHERE id = p_product_id;
  END IF;

  v_qty_after := v_qty_before + p_quantity_received;

  IF p_quantity_received > 0 THEN
    IF v_entity_type = 'variant' THEN
      UPDATE public.product_variants
      SET stock = v_qty_after, updated_at = NOW()
      WHERE id = p_variant_id;

      UPDATE public.products
      SET stock_quantity = (
            SELECT COALESCE(SUM(stock), 0)
            FROM public.product_variants
            WHERE product_id = p_product_id AND is_active = TRUE
          ),
          stock = FLOOR((
            SELECT COALESCE(SUM(stock), 0)
            FROM public.product_variants
            WHERE product_id = p_product_id AND is_active = TRUE
          ))::INTEGER,
          updated_at = NOW()
      WHERE id = p_product_id;
    ELSE
      UPDATE public.products
      SET stock_quantity = v_qty_after,
          stock = FLOOR(v_qty_after)::INTEGER,
          updated_at = NOW()
      WHERE id = p_product_id;
    END IF;
  END IF;

  IF p_quantity_received > 0 THEN
    INSERT INTO public.inventory_movements (
      product_id, variant_id, barcode_id, movement_type,
      quantity_delta, quantity_before, quantity_after,
      unit_cost, reference_type, reference_id, note, created_by_name
    )
    VALUES (
      p_product_id, p_variant_id, v_barcode_id, v_movement_type,
      p_quantity_received, v_qty_before, v_qty_after,
      p_unit_cost, 'barcode_receipt', v_barcode_value,
      COALESCE(p_note, ''), COALESCE(p_created_by_name, '')
    );
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'barcode_id', v_barcode_id,
    'barcode_value', v_barcode_value,
    'is_new_barcode', v_is_new_barcode,
    'movement_type', v_movement_type,
    'quantity_before', v_qty_before,
    'quantity_received', p_quantity_received,
    'quantity_after', v_qty_after,
    'product_id', p_product_id,
    'variant_id', p_variant_id,
    'product_name', v_prod_name,
    'variant_name', v_var_name
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.adjust_inventory_stock(
  p_product_id BIGINT,
  p_variant_id UUID DEFAULT NULL,
  p_new_quantity NUMERIC DEFAULT 0,
  p_reason TEXT DEFAULT 'RESTOCK',
  p_note TEXT DEFAULT '',
  p_created_by_name TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_qty_before NUMERIC := 0;
  v_delta NUMERIC := 0;
  v_barcode_id UUID;
BEGIN
  IF p_new_quantity < 0 THEN
    RAISE EXCEPTION 'Stock quantity cannot be negative';
  END IF;

  IF p_variant_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.product_variants WHERE id = p_variant_id AND product_id = p_product_id) THEN
      RAISE EXCEPTION 'Variant does not belong to specified Product';
    END IF;

    SELECT stock INTO v_qty_before FROM public.product_variants WHERE id = p_variant_id FOR UPDATE;
    SELECT id INTO v_barcode_id FROM public.barcode_registry WHERE variant_id = p_variant_id AND is_active = TRUE LIMIT 1;

    v_delta := p_new_quantity - v_qty_before;

    UPDATE public.product_variants
    SET stock = p_new_quantity, updated_at = NOW()
    WHERE id = p_variant_id;

    UPDATE public.products
    SET stock_quantity = (SELECT COALESCE(SUM(stock), 0) FROM public.product_variants WHERE product_id = p_product_id AND is_active = TRUE),
        stock = FLOOR((SELECT COALESCE(SUM(stock), 0) FROM public.product_variants WHERE product_id = p_product_id AND is_active = TRUE))::INTEGER,
        updated_at = NOW()
    WHERE id = p_product_id;
  ELSE
    SELECT stock_quantity INTO v_qty_before FROM public.products WHERE id = p_product_id FOR UPDATE;
    SELECT id INTO v_barcode_id FROM public.barcode_registry WHERE product_id = p_product_id AND variant_id IS NULL AND is_active = TRUE LIMIT 1;

    v_delta := p_new_quantity - v_qty_before;

    UPDATE public.products
    SET stock_quantity = p_new_quantity,
        stock = FLOOR(p_new_quantity)::INTEGER,
        updated_at = NOW()
    WHERE id = p_product_id;
  END IF;

  INSERT INTO public.inventory_movements (
    product_id, variant_id, barcode_id, movement_type,
    quantity_delta, quantity_before, quantity_after,
    reference_type, note, created_by_name
  )
  VALUES (
    p_product_id, p_variant_id, v_barcode_id, p_reason,
    v_delta, v_qty_before, p_new_quantity,
    'adjustment', COALESCE(p_note, ''), COALESCE(p_created_by_name, '')
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'quantity_before', v_qty_before,
    'quantity_after', p_new_quantity,
    'delta', v_delta,
    'reason', p_reason
  );
END;
$$;

-- ─── Advance orders (deposit workflow) ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_advance_order(
  p_customer_name TEXT, p_phone TEXT, p_address TEXT, p_product_name TEXT,
  p_category TEXT, p_description TEXT, p_total_amount NUMERIC, p_deposit_amount NUMERIC,
  p_expected_delivery_date DATE, p_remarks TEXT, p_payment_method TEXT, p_created_by_name TEXT,
  p_products JSONB DEFAULT '[]'::JSONB,
  p_created_by TEXT DEFAULT NULL
)
RETURNS public.advance_orders
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE v_order public.advance_orders; v_now TIMESTAMPTZ := NOW(); v_deposit_id TEXT;
BEGIN
  IF TRIM(COALESCE(p_customer_name,'')) = '' THEN RAISE EXCEPTION 'Customer name is required'; END IF;
  IF TRIM(COALESCE(p_phone,'')) = '' THEN RAISE EXCEPTION 'Phone number is required'; END IF;
  IF TRIM(COALESCE(p_product_name,'')) = '' THEN RAISE EXCEPTION 'Product name is required'; END IF;
  IF COALESCE(p_total_amount,0) <= 0 THEN RAISE EXCEPTION 'Total amount must be greater than zero'; END IF;
  IF COALESCE(p_deposit_amount,0) <= 0 OR p_deposit_amount >= p_total_amount THEN RAISE EXCEPTION 'Deposit must be greater than zero and less than the total amount'; END IF;
  IF LOWER(COALESCE(p_payment_method,'')) NOT IN ('cash','upi','card') THEN RAISE EXCEPTION 'Select a valid deposit payment method'; END IF;
  v_deposit_id := 'DEP-' || TO_CHAR(v_now AT TIME ZONE 'Asia/Kolkata','YYYYMMDD') || '-' || LPAD(NEXTVAL('public.deposit_number_seq')::TEXT,4,'0');
  INSERT INTO public.advance_orders(deposit_id,customer_name,phone,address,product_name,products,category,description,total_amount,deposit_amount,expected_delivery_date,remarks,created_by,created_by_name,created_at,updated_at)
  VALUES(v_deposit_id,TRIM(p_customer_name),TRIM(p_phone),TRIM(COALESCE(p_address,'')),TRIM(p_product_name),CASE WHEN jsonb_typeof(COALESCE(p_products,'[]'::JSONB))='array' THEN COALESCE(p_products,'[]'::JSONB) ELSE '[]'::JSONB END,TRIM(COALESCE(p_category,'')),TRIM(COALESCE(p_description,'')),ROUND(p_total_amount,2),ROUND(p_deposit_amount,2),p_expected_delivery_date,TRIM(COALESCE(p_remarks,'')),p_created_by,TRIM(COALESCE(p_created_by_name,'')),v_now,v_now)
  RETURNING * INTO v_order;
  INSERT INTO public.advance_order_payments(advance_order_id,payment_type,amount,payment_method,remarks,received_by,received_at)
  VALUES(v_order.id,'deposit',v_order.deposit_amount,LOWER(p_payment_method),COALESCE(p_remarks,''),p_created_by,v_now);
  INSERT INTO public.advance_order_timeline(advance_order_id,event_type,label,created_by,created_at) VALUES
    (v_order.id,'created','Created',p_created_by,v_now),
    (v_order.id,'deposit_received','Deposit Received',p_created_by,v_now);
  RETURN v_order;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_advance_order_status(
  p_order_id UUID, p_status TEXT, p_remarks TEXT DEFAULT '', p_created_by TEXT DEFAULT NULL
)
RETURNS SETOF public.advance_orders
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_order public.advance_orders;
BEGIN
  SELECT * INTO v_order FROM public.advance_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Advance order % not found', p_order_id;
  END IF;

  IF (v_order.invoice_number IS NOT NULL OR v_order.completed_order_id IS NOT NULL) AND p_status != 'completed' THEN
    RAISE EXCEPTION 'Cannot change status of an order that already has an invoice generated';
  END IF;

  UPDATE public.advance_orders SET
    status     = p_status,
    remarks    = CASE WHEN TRIM(COALESCE(p_remarks,'')) = '' THEN remarks ELSE p_remarks END,
    updated_at = NOW()
  WHERE id = p_order_id;

  INSERT INTO public.advance_order_timeline (advance_order_id, event_type, label, remarks, created_by, created_at)
  VALUES (
    p_order_id,
    p_status,
    CASE p_status
      WHEN 'pending_deposit'       THEN 'Status: Pending Deposit'
      WHEN 'waiting_final_payment' THEN 'Status: Waiting for Final Payment'
      WHEN 'ready_for_delivery'    THEN 'Status: Ready to Collect'
      WHEN 'completed'             THEN 'Order Completed'
      WHEN 'cancelled'             THEN 'Order Cancelled'
      ELSE p_status
    END,
    COALESCE(p_remarks, ''),
    p_created_by,
    NOW()
  );

  RETURN QUERY SELECT * FROM public.advance_orders WHERE id = p_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_advance_order_event(
  p_order_id UUID, p_event_type TEXT, p_label TEXT, p_remarks TEXT DEFAULT '', p_created_by TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.advance_orders WHERE id = p_order_id) THEN
    RAISE EXCEPTION 'Advance order not found';
  END IF;
  INSERT INTO public.advance_order_timeline (advance_order_id, event_type, label, remarks, created_by, created_at)
  VALUES (p_order_id, p_event_type, p_label, COALESCE(p_remarks,''), p_created_by, NOW());
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_advance_order_v2(
  p_order_id UUID,
  p_payment_method TEXT,
  p_final_amount NUMERIC,
  p_coupon_code TEXT DEFAULT NULL,
  p_coupon_percentage NUMERIC DEFAULT 0,
  p_manual_discount NUMERIC DEFAULT 0,
  p_remarks TEXT DEFAULT '',
  p_created_by TEXT DEFAULT NULL
)
RETURNS TABLE(order_id UUID, invoice_no TEXT, completed_at TIMESTAMPTZ)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_advance        public.advance_orders;
  v_order_id       UUID := gen_random_uuid();
  v_invoice        TEXT;
  v_now            TIMESTAMPTZ := NOW();
  v_items          JSONB;
  v_item           JSONB;
  v_total_discount NUMERIC := 0;
BEGIN
  IF LOWER(COALESCE(p_payment_method, '')) NOT IN ('cash', 'upi', 'card') THEN
    RAISE EXCEPTION 'Select a valid payment method';
  END IF;

  SELECT * INTO v_advance FROM public.advance_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Advance order not found';
  END IF;

  IF v_advance.status = 'cancelled' THEN
    RAISE EXCEPTION 'A cancelled order cannot be completed';
  END IF;

  -- Self-healing: if already completed, return the existing result instead of erroring
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

  v_total_discount := p_manual_discount + (v_advance.remaining_balance - p_manual_discount - p_final_amount);
  IF v_total_discount < 0 THEN
    v_total_discount := 0;
  END IF;

  v_invoice := LPAD(NEXTVAL('public.invoice_number_seq')::TEXT, 8, '0');

  v_items := CASE
    WHEN jsonb_typeof(v_advance.products) = 'array' AND jsonb_array_length(v_advance.products) > 0
      THEN v_advance.products
    ELSE jsonb_build_array(
      jsonb_build_object(
        'name',        v_advance.product_name,
        'category',    v_advance.category,
        'description', v_advance.description,
        'quantity',    1,
        'base_price',  v_advance.total_amount,
        'line_total',  v_advance.total_amount,
        'unit',        'piece',
        'unit_type',   'unit',
        'source',      'advance_order'
      )
    )
  END;

  INSERT INTO public.orders (
    id, invoice_no, customer_name, phone, address, user_id,
    items, subtotal, total, status, order_mode, order_type,
    shipping, delivery_charge, discount_amount, manual_discount_amount,
    coupon_code, coupon_percentage, manual_discount_type, manual_discount_value,
    payment_mode, payment_method, created_at, updated_at
  ) VALUES (
    v_order_id, v_invoice,
    v_advance.customer_name, v_advance.phone, v_advance.address, p_created_by,
    v_items, v_advance.total_amount, GREATEST(0, v_advance.total_amount - v_total_discount),
    'completed', 'offline', 'advance_order',
    0, 0, v_total_discount, p_manual_discount,
    p_coupon_code, p_coupon_percentage, 'flat', p_manual_discount,
    LOWER(p_payment_method), LOWER(p_payment_method),
    v_now, v_now
  );

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_items) LOOP
    INSERT INTO public.order_items (
      order_id, product_name, name, quantity, unit, unit_type,
      base_price, line_total, is_manual
    ) VALUES (
      v_order_id,
      COALESCE(NULLIF(TRIM(v_item->>'name'), ''), 'Product'),
      COALESCE(NULLIF(TRIM(v_item->>'name'), ''), 'Product'),
      GREATEST(COALESCE((v_item->>'quantity')::NUMERIC, 1), 0),
      COALESCE(NULLIF(v_item->>'unit', ''), 'piece'),
      COALESCE(NULLIF(v_item->>'unit_type', ''), 'unit'),
      GREATEST(COALESCE((v_item->>'base_price')::NUMERIC, 0), 0),
      GREATEST(COALESCE((v_item->>'line_total')::NUMERIC, 0), 0),
      FALSE
    );
  END LOOP;

  INSERT INTO public.advance_order_payments (
    advance_order_id, payment_type, amount, payment_method, remarks, received_by, received_at
  ) VALUES (
    p_order_id, 'remaining', p_final_amount,
    LOWER(p_payment_method), COALESCE(p_remarks, ''), p_created_by, v_now
  );

  UPDATE public.advance_orders SET
    status               = 'completed',
    completed_at         = v_now,
    completed_order_id   = v_order_id,
    invoice_number       = v_invoice,
    final_payment_method = LOWER(p_payment_method),
    remarks              = CASE WHEN TRIM(COALESCE(p_remarks, '')) = '' THEN remarks ELSE p_remarks END,
    updated_at           = v_now
  WHERE id = p_order_id;

  INSERT INTO public.advance_order_timeline (
    advance_order_id, event_type, label, remarks, created_by, created_at
  ) VALUES
    (p_order_id, 'remaining_payment_received', 'Remaining Payment Received', COALESCE(p_remarks, ''), p_created_by, v_now),
    (p_order_id, 'invoice_generated',          'Invoice Generated',          v_invoice,               p_created_by, v_now);

  RETURN QUERY SELECT v_order_id, v_invoice, v_now;
END;
$$;
