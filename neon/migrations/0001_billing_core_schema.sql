-- VASTHRAALAYAM BOUTIQUE — Neon billing-core schema (Phase 1)
-- Ported from supabase/migrations/*.sql. Differences from the Supabase originals:
--   * No `auth.users` foreign keys — this database has no built-in auth service.
--     Former UUID "who did this" columns (orders.user_id, advance_orders.created_by,
--     advance_order_timeline.created_by, advance_order_payments.received_by) are now
--     plain nullable TEXT columns, filled in by the API layer (portal ID or, later,
--     a real Phase-2 user id) rather than a JWT claim.
--   * No Row Level Security / policies — Neon is reached only by server-side API code
--     holding DATABASE_URL. That connection is the trust boundary, enforced by the API
--     layer's bearer-token guard, not by RLS.
--   * No storage.* or supabase_realtime statements — not applicable outside Supabase.
-- Safe to re-run: every statement is idempotent (IF NOT EXISTS / OR REPLACE).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── Categories ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.categories (
  id BIGSERIAL PRIMARY KEY,
  name_en TEXT NOT NULL UNIQUE,
  name_ta TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Products ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.products (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  name_ta TEXT NOT NULL DEFAULT '',
  tamil_name TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  category_id BIGINT REFERENCES public.categories(id) ON DELETE SET NULL,
  remedy TEXT[] NOT NULL DEFAULT '{}',
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  offer_price NUMERIC(12,2),
  purchase_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  mrp NUMERIC(12,2) NOT NULL DEFAULT 0,
  gst_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  unit_type TEXT NOT NULL DEFAULT 'unit' CHECK (unit_type IN ('unit', 'weight', 'volume', 'bundle')),
  unit_label TEXT NOT NULL DEFAULT 'piece',
  unit TEXT NOT NULL DEFAULT 'piece',
  base_quantity NUMERIC(12,3) NOT NULL DEFAULT 1,
  stock_quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
  opening_stock NUMERIC(12,3) NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0,
  stock_unit TEXT NOT NULL DEFAULT 'piece',
  low_stock_alert NUMERIC(12,3) NOT NULL DEFAULT 5,
  allow_decimal_quantity BOOLEAN NOT NULL DEFAULT FALSE,
  predefined_options JSONB NOT NULL DEFAULT '[]'::JSONB,
  description TEXT NOT NULL DEFAULT '',
  description_ta TEXT NOT NULL DEFAULT '',
  benefits TEXT NOT NULL DEFAULT '',
  benefits_ta TEXT NOT NULL DEFAULT '',
  image TEXT,
  image_url TEXT,
  sku TEXT,
  barcode TEXT,
  brand TEXT,
  supplier TEXT,
  size TEXT,
  color TEXT,
  rating NUMERIC(3,1) NOT NULL DEFAULT 5,
  has_variants BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS products_category_name_unique
  ON public.products (category_id, LOWER(BTRIM(name)))
  WHERE is_active = true;

-- ─── Product variants ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id BIGINT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_name TEXT NOT NULL,
  size_label TEXT,
  weight_value NUMERIC(12,3),
  weight_unit TEXT,
  sku TEXT,
  barcode TEXT,
  purchase_price NUMERIC(12,2),
  mrp NUMERIC(12,2),
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  stock NUMERIC(12,3) NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  image_url TEXT,
  group_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS product_variants_product_name_unique
  ON public.product_variants (product_id, LOWER(BTRIM(variant_name)))
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS products_category_id_idx ON public.products(category_id);
CREATE INDEX IF NOT EXISTS products_active_sort_idx ON public.products(is_active, sort_order);
CREATE INDEX IF NOT EXISTS variants_product_id_idx ON public.product_variants(product_id);

-- ─── Coupons ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.coupons (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  percentage NUMERIC(5,2) NOT NULL CHECK (percentage > 0 AND percentage <= 100),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  expiry_date TIMESTAMPTZ,
  usage_limit INTEGER CHECK (usage_limit IS NULL OR usage_limit > 0),
  usage_count INTEGER NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  min_order_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS coupons_code_upper_unique ON public.coupons (UPPER(BTRIM(code)));

-- ─── Orders ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no TEXT NOT NULL UNIQUE,
  user_id TEXT, -- was UUID REFERENCES auth.users(id); see header note
  customer_name TEXT NOT NULL DEFAULT 'Customer',
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  items JSONB NOT NULL DEFAULT '[]'::JSONB,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  shipping NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  order_mode TEXT NOT NULL DEFAULT 'offline',
  order_type TEXT NOT NULL DEFAULT 'pos_sale',
  delivery_charge NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  manual_discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  manual_discount_type TEXT NOT NULL DEFAULT 'flat',
  manual_discount_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  coupon_code TEXT,
  coupon_percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
  total_gst NUMERIC(12,2) NOT NULL DEFAULT 0,
  gst_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  gst_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  payment_mode TEXT NOT NULL DEFAULT 'cash',
  split_details JSONB NOT NULL DEFAULT '{}'::JSONB,
  remarks TEXT NOT NULL DEFAULT '',
  reference_number TEXT NOT NULL DEFAULT '',
  billing_date TIMESTAMPTZ,
  invoice_pdf_url TEXT, -- not in any Supabase migration either; column reserved for the Storage phase (Vercel Blob)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS orders_created_at_idx ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS orders_phone_idx ON public.orders(phone);
CREATE INDEX IF NOT EXISTS idx_orders_invoice_no ON public.orders(invoice_no);
CREATE INDEX IF NOT EXISTS idx_orders_billing_date ON public.orders(billing_date);

-- ─── Order items ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id BIGINT REFERENCES public.products(id) ON DELETE SET NULL,
  variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL DEFAULT 'Product',
  name TEXT NOT NULL DEFAULT 'Product',
  product_tamil_name TEXT,
  tamil_name TEXT,
  variant_name TEXT,
  quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'piece',
  unit_type TEXT NOT NULL DEFAULT 'unit',
  base_quantity NUMERIC(12,3) NOT NULL DEFAULT 1,
  base_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  image_url TEXT,
  is_manual BOOLEAN NOT NULL DEFAULT FALSE,
  discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  gst_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  gst_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'catalogue',
  note TEXT,
  category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON public.order_items(order_id);

-- ─── Advance orders (deposit workflow) ────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.deposit_number_seq START WITH 1;

CREATE TABLE IF NOT EXISTS public.advance_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deposit_id TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  product_name TEXT NOT NULL,
  products JSONB NOT NULL DEFAULT '[]'::JSONB,
  category TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  total_amount NUMERIC(12,2) NOT NULL CHECK (total_amount > 0),
  deposit_amount NUMERIC(12,2) NOT NULL CHECK (deposit_amount > 0),
  remaining_balance NUMERIC(12,2) GENERATED ALWAYS AS (total_amount - deposit_amount) STORED,
  expected_delivery_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_deposit'
    CHECK (status IN ('pending_deposit','ready_for_delivery','waiting_final_payment','completed','cancelled')),
  remarks TEXT NOT NULL DEFAULT '',
  created_by TEXT, -- was UUID REFERENCES auth.users(id); see header note
  created_by_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  completed_order_id UUID UNIQUE REFERENCES public.orders(id) ON DELETE SET NULL,
  invoice_number TEXT UNIQUE,
  final_payment_method TEXT,
  CONSTRAINT advance_deposit_less_than_total CHECK (deposit_amount < total_amount)
);

CREATE TABLE IF NOT EXISTS public.advance_order_timeline (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  advance_order_id UUID NOT NULL REFERENCES public.advance_orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  label TEXT NOT NULL,
  remarks TEXT NOT NULL DEFAULT '',
  created_by TEXT, -- was UUID REFERENCES auth.users(id)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.advance_order_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advance_order_id UUID NOT NULL REFERENCES public.advance_orders(id) ON DELETE CASCADE,
  payment_type TEXT NOT NULL CHECK (payment_type IN ('deposit','remaining')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash','upi','card')),
  remarks TEXT NOT NULL DEFAULT '',
  received_by TEXT, -- was UUID REFERENCES auth.users(id)
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (advance_order_id, payment_type)
);

CREATE INDEX IF NOT EXISTS advance_orders_created_idx ON public.advance_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS advance_orders_status_idx ON public.advance_orders(status);
CREATE INDEX IF NOT EXISTS advance_orders_delivery_idx ON public.advance_orders(expected_delivery_date);
CREATE INDEX IF NOT EXISTS advance_order_timeline_order_idx ON public.advance_order_timeline(advance_order_id, created_at);
CREATE INDEX IF NOT EXISTS advance_order_payments_order_idx ON public.advance_order_payments(advance_order_id, received_at);

-- ─── Barcode registry & inventory movement ledger ────────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.barcode_product_seq START WITH 10000001;
CREATE SEQUENCE IF NOT EXISTS public.barcode_variant_seq START WITH 10000001;

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
);

CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT REFERENCES public.products(id) ON DELETE SET NULL,
  variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
  barcode_id UUID REFERENCES public.barcode_registry(id) ON DELETE SET NULL,
  movement_type TEXT NOT NULL CHECK (
    movement_type IN ('INITIAL_BARCODE_STOCK', 'RESTOCK', 'SALE', 'RETURN', 'DAMAGE', 'CORRECTION', 'VOID')
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
);

CREATE INDEX IF NOT EXISTS idx_barcode_registry_val ON public.barcode_registry(barcode_value);
CREATE INDEX IF NOT EXISTS idx_barcode_registry_prod ON public.barcode_registry(product_id);
CREATE INDEX IF NOT EXISTS idx_barcode_registry_var ON public.barcode_registry(variant_id) WHERE variant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inv_movements_prod ON public.inventory_movements(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inv_movements_var ON public.inventory_movements(variant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inv_movements_type ON public.inventory_movements(movement_type, created_at DESC);

-- ─── Store settings (single row) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.store_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  name TEXT NOT NULL DEFAULT '',
  owner_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  gst_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Sync triggers (portable, no Supabase dependency) ────────────────────────
CREATE OR REPLACE FUNCTION public.sync_product_category_name()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.category_id IS NOT NULL THEN
    SELECT name_en INTO NEW.category FROM public.categories WHERE id = NEW.category_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_product_category_name_trigger ON public.products;
CREATE TRIGGER sync_product_category_name_trigger
BEFORE INSERT OR UPDATE OF category_id ON public.products
FOR EACH ROW EXECUTE FUNCTION public.sync_product_category_name();

CREATE OR REPLACE FUNCTION public.sync_category_name_to_products()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.name_en IS DISTINCT FROM OLD.name_en THEN
    UPDATE public.products SET category = NEW.name_en, updated_at = NOW() WHERE category_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_category_name_to_products_trigger ON public.categories;
CREATE TRIGGER sync_category_name_to_products_trigger
AFTER UPDATE OF name_en ON public.categories
FOR EACH ROW EXECUTE FUNCTION public.sync_category_name_to_products();

CREATE OR REPLACE FUNCTION public.ensure_one_default_variant()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.is_default THEN
    UPDATE public.product_variants
    SET is_default = FALSE, updated_at = NOW()
    WHERE product_id = NEW.product_id AND id <> NEW.id AND is_default;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_one_default_variant_trigger ON public.product_variants;
CREATE TRIGGER ensure_one_default_variant_trigger
AFTER INSERT OR UPDATE OF is_default ON public.product_variants
FOR EACH ROW EXECUTE FUNCTION public.ensure_one_default_variant();
