-- ============================================================================
-- MIGRATION: 0011_hard_delete_infrastructure.sql
-- Transactional Hard Delete infrastructure, audit backups, cascade rules, and RPCs
-- ============================================================================

-- 1. Create delete_backups audit table
CREATE TABLE IF NOT EXISTS public.delete_backups (
  id BIGSERIAL PRIMARY KEY,
  business_id TEXT NOT NULL DEFAULT '1',
  entity_type TEXT NOT NULL,         -- 'order', 'advance_order', 'product', 'variant', 'category', 'coupon', 'movement'
  entity_id TEXT NOT NULL,
  entity_identifier TEXT,            -- invoice_no, deposit_id, product_name, coupon_code, etc.
  deleted_by TEXT NOT NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  backup_data JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_delete_backups_biz ON public.delete_backups (business_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_delete_backups_date ON public.delete_backups (deleted_at DESC);

-- 2. Adjust Foreign Keys on barcode_registry so products and variants cascade
ALTER TABLE public.barcode_registry
  DROP CONSTRAINT IF EXISTS barcode_registry_product_id_fkey,
  DROP CONSTRAINT IF EXISTS barcode_registry_variant_id_fkey;

ALTER TABLE public.barcode_registry
  ADD CONSTRAINT barcode_registry_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE,
  ADD CONSTRAINT barcode_registry_variant_id_fkey
    FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE CASCADE;

-- 3. Adjust Foreign Keys on inventory_movements
ALTER TABLE public.inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_barcode_id_fkey,
  DROP CONSTRAINT IF EXISTS inventory_movements_product_id_fkey,
  DROP CONSTRAINT IF EXISTS inventory_movements_variant_id_fkey;

ALTER TABLE public.inventory_movements
  ADD CONSTRAINT inventory_movements_barcode_id_fkey
    FOREIGN KEY (barcode_id) REFERENCES public.barcode_registry(id) ON DELETE SET NULL,
  ADD CONSTRAINT inventory_movements_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE,
  ADD CONSTRAINT inventory_movements_variant_id_fkey
    FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE CASCADE;

-- ============================================================================
-- RPC: hard_delete_order
-- ============================================================================
CREATE OR REPLACE FUNCTION public.hard_delete_order(
  p_order_id UUID,
  p_business_id TEXT,
  p_user_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_items JSONB;
  v_movements JSONB;
  v_backup JSONB;
  v_inv_no TEXT;
  v_restored_stock NUMERIC := 0;
  v_items_count INT := 0;
  v_payments_count INT := 0;
BEGIN
  -- 1. Fetch order and verify business_id
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id AND (business_id = p_business_id OR p_business_id IS NULL OR p_business_id = '1');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found or not authorized for deletion', p_order_id;
  END IF;

  v_inv_no := v_order.invoice_no;

  -- 2. Restore inventory stock for non-manual product items (services have no stock effect)
  FOR v_item IN
    SELECT product_id, variant_id, quantity, is_manual, item_type
    FROM public.order_items
    WHERE order_id = p_order_id
  LOOP
    v_items_count := v_items_count + 1;
    IF NOT COALESCE(v_item.is_manual, FALSE) AND v_item.quantity > 0 AND COALESCE(v_item.item_type, 'product') <> 'service' THEN
      v_restored_stock := v_restored_stock + v_item.quantity;
      IF v_item.variant_id IS NOT NULL THEN
        UPDATE public.product_variants
        SET stock = stock + v_item.quantity, updated_at = NOW()
        WHERE id = v_item.variant_id;

        UPDATE public.products
        SET stock_quantity = (SELECT COALESCE(SUM(stock), 0) FROM public.product_variants WHERE product_id = v_item.product_id),
            stock = FLOOR((SELECT COALESCE(SUM(stock), 0) FROM public.product_variants WHERE product_id = v_item.product_id))::INTEGER,
            updated_at = NOW()
        WHERE id = v_item.product_id;
      ELSIF v_item.product_id IS NOT NULL THEN
        UPDATE public.products
        SET stock_quantity = stock_quantity + v_item.quantity,
            stock = FLOOR(stock_quantity + v_item.quantity)::INTEGER,
            updated_at = NOW()
        WHERE id = v_item.product_id;
      END IF;
    END IF;
  END LOOP;

  -- Count payments
  IF v_order.payments IS NOT NULL AND jsonb_typeof(v_order.payments) = 'array' THEN
    v_payments_count := jsonb_array_length(v_order.payments);
  ELSIF v_order.payment_method IS NOT NULL THEN
    v_payments_count := 1;
  END IF;

  -- 3. Collect audit backup snapshot
  SELECT jsonb_agg(row_to_json(oi)) INTO v_items FROM public.order_items oi WHERE oi.order_id = p_order_id;
  SELECT jsonb_agg(row_to_json(im)) INTO v_movements FROM public.inventory_movements im WHERE im.reference_type = 'order' AND (im.reference_id = v_inv_no OR im.reference_id = p_order_id::TEXT);

  v_backup := jsonb_build_object(
    'order', row_to_json(v_order),
    'items', COALESCE(v_items, '[]'::jsonb),
    'movements', COALESCE(v_movements, '[]'::jsonb)
  );

  INSERT INTO public.delete_backups (business_id, entity_type, entity_id, entity_identifier, deleted_by, backup_data)
  VALUES (COALESCE(p_business_id, '1'), 'order', p_order_id::TEXT, v_inv_no, p_user_name, v_backup);

  -- 4. Delete inventory ledger entries for this order
  DELETE FROM public.inventory_movements
  WHERE reference_type = 'order' AND (reference_id = v_inv_no OR reference_id = p_order_id::TEXT);

  -- 5. Decrement coupon usage if applied
  IF v_order.coupon_code IS NOT NULL AND TRIM(v_order.coupon_code) <> '' THEN
    UPDATE public.coupons
    SET usage_count = GREATEST(0, usage_count - 1), updated_at = NOW()
    WHERE LOWER(TRIM(code)) = LOWER(TRIM(v_order.coupon_code));
  END IF;

  -- 6. Unlink any advance orders connected to this completed order
  UPDATE public.advance_orders
  SET completed_order_id = NULL, invoice_number = NULL, updated_at = NOW()
  WHERE completed_order_id = p_order_id;

  -- 7. Permanently delete order (order_items cascade automatically)
  DELETE FROM public.orders WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_order_id', p_order_id,
    'invoice_no', v_inv_no,
    'customer_name', v_order.customer_name,
    'total_amount', v_order.total,
    'restored_stock', v_restored_stock,
    'items_count', v_items_count,
    'payments_count', v_payments_count,
    'backup', v_backup
  );
END;
$$;

-- ============================================================================
-- RPC: hard_delete_advance_order
-- ============================================================================
CREATE OR REPLACE FUNCTION public.hard_delete_advance_order(
  p_advance_order_id UUID,
  p_business_id TEXT,
  p_user_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_adv RECORD;
  v_payments JSONB;
  v_timeline JSONB;
  v_backup JSONB;
  v_completed_deleted JSONB := NULL;
BEGIN
  -- 1. Fetch advance order
  SELECT * INTO v_adv
  FROM public.advance_orders
  WHERE id = p_advance_order_id AND (business_id = p_business_id OR p_business_id IS NULL OR p_business_id = '1');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Advance order % not found or not authorized for deletion', p_advance_order_id;
  END IF;

  -- 2. If it has a completed order in orders table, delete that completed order first
  IF v_adv.completed_order_id IS NOT NULL THEN
    BEGIN
      v_completed_deleted := public.hard_delete_order(v_adv.completed_order_id, p_business_id, p_user_name);
    EXCEPTION WHEN OTHERS THEN
      -- If completed order was already deleted, ignore
      NULL;
    END;
  END IF;

  -- 3. Collect audit backup
  SELECT jsonb_agg(row_to_json(aop)) INTO v_payments FROM public.advance_order_payments aop WHERE aop.advance_order_id = p_advance_order_id;
  SELECT jsonb_agg(row_to_json(aot)) INTO v_timeline FROM public.advance_order_timeline aot WHERE aot.advance_order_id = p_advance_order_id;

  v_backup := jsonb_build_object(
    'advance_order', row_to_json(v_adv),
    'payments', COALESCE(v_payments, '[]'::jsonb),
    'timeline', COALESCE(v_timeline, '[]'::jsonb),
    'completed_order_deletion', v_completed_deleted
  );

  INSERT INTO public.delete_backups (business_id, entity_type, entity_id, entity_identifier, deleted_by, backup_data)
  VALUES (COALESCE(p_business_id, '1'), 'advance_order', p_advance_order_id::TEXT, v_adv.deposit_id, p_user_name, v_backup);

  -- 4. Delete advance order (cascades advance_order_payments and advance_order_timeline)
  DELETE FROM public.advance_orders WHERE id = p_advance_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_advance_order_id', p_advance_order_id,
    'deposit_id', v_adv.deposit_id,
    'customer_name', v_adv.customer_name,
    'deposit_amount', v_adv.deposit_amount,
    'total_amount', v_adv.total_amount,
    'completed_order_deleted', v_completed_deleted IS NOT NULL,
    'backup', v_backup
  );
END;
$$;

-- ============================================================================
-- RPC: preview_delete_product
-- ============================================================================
CREATE OR REPLACE FUNCTION public.preview_delete_product(
  p_product_id BIGINT,
  p_business_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_prod RECORD;
  v_orders_count INT := 0;
  v_total_amount NUMERIC := 0;
  v_variants_count INT := 0;
  v_barcodes_count INT := 0;
  v_movements_count INT := 0;
  v_affected_invoices JSONB;
BEGIN
  SELECT * INTO v_prod FROM public.products WHERE id = p_product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product % not found', p_product_id;
  END IF;

  SELECT COUNT(DISTINCT o.id), COALESCE(SUM(oi.line_total), 0), jsonb_agg(DISTINCT o.invoice_no)
  INTO v_orders_count, v_total_amount, v_affected_invoices
  FROM public.order_items oi
  JOIN public.orders o ON oi.order_id = o.id
  WHERE oi.product_id = p_product_id;

  SELECT COUNT(*) INTO v_variants_count FROM public.product_variants WHERE product_id = p_product_id;
  SELECT COUNT(*) INTO v_barcodes_count FROM public.barcode_registry WHERE product_id = p_product_id;
  SELECT COUNT(*) INTO v_movements_count FROM public.inventory_movements WHERE product_id = p_product_id;

  RETURN jsonb_build_object(
    'product_id', p_product_id,
    'product_name', v_prod.name,
    'item_type', v_prod.item_type,
    'stock_quantity', v_prod.stock_quantity,
    'price', v_prod.price,
    'orders_count', v_orders_count,
    'total_amount_affected', v_total_amount,
    'affected_invoices', COALESCE(v_affected_invoices, '[]'::jsonb),
    'variants_count', v_variants_count,
    'barcodes_count', v_barcodes_count,
    'movements_count', v_movements_count
  );
END;
$$;

-- ============================================================================
-- RPC: hard_delete_product
-- ============================================================================
CREATE OR REPLACE FUNCTION public.hard_delete_product(
  p_product_id BIGINT,
  p_business_id TEXT,
  p_user_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_prod RECORD;
  v_order_rec RECORD;
  v_items JSONB;
  v_variants JSONB;
  v_barcodes JSONB;
  v_movements JSONB;
  v_backup JSONB;
  v_affected_bills_count INT := 0;
  v_deleted_bills_count INT := 0;
  v_remaining_items_count INT;
  v_new_subtotal NUMERIC;
  v_new_discount NUMERIC;
  v_new_gst NUMERIC;
  v_new_total NUMERIC;
BEGIN
  -- 1. Fetch product
  SELECT * INTO v_prod
  FROM public.products
  WHERE id = p_product_id AND (business_id = p_business_id OR p_business_id IS NULL OR p_business_id = '1');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product % not found or not authorized for deletion', p_product_id;
  END IF;

  -- 2. Collect audit snapshot
  SELECT jsonb_agg(row_to_json(pv)) INTO v_variants FROM public.product_variants pv WHERE pv.product_id = p_product_id;
  SELECT jsonb_agg(row_to_json(br)) INTO v_barcodes FROM public.barcode_registry br WHERE br.product_id = p_product_id;
  SELECT jsonb_agg(row_to_json(im)) INTO v_movements FROM public.inventory_movements im WHERE im.product_id = p_product_id;

  v_backup := jsonb_build_object(
    'product', row_to_json(v_prod),
    'variants', COALESCE(v_variants, '[]'::jsonb),
    'barcodes', COALESCE(v_barcodes, '[]'::jsonb),
    'movements', COALESCE(v_movements, '[]'::jsonb)
  );

  INSERT INTO public.delete_backups (business_id, entity_type, entity_id, entity_identifier, deleted_by, backup_data)
  VALUES (COALESCE(p_business_id, '1'), 'product', p_product_id::TEXT, v_prod.name, p_user_name, v_backup);

  -- 3. Handle past sales / order_items containing this product
  FOR v_order_rec IN
    SELECT DISTINCT o.id, o.invoice_no, o.total, o.subtotal, o.delivery_charge
    FROM public.orders o
    JOIN public.order_items oi ON oi.order_id = o.id
    WHERE oi.product_id = p_product_id
  LOOP
    v_affected_bills_count := v_affected_bills_count + 1;

    -- Remove line items for this product
    DELETE FROM public.order_items
    WHERE order_id = v_order_rec.id AND product_id = p_product_id;

    -- Check how many items remain in the order
    SELECT COUNT(*) INTO v_remaining_items_count FROM public.order_items WHERE order_id = v_order_rec.id;

    IF v_remaining_items_count = 0 THEN
      -- If order has no other items left, delete the order completely!
      PERFORM public.hard_delete_order(v_order_rec.id, p_business_id, p_user_name);
      v_deleted_bills_count := v_deleted_bills_count + 1;
    ELSE
      -- Recalculate bill subtotal, gst, and total
      SELECT COALESCE(SUM(line_total), 0), COALESCE(SUM(gst_amount), 0)
      INTO v_new_subtotal, v_new_gst
      FROM public.order_items
      WHERE order_id = v_order_rec.id;

      v_new_total := GREATEST(0, v_new_subtotal + COALESCE(v_order_rec.delivery_charge, 0));

      -- Update order totals and payment records
      UPDATE public.orders
      SET subtotal = v_new_subtotal,
          total_gst = v_new_gst,
          total = v_new_total,
          items = (SELECT jsonb_agg(row_to_json(oi)) FROM public.order_items oi WHERE oi.order_id = v_order_rec.id),
          payments = jsonb_build_array(jsonb_build_object('mode', COALESCE(payment_mode, 'cash'), 'amount', v_new_total)),
          updated_at = NOW()
      WHERE id = v_order_rec.id;
    END IF;
  END LOOP;

  -- 4. Delete inventory movements for this product
  DELETE FROM public.inventory_movements WHERE product_id = p_product_id;

  -- 5. Delete barcode registry entries for this product
  DELETE FROM public.barcode_registry WHERE product_id = p_product_id;

  -- 6. Delete variants
  DELETE FROM public.product_variants WHERE product_id = p_product_id;

  -- 7. Permanently delete the catalog row
  DELETE FROM public.products WHERE id = p_product_id;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_product_id', p_product_id,
    'product_name', v_prod.name,
    'affected_bills_count', v_affected_bills_count,
    'deleted_bills_count', v_deleted_bills_count,
    'backup', v_backup
  );
END;
$$;

-- ============================================================================
-- RPC: hard_delete_variant
-- ============================================================================
CREATE OR REPLACE FUNCTION public.hard_delete_variant(
  p_variant_id UUID,
  p_business_id TEXT,
  p_user_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_var RECORD;
  v_backup JSONB;
BEGIN
  SELECT * INTO v_var FROM public.product_variants WHERE id = p_variant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Variant % not found', p_variant_id;
  END IF;

  v_backup := row_to_json(v_var);

  INSERT INTO public.delete_backups (business_id, entity_type, entity_id, entity_identifier, deleted_by, backup_data)
  VALUES (COALESCE(p_business_id, '1'), 'variant', p_variant_id::TEXT, v_var.variant_name, p_user_name, v_backup);

  DELETE FROM public.inventory_movements WHERE variant_id = p_variant_id;
  DELETE FROM public.barcode_registry WHERE variant_id = p_variant_id;
  DELETE FROM public.order_items WHERE variant_id = p_variant_id;
  DELETE FROM public.product_variants WHERE id = p_variant_id;

  -- Update parent product stock and variant count
  UPDATE public.products
  SET stock_quantity = (SELECT COALESCE(SUM(stock), 0) FROM public.product_variants WHERE product_id = v_var.product_id),
      stock = FLOOR((SELECT COALESCE(SUM(stock), 0) FROM public.product_variants WHERE product_id = v_var.product_id))::INTEGER,
      has_variants = ((SELECT COUNT(*) FROM public.product_variants WHERE product_id = v_var.product_id) > 0),
      updated_at = NOW()
  WHERE id = v_var.product_id;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_variant_id', p_variant_id,
    'variant_name', v_var.variant_name,
    'backup', v_backup
  );
END;
$$;

-- ============================================================================
-- RPC: hard_delete_category
-- ============================================================================
CREATE OR REPLACE FUNCTION public.hard_delete_category(
  p_category_id BIGINT,
  p_business_id TEXT,
  p_user_name TEXT,
  p_force BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_cat RECORD;
  v_prod RECORD;
  v_prods_count INT := 0;
  v_deleted_prods_count INT := 0;
  v_backup JSONB;
BEGIN
  SELECT * INTO v_cat FROM public.categories WHERE id = p_category_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Category % not found', p_category_id;
  END IF;

  SELECT COUNT(*) INTO v_prods_count FROM public.products WHERE category_id = p_category_id;

  IF v_prods_count > 0 AND NOT p_force THEN
    RAISE EXCEPTION 'Category contains % products. Provide force=true to delete items.', v_prods_count;
  END IF;

  v_backup := jsonb_build_object(
    'category', row_to_json(v_cat),
    'products_count', v_prods_count
  );

  INSERT INTO public.delete_backups (business_id, entity_type, entity_id, entity_identifier, deleted_by, backup_data)
  VALUES (COALESCE(p_business_id, '1'), 'category', p_category_id::TEXT, v_cat.name_en, p_user_name, v_backup);

  IF p_force AND v_prods_count > 0 THEN
    FOR v_prod IN SELECT id FROM public.products WHERE category_id = p_category_id
    LOOP
      PERFORM public.hard_delete_product(v_prod.id, p_business_id, p_user_name);
      v_deleted_prods_count := v_deleted_prods_count + 1;
    END LOOP;
  END IF;

  DELETE FROM public.categories WHERE id = p_category_id;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_category_id', p_category_id,
    'name_en', v_cat.name_en,
    'deleted_products_count', v_deleted_prods_count,
    'backup', v_backup
  );
END;
$$;

-- ============================================================================
-- RPC: hard_delete_coupon
-- ============================================================================
CREATE OR REPLACE FUNCTION public.hard_delete_coupon(
  p_coupon_id BIGINT,
  p_business_id TEXT,
  p_user_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_coupon RECORD;
  v_backup JSONB;
BEGIN
  SELECT * INTO v_coupon FROM public.coupons WHERE id = p_coupon_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Coupon % not found', p_coupon_id;
  END IF;

  v_backup := row_to_json(v_coupon);

  INSERT INTO public.delete_backups (business_id, entity_type, entity_id, entity_identifier, deleted_by, backup_data)
  VALUES (COALESCE(p_business_id, '1'), 'coupon', p_coupon_id::TEXT, v_coupon.code, p_user_name, v_backup);

  DELETE FROM public.coupons WHERE id = p_coupon_id;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_coupon_id', p_coupon_id,
    'code', v_coupon.code,
    'backup', v_backup
  );
END;
$$;

-- ============================================================================
-- RPC: hard_delete_inventory_movement
-- ============================================================================
CREATE OR REPLACE FUNCTION public.hard_delete_inventory_movement(
  p_movement_id BIGINT,
  p_business_id TEXT,
  p_user_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_mov RECORD;
  v_backup JSONB;
  v_reverse_delta NUMERIC;
BEGIN
  SELECT * INTO v_mov FROM public.inventory_movements WHERE id = p_movement_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Movement % not found', p_movement_id;
  END IF;

  v_backup := row_to_json(v_mov);

  INSERT INTO public.delete_backups (business_id, entity_type, entity_id, entity_identifier, deleted_by, backup_data)
  VALUES (COALESCE(p_business_id, '1'), 'movement', p_movement_id::TEXT, v_mov.movement_type, p_user_name, v_backup);

  -- Reverse effect on stock quantity
  -- If movement was RESTOCK with +10, reverse is -10.
  -- If movement was SALE with -5, reverse is +5.
  v_reverse_delta := -1 * COALESCE(v_mov.quantity_delta, 0);

  IF v_reverse_delta <> 0 THEN
    IF v_mov.variant_id IS NOT NULL THEN
      UPDATE public.product_variants
      SET stock = GREATEST(0, stock + v_reverse_delta), updated_at = NOW()
      WHERE id = v_mov.variant_id;

      UPDATE public.products
      SET stock_quantity = (SELECT COALESCE(SUM(stock), 0) FROM public.product_variants WHERE product_id = v_mov.product_id),
          stock = FLOOR((SELECT COALESCE(SUM(stock), 0) FROM public.product_variants WHERE product_id = v_mov.product_id))::INTEGER,
          updated_at = NOW()
      WHERE id = v_mov.product_id;
    ELSIF v_mov.product_id IS NOT NULL THEN
      UPDATE public.products
      SET stock_quantity = GREATEST(0, stock_quantity + v_reverse_delta),
          stock = FLOOR(GREATEST(0, stock_quantity + v_reverse_delta))::INTEGER,
          updated_at = NOW()
      WHERE id = v_mov.product_id;
    END IF;
  END IF;

  DELETE FROM public.inventory_movements WHERE id = p_movement_id;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_movement_id', p_movement_id,
    'reversed_delta', v_reverse_delta,
    'backup', v_backup
  );
END;
$$;
