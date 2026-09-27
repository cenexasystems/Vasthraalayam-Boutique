-- Expands store_settings (single row, id=1) for the full Store Settings
-- page: Shop Profile, Contact Details, Shop Information, and Billing &
-- Inventory Thresholds sections. All additive/backward-compatible.

-- Note: `email` already existed on this table (from the original seed
-- migration) — not re-added here.
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS business_type TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS shop_contact_number TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS instagram_id TEXT NOT NULL DEFAULT '',
  -- Logo is stored as a data: URI (small image, no external object storage
  -- configured in this project) — read directly as an <img src>.
  ADD COLUMN IF NOT EXISTS logo_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS low_stock_threshold INT NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS expiry_alert_days INT NOT NULL DEFAULT 30,
  -- Optional DB-stored password override for the admin/staff portal login
  -- (api/auth/login.ts checks these first, falling back to the
  -- ADMIN_PASSWORD/STAFF_PASSWORD env vars when a row's hash is empty).
  ADD COLUMN IF NOT EXISTS admin_password_hash TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS staff_password_hash TEXT NOT NULL DEFAULT '';
