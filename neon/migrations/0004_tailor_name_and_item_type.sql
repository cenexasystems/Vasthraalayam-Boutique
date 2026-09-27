-- Adds two independent, additive fields used by the billing panel and
-- inventory catalog. Both are plain nullable-with-default TEXT columns, no
-- backfill required, and safe to re-run.

-- 1. Tailor Name: optional internal-only note on each order, for tracking
--    which tailor handled a stitching/tailoring job. Never shown to the
--    customer (not part of the printed invoice).
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS tailor_name TEXT NOT NULL DEFAULT '';

-- 2. Item Type: classifies each catalog item as a physical Product or a
--    Service (tailoring/stitching/alterations). Existing items default to
--    'product' so nothing already in the catalog needs reclassifying.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS item_type TEXT NOT NULL DEFAULT 'product';
