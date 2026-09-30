import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from './_lib/db.js'
import { requireAuth } from './_lib/guard.js'
import { methodRouter } from './_lib/handler.js'
import { hashPassword, verifyPasswordHash } from './_lib/password.js'

// Consolidated from api/settings/{index,password}.ts into a single file so
// this project stays within the Hobby plan's 12 Serverless Function limit.
// vercel.json rewrites PUT /api/settings/password onto ?action=password.

// Public: the theme color (and shop identity) must load before login too —
// e.g. so the login screen itself can carry the shop's chosen accent color.
// None of these columns are sensitive — password hashes live in separate
// columns never selected here, and are only ever touched by the password
// branch below.
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
  try {
    const rows = await sql.unsafe(`SELECT ${SETTINGS_COLUMNS} FROM public.store_settings WHERE id = 1 LIMIT 1`)
    res.status(200).json({ data: rows[0] ?? null })
  } catch (err) {
    console.warn('[settings] DB unreachable or unconfigured, returning null fallback')
    res.status(200).json({ data: null })
  }
}

async function putSettings(req: VercelRequest, res: VercelResponse) {
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

/**
 * Changes the password for the CALLER's own role (admin or staff — taken
 * from their signed session, never from the request body). Stores a hash in
 * store_settings; api/auth.ts checks it first on future logins, falling back
 * to the ADMIN_PASSWORD/STAFF_PASSWORD env vars only while no hash has been
 * set yet.
 */
async function putPassword(req: VercelRequest, res: VercelResponse) {
  const session = requireAuth(req, res)
  if (!session) return

  const body = (req.body ?? {}) as { currentPassword?: string; newPassword?: string }
  const currentPassword = String(body.currentPassword || '')
  const newPassword = String(body.newPassword || '')

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: 'Current and new password are required' })
    return
  }
  if (newPassword.length < 6) {
    res.status(400).json({ error: 'New password must be at least 6 characters' })
    return
  }

  const column = session.role === 'admin' ? 'admin_password_hash' : 'staff_password_hash'
  const envDefault = session.role === 'admin'
    ? String(process.env.ADMIN_PASSWORD || process.env.PORTAL_PASSWORD || 'admin123').trim()
    : String(process.env.STAFF_PASSWORD || 'staff123').trim()

  const rows = await sql`SELECT ${sql(column)} AS hash FROM public.store_settings WHERE id = 1 LIMIT 1`
  const storedHash = (rows[0] as { hash?: string } | undefined)?.hash || ''

  const currentMatches = storedHash ? verifyPasswordHash(currentPassword, storedHash) : currentPassword === envDefault
  if (!currentMatches) {
    res.status(401).json({ error: 'Current password is incorrect' })
    return
  }

  const newHash = hashPassword(newPassword)
  await sql`UPDATE public.store_settings SET ${sql({ [column]: newHash })}, updated_at = NOW() WHERE id = 1`

  res.status(200).json({ data: { success: true } })
}

async function put(req: VercelRequest, res: VercelResponse) {
  if (req.query.action === 'password') return putPassword(req, res)
  return putSettings(req, res)
}

export default methodRouter({ GET: get, PUT: put })
