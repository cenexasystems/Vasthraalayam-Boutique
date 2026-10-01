-- 0009_printer_profiles.sql
-- Reusable printer profiles and settings per business

CREATE TABLE IF NOT EXISTS public.printer_profiles (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL DEFAULT '1',
  name TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  printer_type TEXT NOT NULL DEFAULT 'label',
  size_id TEXT NOT NULL DEFAULT '2_38x25',
  orientation TEXT NOT NULL DEFAULT 'portrait',
  rotation INTEGER NOT NULL DEFAULT 0,
  margin_top_mm NUMERIC NOT NULL DEFAULT 0,
  margin_right_mm NUMERIC NOT NULL DEFAULT 0,
  margin_bottom_mm NUMERIC NOT NULL DEFAULT 0,
  margin_left_mm NUMERIC NOT NULL DEFAULT 0,
  gap_x_mm NUMERIC NOT NULL DEFAULT 2,
  gap_y_mm NUMERIC NOT NULL DEFAULT 0,
  offset_x_mm NUMERIC NOT NULL DEFAULT 0,
  offset_y_mm NUMERIC NOT NULL DEFAULT 0,
  barcode_type TEXT NOT NULL DEFAULT 'CODE128',
  font_scale NUMERIC NOT NULL DEFAULT 1.0,
  barcode_height_scale NUMERIC NOT NULL DEFAULT 1.0,
  show_product_name BOOLEAN NOT NULL DEFAULT TRUE,
  show_price BOOLEAN NOT NULL DEFAULT TRUE,
  show_sku BOOLEAN NOT NULL DEFAULT TRUE,
  show_mrp BOOLEAN NOT NULL DEFAULT FALSE,
  show_variant BOOLEAN NOT NULL DEFAULT TRUE,
  show_business_name BOOLEAN NOT NULL DEFAULT TRUE,
  show_date BOOLEAN NOT NULL DEFAULT FALSE,
  sheet_start_position INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.printer_profiles
  ADD COLUMN IF NOT EXISTS sheet_start_position INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_printer_profiles_business ON public.printer_profiles(business_id);

ALTER TABLE public.business_label_settings
  ADD COLUMN IF NOT EXISTS last_used_profile_id TEXT;

ALTER TABLE public.business_label_settings
  ALTER COLUMN last_used_size_id DROP NOT NULL;

ALTER TABLE public.business_label_settings
  ALTER COLUMN last_used_size_id SET DEFAULT '2_38x25';
