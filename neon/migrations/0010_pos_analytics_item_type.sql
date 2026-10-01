-- 0010_pos_analytics_item_type.sql
-- Fixes POS Analytics classification, multi-tenancy business_id, and deposit recognition

-- 1. Ensure business_id exists on core tables with default '1'
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS business_id TEXT NOT NULL DEFAULT '1';
CREATE INDEX IF NOT EXISTS idx_orders_business ON public.orders(business_id);

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS business_id TEXT NOT NULL DEFAULT '1';
CREATE INDEX IF NOT EXISTS idx_order_items_business ON public.order_items(business_id);

ALTER TABLE public.advance_orders
  ADD COLUMN IF NOT EXISTS business_id TEXT NOT NULL DEFAULT '1';
CREATE INDEX IF NOT EXISTS idx_advance_orders_business ON public.advance_orders(business_id);

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS business_id TEXT NOT NULL DEFAULT '1';
CREATE INDEX IF NOT EXISTS idx_products_business ON public.products(business_id);

ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS business_id TEXT NOT NULL DEFAULT '1';
CREATE INDEX IF NOT EXISTS idx_coupons_business ON public.coupons(business_id);

-- 2. Add item_type NOT NULL with CHECK constraint to order_items
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS item_type TEXT NOT NULL DEFAULT 'product' CHECK (item_type IN ('product', 'service'));
CREATE INDEX IF NOT EXISTS idx_order_items_item_type ON public.order_items(item_type);

-- 3. Idempotent Backfill:
-- Step 3a: fill item_type from products catalog join
UPDATE public.order_items oi
SET item_type = p.item_type
FROM public.products p
WHERE oi.product_id = p.id;

-- Step 3b: fill item_type by product name match if product_id was NULL
UPDATE public.order_items oi
SET item_type = p.item_type,
    product_id = COALESCE(oi.product_id, p.id),
    category = COALESCE(oi.category, p.category)
FROM public.products p
WHERE oi.product_id IS NULL AND LOWER(TRIM(oi.name)) = LOWER(TRIM(p.name));

-- Step 3c: Service keywords in item name or category
UPDATE public.order_items oi
SET item_type = 'service'
WHERE oi.item_type != 'service'
  AND (
    oi.name ILIKE '%service%' OR oi.name ILIKE '%tailor%' OR oi.name ILIKE '%stitch%' OR oi.name ILIKE '%alteration%'
    OR COALESCE(oi.category, '') ILIKE '%service%' OR COALESCE(oi.category, '') ILIKE '%tailor%' OR COALESCE(oi.category, '') ILIKE '%stitch%'
  );

-- 4. Shared View for Revenue and Line-Item Analytics
CREATE OR REPLACE VIEW public.v_analytics_line_items AS
SELECT
  oi.id AS line_item_id,
  oi.order_id,
  o.business_id,
  o.invoice_no,
  o.created_at AS order_created_at,
  o.billing_date,
  o.status AS order_status,
  o.order_type,
  o.order_mode,
  o.payment_method,
  o.payment_mode,
  o.payments,
  o.change_given,
  o.delivery_charge,
  o.total_gst,
  o.coupon_code,
  o.discount_amount AS order_discount_amount,
  o.manual_discount_amount AS order_manual_discount_amount,
  o.total AS order_total,
  o.subtotal AS order_subtotal,
  oi.product_id,
  COALESCE(NULLIF(TRIM(oi.product_name), ''), NULLIF(TRIM(oi.name), ''), 'Product') AS item_name,
  oi.variant_name,
  COALESCE(NULLIF(TRIM(oi.category), ''), 'Uncategorized') AS category,
  oi.quantity,
  oi.unit_price,
  oi.line_total AS gross_revenue,
  CASE
    WHEN COALESCE(o.subtotal, 0) > 0 AND (COALESCE(o.discount_amount, 0) + COALESCE(o.manual_discount_amount, 0)) > 0
      THEN ROUND((oi.line_total / o.subtotal) * LEAST(COALESCE(o.discount_amount, 0) + COALESCE(o.manual_discount_amount, 0), o.subtotal), 2)
    ELSE 0
  END AS discount_share,
  GREATEST(0, oi.line_total - (
    CASE
      WHEN COALESCE(o.subtotal, 0) > 0 AND (COALESCE(o.discount_amount, 0) + COALESCE(o.manual_discount_amount, 0)) > 0
        THEN ROUND((oi.line_total / o.subtotal) * LEAST(COALESCE(o.discount_amount, 0) + COALESCE(o.manual_discount_amount, 0), o.subtotal), 2)
      ELSE 0
    END
  )) AS net_revenue,
  oi.item_type,
  oi.is_manual
FROM public.order_items oi
JOIN public.orders o ON oi.order_id = o.id
WHERE o.status = 'completed' AND o.order_type != 'online_request';

-- 5. Update complete_pos_sale_with_inventory to persist item_type and track coupons
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
  v_item_type TEXT;
  v_clean_coupon TEXT;
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
  v_clean_coupon := NULLIF(TRIM(COALESCE(p_coupon_code, '')), '');

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
    COALESCE(p_manual_discount_value, 0), v_clean_coupon,
    COALESCE(p_coupon_percentage, 0), COALESCE(p_total_gst, 0),
    COALESCE(p_total_gst, 0), COALESCE(p_gst_enabled, FALSE),
    COALESCE(p_payment_method, 'cash'), COALESCE(p_payment_method, 'cash'),
    COALESCE(p_split_details, '{}'::JSONB), COALESCE(p_remarks, ''),
    COALESCE(p_reference_number, ''), p_billing_date, v_created_at, NOW()
  )
  RETURNING id INTO v_order_id;

  -- 4. Increment coupon usage count if applied
  IF v_clean_coupon IS NOT NULL THEN
    UPDATE public.coupons
    SET usage_count = usage_count + 1, updated_at = NOW()
    WHERE LOWER(TRIM(code)) = LOWER(v_clean_coupon);
  END IF;

  -- 5. Insert order items with explicit item_type
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

    -- Resolve item_type: payload → catalog product → default 'product'.
    -- NEVER fall back to keyword matching — classification is determined solely
    -- by the item_type saved in the products catalog record.
    v_item_type := LOWER(TRIM(COALESCE(v_item ->> 'item_type', '')));
    IF v_item_type NOT IN ('product', 'service') THEN
      IF v_product_id IS NOT NULL THEN
        SELECT item_type INTO v_item_type FROM public.products WHERE id = v_product_id;
      END IF;
      -- If still missing (manual/unregistered item), default to 'product'.
      -- Do NOT keyword-match against the name or category.
      IF v_item_type IS NULL OR v_item_type NOT IN ('product', 'service') THEN
        v_item_type := 'product';
      END IF;
    END IF;

    INSERT INTO public.order_items (
      order_id, product_id, variant_id, product_name, name,
      product_tamil_name, tamil_name, quantity, unit, unit_type,
      base_quantity, base_price, unit_price, line_total, image_url,
      is_manual, discount, gst_amount, gst_rate, variant_name,
      source, note, category, item_type, created_at
    )
    VALUES (
      v_order_id, v_product_id, v_variant_id, v_product_name, v_product_name,
      v_name_ta, v_name_ta, v_quantity, v_unit, v_unit_type,
      v_base_quantity, v_unit_price, v_unit_price, v_line_total, v_image_url,
      v_is_manual, v_discount, v_gst_amount, v_gst_rate, v_variant_name,
      v_source, v_note, v_category, v_item_type, v_created_at
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
          'order', v_invoice_no, 'POS Sale'
        );
      ELSIF v_product_id IS NOT NULL THEN
        SELECT stock_quantity INTO v_current_stock FROM public.products WHERE id = v_product_id;
        SELECT id INTO v_barcode_id FROM public.barcode_registry WHERE product_id = v_product_id AND variant_id IS NULL AND is_active = TRUE LIMIT 1;

        UPDATE public.products
        SET stock_quantity = GREATEST(0, stock_quantity - v_quantity),
            stock = FLOOR(GREATEST(0, stock_quantity - v_quantity))::INTEGER,
            updated_at = NOW()
        WHERE id = v_product_id;

        INSERT INTO public.inventory_movements (
          product_id, barcode_id, movement_type,
          quantity_delta, quantity_before, quantity_after,
          reference_type, reference_id, note
        )
        VALUES (
          v_product_id, v_barcode_id, 'SALE',
          -v_quantity, v_current_stock, GREATEST(0, v_current_stock - v_quantity),
          'order', v_invoice_no, 'POS Sale'
        );
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'invoice_no', v_invoice_no,
    'total', v_total
  );
END;
$$;

-- 6. Update complete_advance_order_v2 to persist product_id, category, and item_type into order_items
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
  v_clean_coupon   TEXT;
  v_item_type      TEXT;
  v_product_id     BIGINT;
  v_category       TEXT;
  v_name           TEXT;
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

  -- Self-healing: if already completed, return existing result
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
  v_clean_coupon := NULLIF(TRIM(COALESCE(p_coupon_code, '')), '');

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
    v_clean_coupon, p_coupon_percentage, 'flat', p_manual_discount,
    LOWER(p_payment_method), LOWER(p_payment_method),
    v_now, v_now
  );

  -- Increment coupon count if used
  IF v_clean_coupon IS NOT NULL THEN
    UPDATE public.coupons
    SET usage_count = usage_count + 1, updated_at = NOW()
    WHERE LOWER(TRIM(code)) = LOWER(v_clean_coupon);
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_items) LOOP
    v_product_id := NULLIF(v_item ->> 'product_id', '')::BIGINT;
    v_name := COALESCE(NULLIF(TRIM(v_item->>'name'), ''), 'Product');
    v_category := COALESCE(NULLIF(TRIM(v_item->>'category'), ''), NULLIF(TRIM(v_advance.category), ''), 'Uncategorized');

    -- Resolve item_type: payload → catalog product (by id, then by name) → default 'product'.
    -- NEVER fall back to keyword matching — classification is determined solely
    -- by the item_type saved in the products catalog record.
    v_item_type := LOWER(TRIM(COALESCE(v_item ->> 'item_type', '')));
    IF v_item_type NOT IN ('product', 'service') THEN
      IF v_product_id IS NOT NULL THEN
        SELECT item_type INTO v_item_type FROM public.products WHERE id = v_product_id;
      END IF;
      IF v_item_type IS NULL OR v_item_type NOT IN ('product', 'service') THEN
        SELECT item_type INTO v_item_type FROM public.products WHERE LOWER(TRIM(name)) = LOWER(TRIM(v_name)) LIMIT 1;
      END IF;
      -- If still missing (manual/unregistered item), default to 'product'.
      -- Do NOT keyword-match against the name or category.
      IF v_item_type IS NULL OR v_item_type NOT IN ('product', 'service') THEN
        v_item_type := 'product';
      END IF;
    END IF;

    INSERT INTO public.order_items (
      order_id, product_id, product_name, name, category, quantity, unit, unit_type,
      base_price, line_total, is_manual, source, item_type
    ) VALUES (
      v_order_id,
      v_product_id,
      v_name,
      v_name,
      v_category,
      GREATEST(COALESCE((v_item->>'quantity')::NUMERIC, 1), 0),
      COALESCE(NULLIF(v_item->>'unit', ''), 'piece'),
      COALESCE(NULLIF(v_item->>'unit_type', ''), 'unit'),
      GREATEST(COALESCE((v_item->>'base_price')::NUMERIC, 0), 0),
      GREATEST(COALESCE((v_item->>'line_total')::NUMERIC, 0), 0),
      FALSE,
      'advance_order',
      v_item_type
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
