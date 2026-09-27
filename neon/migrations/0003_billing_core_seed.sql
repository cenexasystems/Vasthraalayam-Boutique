-- VASTHRAALAYAM BOUTIQUE — Neon billing-core seed data (Phase 1)
-- Intentionally minimal: no product catalog is seeded (that was Purple
-- Boutique's / Chaji Mens Wear's real inventory, not yours). Only the
-- system "Unregistered" category (needed for ad-hoc POS billing of items
-- with no catalog entry) and a starter store_settings row are created.

INSERT INTO public.categories (name_en, name_ta, is_active, sort_order)
VALUES ('Unregistered', 'பதிவுசெய்யப்படாதது', TRUE, 999)
ON CONFLICT (name_en) DO NOTHING;

-- Contact details (owner_name/phone/email/address) are left blank on purpose —
-- fill these in from the admin Dashboard's store settings once you're ready to
-- go live, rather than carrying over placeholder data from a prior project.
INSERT INTO public.store_settings (id, name, gst_enabled)
VALUES (1, 'VASTHRAALAYAM BOUTIQUE', FALSE)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  updated_at = NOW();
