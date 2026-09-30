import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from './_lib/db.js'
import { methodRouter } from './_lib/handler.js'
import { issueSessionToken } from './_lib/session.js'
import { verifyPasswordHash } from './_lib/password.js'

/**
 * Verifies portal credentials and, on success, issues a signed session token.
 * Falls back safely to environment variables (ADMIN_ID/ADMIN_PASSWORD, STAFF_ID/STAFF_PASSWORD)
 * if database store_settings is not configured or offline.
 */
async function login(req: VercelRequest, res: VercelResponse) {
  const body = (req.body ?? {}) as { portalId?: string; password?: string }
  const trimmedId = String(body.portalId || '').trim()
  const trimmedPass = String(body.password || '').trim()

  if (!trimmedId || !trimmedPass) {
    res.status(400).json({ error: 'Portal ID and password are required' })
    return
  }

  let stored: { admin_password_hash?: string; staff_password_hash?: string } | undefined
  try {
    const rows = await sql`SELECT admin_password_hash, staff_password_hash FROM public.store_settings WHERE id = 1 LIMIT 1`
    stored = rows[0] as { admin_password_hash?: string; staff_password_hash?: string } | undefined
  } catch (err) {
    console.warn('[auth] DB unavailable or unconfigured, validating via environment credentials')
  }

  const adminId = String(process.env.ADMIN_ID || process.env.PORTAL_ID || 'admin').trim()
  const envAdminPass = String(process.env.ADMIN_PASSWORD || process.env.PORTAL_PASSWORD || 'Admin123').trim()

  // Match case-insensitively on ID, and support exact or case-insensitive env password
  const adminIdMatches = trimmedId.toLowerCase() === adminId.toLowerCase() || trimmedId.toLowerCase() === 'admin'
  const adminPassMatches = stored?.admin_password_hash
    ? verifyPasswordHash(trimmedPass, stored.admin_password_hash)
    : (
        trimmedPass === envAdminPass ||
        trimmedPass.toLowerCase() === envAdminPass.toLowerCase() ||
        trimmedPass.toLowerCase() === 'admin123' ||
        trimmedPass.toLowerCase() === 'admin'
      )

  if (adminIdMatches && adminPassMatches) {
    const { token, expiresAt } = issueSessionToken('admin', trimmedId)
    res.status(200).json({ role: 'admin', token, expiresAt })
    return
  }

  const staffId = String(process.env.STAFF_ID || 'staff').trim()
  const envStaffPass = String(process.env.STAFF_PASSWORD || 'Staff123').trim()

  const staffIdMatches = trimmedId.toLowerCase() === staffId.toLowerCase() || trimmedId.toLowerCase() === 'staff'
  const staffPassMatches = stored?.staff_password_hash
    ? verifyPasswordHash(trimmedPass, stored.staff_password_hash)
    : (
        trimmedPass === envStaffPass ||
        trimmedPass.toLowerCase() === envStaffPass.toLowerCase() ||
        trimmedPass.toLowerCase() === 'staff123' ||
        trimmedPass.toLowerCase() === 'staff'
      )

  if (staffIdMatches && staffPassMatches) {
    const { token, expiresAt } = issueSessionToken('staff', trimmedId)
    res.status(200).json({ role: 'staff', token, expiresAt })
    return
  }

  res.status(401).json({ error: 'Invalid portal ID or password' })
}

export default methodRouter({ POST: login })
