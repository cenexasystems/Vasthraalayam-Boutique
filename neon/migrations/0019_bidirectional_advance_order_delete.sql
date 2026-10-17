-- ============================================================================
-- Migration: 0019_bidirectional_advance_order_delete.sql
-- Description: Ensure deleting an advance order completely removes its linked
--              completed order/invoice from orders table (by completed_order_id
--              and invoice_number), and deleting an advance invoice also cleans
--              up the advance_order record.
-- ============================================================================

-- 1. Update hard_delete_advance_order to purge linked invoice by completed_order_id AND invoice_number
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
  v_backup_id BIGINT;
  v_linked_ord RECORD;
BEGIN
  -- 1. Fetch advance order
  SELECT * INTO v_adv
  FROM public.advance_orders
  WHERE id = p_advance_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Advance order % not found', p_advance_order_id;
  END IF;

  IF NOT (v_adv.business_id = p_business_id OR v_adv.business_id IS NULL OR p_business_id IS NULL OR p_business_id = '1') THEN
    RAISE EXCEPTION 'Not authorized to delete advance order %', p_advance_order_id;
  END IF;

  -- 2. If it has a completed order in orders table, delete that completed order first
  IF v_adv.completed_order_id IS NOT NULL THEN
    BEGIN
      v_completed_deleted := public.hard_delete_order(v_adv.completed_order_id, p_business_id, p_user_name);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  -- Also check if an order exists with invoice_no = v_adv.invoice_number
  IF v_adv.invoice_number IS NOT NULL AND TRIM(v_adv.invoice_number) <> '' THEN
    FOR v_linked_ord IN SELECT id FROM public.orders WHERE invoice_no = v_adv.invoice_number LOOP
      BEGIN
        v_completed_deleted := public.hard_delete_order(v_linked_ord.id, p_business_id, p_user_name);
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END LOOP;
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
  VALUES (COALESCE(p_business_id, '1'), 'advance_order', p_advance_order_id::TEXT, v_adv.deposit_id, p_user_name, v_backup)
  RETURNING id INTO v_backup_id;

  -- 4. Delete advance order (cascades advance_order_payments and advance_order_timeline)
  DELETE FROM public.advance_orders WHERE id = p_advance_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'backup_id', v_backup_id,
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

-- 2. Update hard_delete_order to also delete the linked advance order when an advance invoice is deleted
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

  -- 2. Restore inventory stock for non-manual product items
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

  -- 6. Also delete any advance orders connected to this completed order
  DELETE FROM public.advance_orders
  WHERE completed_order_id = p_order_id
     OR (v_inv_no IS NOT NULL AND TRIM(v_inv_no) <> '' AND invoice_number = v_inv_no);

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
