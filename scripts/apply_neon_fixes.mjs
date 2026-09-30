/**
 * APPROVED FIX SCRIPT — Applies all approved DB-side fixes to Neon.
 * Run: node scripts/apply_neon_fixes.mjs
 *
 * Fixes applied:
 *  F1 — Create barcode_registry + inventory_movements tables
 *  F2 — Deploy complete_pos_sale_with_inventory function
 *  F5 — Fix store_settings (correct business name/address/phone)
 *  F6 — Add orders.tailor_name column
 *       Add products.item_type column (needed for service classification)
 *  F7 — Seed categories table (Unregistered + derive from products)
 *       Add missing store_settings columns (theme_color, shop_contact_number, etc.)
 */
import postgres from 'postgres'

const DATABASE_URL = process.env.DATABASE_URL ||
  'postgresql://neondb_owner:npg_UdsjJ0W1PahI@ep-crimson-frog-aytuz9ib-pooler.c-5.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require'

const sql = postgres(DATABASE_URL, { max: 2, connect_timeout: 10, onnotice: () => {} })

async function step(name, fn) {
  process.stdout.write(`  ${name} ... `)
  try {
    const result = await fn()
    console.log('✓' + (result ? ` (${result})` : ''))
  } catch (err) {
    console.log(`✗ ERROR: ${err.message.split('\n')[0]}`)
    throw err
  }
}

async function run() {
  console.log('\n═══════════════════════════════════════════════════════')
  console.log('  VASTHRAALAYAM BOUTIQUE — Applying Approved Neon Fixes')
  console.log('═══════════════════════════════════════════════════════\n')

  // ── FIX F6a: orders.tailor_name ──────────────────────────────────────────
  console.log('── F6a: Add orders.tailor_name ─────────────────────────')
  await step('ALTER TABLE orders ADD COLUMN tailor_name', async () => {
    await sql`ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tailor_name TEXT NOT NULL DEFAULT ''`
    return 'done'
  })

  // ── FIX F6b: products.item_type (for service classification) ─────────────
  console.log('── F6b: Add products.item_type ─────────────────────────')
  await step('ALTER TABLE products ADD COLUMN item_type', async () => {
    await sql`ALTER TABLE public.products ADD COLUMN IF NOT EXISTS item_type TEXT NOT NULL DEFAULT 'product'`
    return 'done'
  })

  // ── FIX F7a: store_settings — expand columns (theme_color, contacts, etc) ─
  console.log('── F7a: Expand store_settings columns ──────────────────')
  await step('ADD COLUMN theme_color', async () => {
    await sql`ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS theme_color TEXT NOT NULL DEFAULT '#2c392a'`
    return 'done'
  })
  await step('ADD COLUMN business_type', async () => {
    await sql`ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS business_type TEXT NOT NULL DEFAULT ''`
    return 'done'
  })
  await step('ADD COLUMN shop_contact_number', async () => {
    await sql`ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS shop_contact_number TEXT NOT NULL DEFAULT ''`
    return 'done'
  })
  await step('ADD COLUMN instagram_id', async () => {
    await sql`ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS instagram_id TEXT NOT NULL DEFAULT ''`
    return 'done'
  })
  await step('ADD COLUMN logo_url', async () => {
    await sql`ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS logo_url TEXT NOT NULL DEFAULT ''`
    return 'done'
  })
  await step('ADD COLUMN low_stock_threshold', async () => {
    await sql`ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS low_stock_threshold INT NOT NULL DEFAULT 5`
    return 'done'
  })
  await step('ADD COLUMN expiry_alert_days', async () => {
    await sql`ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS expiry_alert_days INT NOT NULL DEFAULT 30`
    return 'done'
  })
  await step('ADD COLUMN admin_password_hash', async () => {
    await sql`ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS admin_password_hash TEXT NOT NULL DEFAULT ''`
    return 'done'
  })
  await step('ADD COLUMN staff_password_hash', async () => {
    await sql`ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS staff_password_hash TEXT NOT NULL DEFAULT ''`
    return 'done'
  })

  // ── FIX F5: Fix store_settings row (correct business name/address/phone) ──
  console.log('── F5: Fix store_settings data ─────────────────────────')
  await step('UPDATE store_settings for Vasthraalayam', async () => {
    const rows = await sql`
      UPDATE public.store_settings
      SET
        name                = 'VASTHRAALAYAM BOUTIQUE',
        owner_name          = 'Vasthraalayam Boutique',
        phone               = '+91 98844 23899',
        shop_contact_number = '+91 98844 23899',
        email               = '',
        address             = 'No. 465/10, Medavakkam Main Road, Ullagaram, Puzhudhivakkam, Chennai - 600091',
        instagram_id        = 'vasthraalayamboutique',
        updated_at          = NOW()
      WHERE id = 1
      RETURNING name
    `
    return rows[0]?.name || 'no row updated'
  })

  // ── FIX F7b: Seed categories from existing products ───────────────────────
  console.log('── F7b: Seed categories from products ──────────────────')
  await step('INSERT Unregistered category', async () => {
    await sql`
      INSERT INTO public.categories (name_en, name_ta, is_active, sort_order)
      VALUES ('Unregistered', 'பதிவுசெய்யப்படாதது', TRUE, 999)
      ON CONFLICT (name_en) DO NOTHING
    `
    return 'done'
  })
  await step('INSERT distinct categories from products', async () => {
    const result = await sql`
      INSERT INTO public.categories (name_en, is_active, sort_order)
      SELECT DISTINCT TRIM(category), TRUE, 0
      FROM public.products
      WHERE TRIM(COALESCE(category,'')) != ''
        AND TRIM(category) != 'Unregistered'
      ON CONFLICT (name_en) DO NOTHING
    `
    return `${result.count} categories inserted`
  })
  await step('Link products.category_id to categories', async () => {
    const result = await sql`
      UPDATE public.products p
      SET category_id = c.id
      FROM public.categories c
      WHERE TRIM(LOWER(p.category)) = TRIM(LOWER(c.name_en))
        AND p.category_id IS NULL
    `
    return `${result.count} products updated`
  })

  // ── FIX F1: Create barcode_registry + inventory_movements tables ──────────
  console.log('── F1: Create barcode_registry table ───────────────────')
  await step('CREATE SEQUENCE barcode_product_seq', async () => {
    await sql`CREATE SEQUENCE IF NOT EXISTS public.barcode_product_seq START WITH 10000001`
    return 'done'
  })
  await step('CREATE SEQUENCE barcode_variant_seq', async () => {
    await sql`CREATE SEQUENCE IF NOT EXISTS public.barcode_variant_seq START WITH 10000001`
    return 'done'
  })
  await step('CREATE TABLE barcode_registry', async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS public.barcode_registry (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        barcode_value TEXT NOT NULL UNIQUE,
        entity_type TEXT NOT NULL CHECK (entity_type IN ('product', 'variant')),
        product_id BIGINT NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
        variant_id UUID REFERENCES public.product_variants(id) ON DELETE RESTRICT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_by_name TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_barcode_entity_target CHECK (
          (entity_type = 'product' AND variant_id IS NULL) OR
          (entity_type = 'variant' AND variant_id IS NOT NULL)
        )
      )
    `
    return 'done'
  })
  await step('CREATE TABLE inventory_movements', async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS public.inventory_movements (
        id BIGSERIAL PRIMARY KEY,
        product_id BIGINT REFERENCES public.products(id) ON DELETE SET NULL,
        variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
        barcode_id UUID REFERENCES public.barcode_registry(id) ON DELETE SET NULL,
        movement_type TEXT NOT NULL CHECK (
          movement_type IN ('INITIAL_BARCODE_STOCK','RESTOCK','SALE','RETURN','DAMAGE','CORRECTION','VOID')
        ),
        quantity_delta NUMERIC NOT NULL,
        quantity_before NUMERIC NOT NULL,
        quantity_after NUMERIC NOT NULL,
        unit_cost NUMERIC DEFAULT NULL,
        reference_type TEXT DEFAULT NULL,
        reference_id TEXT DEFAULT NULL,
        note TEXT DEFAULT '',
        created_by_name TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
    return 'done'
  })
  await step('CREATE indexes for barcode_registry', async () => {
    await sql`CREATE INDEX IF NOT EXISTS idx_barcode_registry_val ON public.barcode_registry(barcode_value)`
    await sql`CREATE INDEX IF NOT EXISTS idx_barcode_registry_prod ON public.barcode_registry(product_id)`
    await sql`CREATE INDEX IF NOT EXISTS idx_barcode_registry_var ON public.barcode_registry(variant_id) WHERE variant_id IS NOT NULL`
    await sql`CREATE INDEX IF NOT EXISTS idx_inv_movements_prod ON public.inventory_movements(product_id, created_at DESC)`
    await sql`CREATE INDEX IF NOT EXISTS idx_inv_movements_var ON public.inventory_movements(variant_id, created_at DESC)`
    await sql`CREATE INDEX IF NOT EXISTS idx_inv_movements_type ON public.inventory_movements(movement_type, created_at DESC)`
    return 'done'
  })

  // ── FIX F2: Deploy complete_pos_sale_with_inventory ───────────────────────
  console.log('── F2: Deploy complete_pos_sale_with_inventory ──────────')
  await step('CREATE OR REPLACE FUNCTION complete_pos_sale_with_inventory', async () => {
    await sql.unsafe(`
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

  -- 1. Atomic pre-validation of available stock for all catalogue items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := NULLIF(v_item->>'product_id','')::BIGINT;
    v_variant_id := NULLIF(v_item->>'variant_id','')::UUID;
    v_quantity   := COALESCE((v_item->>'quantity')::NUMERIC, 0);
    v_is_manual  := COALESCE((v_item->>'is_manual')::BOOLEAN, FALSE);
    v_product_name := COALESCE(v_item->>'product_name', v_item->>'name', 'Product');

    IF NOT v_is_manual AND v_quantity > 0 THEN
      IF v_variant_id IS NOT NULL THEN
        SELECT stock INTO v_current_stock FROM public.product_variants WHERE id = v_variant_id FOR UPDATE;
        IF v_current_stock IS NULL OR v_current_stock < v_quantity THEN
          RAISE EXCEPTION 'Insufficient stock for % (Available: %, Requested: %)',
            v_product_name, COALESCE(v_current_stock,0), v_quantity;
        END IF;
      ELSIF v_product_id IS NOT NULL THEN
        SELECT stock_quantity INTO v_current_stock FROM public.products WHERE id = v_product_id FOR UPDATE;
        IF v_current_stock IS NULL OR v_current_stock < v_quantity THEN
          RAISE EXCEPTION 'Insufficient stock for % (Available: %, Requested: %)',
            v_product_name, COALESCE(v_current_stock,0), v_quantity;
        END IF;
      END IF;
    END IF;
  END LOOP;

  -- 2. Calculate subtotal & generate invoice number
  v_invoice_no := public.get_next_invoice_no();

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_quantity   := COALESCE((v_item->>'quantity')::NUMERIC, 0);
    v_unit_price := COALESCE((v_item->>'unit_price')::NUMERIC,(v_item->>'base_price')::NUMERIC,(v_item->>'price')::NUMERIC,0);
    v_line_total := COALESCE((v_item->>'line_total')::NUMERIC, ROUND(v_quantity * v_unit_price, 2));
    v_subtotal   := v_subtotal + v_line_total;
  END LOOP;

  v_total := GREATEST(0, ROUND(v_subtotal + COALESCE(p_shipping,0) + COALESCE(p_delivery_charge,0) - COALESCE(p_discount_amount,0), 2));

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
    v_invoice_no, p_created_by,
    COALESCE(NULLIF(BTRIM(p_customer_name),''),'Customer'),
    COALESCE(p_phone,''), COALESCE(p_address,''), p_items,
    v_subtotal, COALESCE(p_shipping,0), v_total, COALESCE(p_status,'completed'),
    COALESCE(p_order_mode,'offline'), COALESCE(p_order_type,'pos_sale'),
    COALESCE(p_delivery_charge,0), COALESCE(p_discount_amount,0),
    COALESCE(p_manual_discount_amount,0), COALESCE(p_manual_discount_type,'flat'),
    COALESCE(p_manual_discount_value,0), p_coupon_code,
    COALESCE(p_coupon_percentage,0), COALESCE(p_total_gst,0),
    COALESCE(p_total_gst,0), COALESCE(p_gst_enabled,FALSE),
    COALESCE(p_payment_method,'cash'), COALESCE(p_payment_method,'cash'),
    COALESCE(p_split_details,'{}'::JSONB), COALESCE(p_remarks,''),
    COALESCE(p_reference_number,''), p_billing_date, v_created_at, NOW()
  )
  RETURNING id INTO v_order_id;

  -- 4. Insert order items, deduct stock & record SALE movements
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id   := NULLIF(v_item->>'product_id','')::BIGINT;
    v_variant_id   := NULLIF(v_item->>'variant_id','')::UUID;
    v_quantity     := COALESCE((v_item->>'quantity')::NUMERIC, 0);
    v_unit_price   := COALESCE((v_item->>'unit_price')::NUMERIC,(v_item->>'base_price')::NUMERIC,0);
    v_line_total   := COALESCE((v_item->>'line_total')::NUMERIC, ROUND(v_quantity * v_unit_price, 2));
    v_product_name := COALESCE(v_item->>'product_name', v_item->>'name', 'Product');
    v_name_ta      := COALESCE(v_item->>'product_tamil_name', v_item->>'tamil_name', '');
    v_unit         := COALESCE(v_item->>'unit','piece');
    v_unit_type    := COALESCE(v_item->>'unit_type','unit');
    v_base_quantity:= COALESCE((v_item->>'base_quantity')::NUMERIC, 1);
    v_is_manual    := COALESCE((v_item->>'is_manual')::BOOLEAN, FALSE);
    v_discount     := COALESCE((v_item->>'discount')::NUMERIC, 0);
    v_gst_amount   := COALESCE((v_item->>'gst_amount')::NUMERIC, 0);
    v_gst_rate     := COALESCE((v_item->>'gst_rate')::NUMERIC, 0);
    v_image_url    := v_item->>'image_url';
    v_variant_name := v_item->>'variant_name';
    v_source       := COALESCE(v_item->>'source','catalogue');
    v_note         := v_item->>'note';
    v_category     := v_item->>'category';

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

    -- Deduct stock and record SALE movement (catalogue items only)
    IF NOT v_is_manual AND v_quantity > 0 THEN
      IF v_variant_id IS NOT NULL THEN
        SELECT stock INTO v_current_stock FROM public.product_variants WHERE id = v_variant_id;
        SELECT id INTO v_barcode_id FROM public.barcode_registry
          WHERE variant_id = v_variant_id AND is_active = TRUE LIMIT 1;

        UPDATE public.product_variants
          SET stock = GREATEST(0, stock - v_quantity), updated_at = NOW()
          WHERE id = v_variant_id;

        UPDATE public.products
          SET stock_quantity = (SELECT COALESCE(SUM(stock),0) FROM public.product_variants WHERE product_id = v_product_id AND is_active = TRUE),
              stock = FLOOR((SELECT COALESCE(SUM(stock),0) FROM public.product_variants WHERE product_id = v_product_id AND is_active = TRUE))::INTEGER,
              updated_at = NOW()
          WHERE id = v_product_id;

        INSERT INTO public.inventory_movements (
          product_id, variant_id, barcode_id, movement_type,
          quantity_delta, quantity_before, quantity_after,
          reference_type, reference_id, note
        ) VALUES (
          v_product_id, v_variant_id, v_barcode_id, 'SALE',
          -v_quantity, v_current_stock, GREATEST(0, v_current_stock - v_quantity),
          'order', v_invoice_no, 'POS Sale checkout'
        );

      ELSIF v_product_id IS NOT NULL THEN
        SELECT stock_quantity INTO v_current_stock FROM public.products WHERE id = v_product_id;
        SELECT id INTO v_barcode_id FROM public.barcode_registry
          WHERE product_id = v_product_id AND variant_id IS NULL AND is_active = TRUE LIMIT 1;

        UPDATE public.products
          SET stock_quantity = GREATEST(0, stock_quantity - v_quantity),
              stock = GREATEST(0, stock - FLOOR(v_quantity)::INTEGER),
              updated_at = NOW()
          WHERE id = v_product_id;

        INSERT INTO public.inventory_movements (
          product_id, variant_id, barcode_id, movement_type,
          quantity_delta, quantity_before, quantity_after,
          reference_type, reference_id, note
        ) VALUES (
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
    'order_id',  v_order_id,
    'invoice_no', v_invoice_no,
    'total',     v_total
  );
END;
$$;
    `)
    return 'done'
  })

  // Also deploy the generate_barcode_value helper (needed by barcode module)
  await step('CREATE OR REPLACE FUNCTION generate_barcode_value', async () => {
    await sql.unsafe(`
CREATE OR REPLACE FUNCTION public.generate_barcode_value(p_entity_type TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
BEGIN
  IF p_entity_type = 'variant' THEN
    RETURN 'VBV' || LPAD(nextval('public.barcode_variant_seq')::TEXT, 8, '0');
  ELSE
    RETURN 'VBP' || LPAD(nextval('public.barcode_product_seq')::TEXT, 8, '0');
  END IF;
END;
$$;
    `)
    return 'done'
  })

  // ── Verify the fixes ─────────────────────────────────────────────────────
  console.log('\n── Verification ────────────────────────────────────────')

  await step('Verify barcode_registry exists', async () => {
    const [r] = await sql`SELECT COUNT(*) AS c FROM public.barcode_registry`
    return `table exists, ${r.c} rows`
  })
  await step('Verify inventory_movements exists', async () => {
    const [r] = await sql`SELECT COUNT(*) AS c FROM public.inventory_movements`
    return `table exists, ${r.c} rows`
  })
  await step('Verify complete_pos_sale_with_inventory exists', async () => {
    const [r] = await sql`
      SELECT routine_name FROM information_schema.routines
      WHERE routine_schema='public' AND routine_name='complete_pos_sale_with_inventory' LIMIT 1`
    return r ? 'function found' : 'MISSING!'
  })
  await step('Verify store_settings.name', async () => {
    const [r] = await sql`SELECT name FROM public.store_settings WHERE id=1`
    return r.name
  })
  await step('Verify orders.tailor_name column', async () => {
    const [r] = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='orders' AND column_name='tailor_name'`
    return r ? 'column exists' : 'MISSING!'
  })
  await step('Verify products.item_type column', async () => {
    const [r] = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='products' AND column_name='item_type'`
    return r ? 'column exists' : 'MISSING!'
  })
  await step('Categories count after seed', async () => {
    const [r] = await sql`SELECT COUNT(*) AS c FROM public.categories`
    return `${r.c} categories`
  })

  console.log('\n═══════════════════════════════════════════════════════')
  console.log('  ALL DB FIXES APPLIED SUCCESSFULLY')
  console.log('═══════════════════════════════════════════════════════\n')
}

run().catch(err => {
  console.error('\n✗ Fix script failed:', err.message)
  process.exit(1)
}).finally(() => sql.end())
