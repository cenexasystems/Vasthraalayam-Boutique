-- Migration: Add invoice_primary_color to store_settings
ALTER TABLE public.store_settings
ADD COLUMN IF NOT EXISTS invoice_primary_color TEXT DEFAULT '#1F3A2E';

UPDATE public.store_settings
SET invoice_primary_color = '#1F3A2E'
WHERE invoice_primary_color IS NULL OR invoice_primary_color = '';
