-- Store GST rates per variant so different sizes/options can retain their own tax rate.
ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS gst_percent NUMERIC(5,2);

-- Existing variants inherit the parent product's GST rate when one is configured.
UPDATE public.product_variants AS variant
SET gst_percent = product.gst_percent
FROM public.products AS product
WHERE product.id = variant.product_id
  AND variant.gst_percent IS NULL
  AND COALESCE(product.gst_percent, 0) > 0;
