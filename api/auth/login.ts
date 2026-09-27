import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from '../_lib/db'
import { methodRouter } from '../_lib/handler'
import { issueSessionToken } from '../_lib/session'
import { verifyPasswordHash } from '../_lib/password'

/**
 * Verifies portal credentials and, on success, issues a signed session
 * token. This is the ONLY place credentials are compared — the client no
 * longer does this itself (see src/store/store.ts's useAdminAuthStore,
 * which used to compare against VITE_ADMIN_ID/VITE_ADMIN_PASSWORD directly
 * in the browser).
 *
 * Password source of truth: a DB-stored hash (set via Settings > Account
 * Security > Change Password) takes priority when present; otherwise falls
 * back to the ADMIN_PASSWORD/STAFF_PASSWORD env vars, so existing
 * deployments keep working until a password is changed for the first time.
 */
async function login(req: VercelRequest, res: VercelResponse) {
  const body = (req.body ?? {}) as { portalId?: string; password?: string }
  const trimmedId = String(body.portalId || '').trim()
  const trimmedPass = String(body.password || '').trim()

  if (!trimmedId || !trimmedPass) {
    res.status(400).json({ error: 'Portal ID and password are required' })
    return
  }

  const rows = await sql`SELECT admin_password_hash, staff_password_hash FROM public.store_settings WHERE id = 1 LIMIT 1`
  const stored = rows[0] as { admin_password_hash?: string; staff_password_hash?: string } | undefined

  // Support ADMIN_ID/ADMIN_PASSWORD or the legacy PORTAL_ID/PORTAL_PASSWORD
  // names, matching the fallback precedence the old client-side check used.
  const adminId = String(process.env.ADMIN_ID || process.env.PORTAL_ID || 'admin').trim()
  const adminPassMatches = stored?.admin_password_hash
    ? verifyPasswordHash(trimmedPass, stored.admin_password_hash)
    : trimmedPass === String(process.env.ADMIN_PASSWORD || process.env.PORTAL_PASSWORD || 'admin123').trim()
  if (trimmedId === adminId && adminPassMatches) {
    const { token, expiresAt } = issueSessionToken('admin', trimmedId)
    res.status(200).json({ role: 'admin', token, expiresAt })
    return
  }

  const staffId = String(process.env.STAFF_ID || 'staff').trim()
  const staffPassMatches = stored?.staff_password_hash
    ? verifyPasswordHash(trimmedPass, stored.staff_password_hash)
    : trimmedPass === String(process.env.STAFF_PASSWORD || 'staff123').trim()
  if (trimmedId === staffId && staffPassMatches) {
    const { token, expiresAt } = issueSessionToken('staff', trimmedId)
    res.status(200).json({ role: 'staff', token, expiresAt })
    return
  }

  // Generic message — don't reveal which field (id vs password) was wrong.
  res.status(401).json({ error: 'Invalid portal ID or password' })
}

export default methodRouter({ POST: login })
