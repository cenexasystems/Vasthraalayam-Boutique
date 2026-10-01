-- 0008_custom_label_sizes.sql
-- Custom barcode label sizes and last used size preference per business

CREATE TABLE IF NOT EXISTS public.custom_label_sizes (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL DEFAULT '1',
  name TEXT NOT NULL,
  width_mm NUMERIC NOT NULL,
  height_mm NUMERIC NOT NULL,
  columns INTEGER NOT NULL DEFAULT 1,
  gap_mm NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_custom_label_sizes_business ON public.custom_label_sizes(business_id);

CREATE TABLE IF NOT EXISTS public.business_label_settings (
  business_id TEXT PRIMARY KEY,
  last_used_size_id TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
