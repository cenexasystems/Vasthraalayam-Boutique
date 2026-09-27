-- store_settings already exists (seeded by 0003_billing_core_seed.sql, one
-- row, id fixed at 1) with the shop's name/owner/contact/GST fields. This
-- adds the live theme color: picked from a shade palette in Settings >
-- Appearance and applied across the whole app via a CSS custom property.
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS theme_color TEXT NOT NULL DEFAULT '#2c392a';
