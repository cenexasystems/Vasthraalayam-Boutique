import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from '../_lib/db'
import { requireAuth } from '../_lib/guard'
import { methodRouter } from '../_lib/handler'

// Public: the theme color (and shop identity) must load before login too —
// e.g. so the login screen itself can carry the shop's chosen accent color.
// None of these columns are sensitive — password hashes live in separate
// columns never selected here, and are only ever touched by
// api/settings/password.ts.
const SETTINGS_COLUMNS = `
  name, owner_name, phone, shop_contact_number, email, address, business_type,
  instagram_id, logo_url, gst_enabled, theme_color, low_stock_threshold, expiry_alert_days
`

const WRITABLE_COLUMNS = new Set([
  'name', 'owner_name', 'phone', 'shop_contact_number', 'email', 'address',
  'business_type', 'instagram_id', 'logo_url', 'gst_enabled', 'theme_color',
  'low_stock_threshold', 'expiry_alert_days',
])

async function get(_req: VercelRequest, res: VercelResponse) {
  const rows = await sql.unsafe(`SELECT ${SETTINGS_COLUMNS} FROM public.store_settings WHERE id = 1 LIMIT 1`)
  res.status(200).json({ data: rows[0] ?? null })
}

async function put(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res, ['admin'])) return
  const body = (req.body ?? {}) as Record<string, unknown>

  const updates: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(body)) {
    if (WRITABLE_COLUMNS.has(key)) updates[key] = value
  }
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: 'No updatable fields provided' })
    return
  }

  const rows = await sql`
    UPDATE public.store_settings
    SET ${sql(updates)}, updated_at = NOW()
    WHERE id = 1
    RETURNING ${sql.unsafe(SETTINGS_COLUMNS)}
  `
  res.status(200).json({ data: rows[0] })
}

export default methodRouter({ GET: get, PUT: put })
