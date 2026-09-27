# VASTHRAALAYAM BOUTIQUE Billing

Independent React, Vite, and Supabase billing administration for VASTHRAALAYAM BOUTIQUE.

## Local setup

1. Copy `.env.example` to `.env` and add the dedicated VASTHRAALAYAM BOUTIQUE Supabase URL, public key, and portal passwords.
2. Apply the SQL files in `supabase/migrations` in filename order.
3. Run `npm install`.
4. Run `npm run dev`.

The app keeps the established dashboard, POS billing, catalog, category, coupon, invoice, receipt, WhatsApp, and print flows. Local browser sessions use shop-specific storage keys and do not share state with other shop projects.

## Environment

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_WHATSAPP_NUMBER=918925094465`
- `DATABASE_URL` — Neon connection string (server-side only, see `neon/README.md`)
- `ADMIN_ID` / `ADMIN_PASSWORD` — Admin portal credentials, verified server-side in `api/auth/login.ts` (never sent to the browser)
- `STAFF_ID` / `STAFF_PASSWORD` — Staff portal credentials, same as above
- `SESSION_SECRET` — signs the session tokens issued on login (`api/_lib/session.ts`); rotating it logs everyone out

Brand assets are located in `public/chaji-logo.jpeg`.
