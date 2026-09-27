import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from '../_lib/db'
import { requireAuth } from '../_lib/guard'
import { methodRouter } from '../_lib/handler'
import { hashPassword, verifyPasswordHash } from '../_lib/password'

/**
 * Changes the password for the CALLER's own role (admin or staff — taken
 * from their signed session, never from the request body). Stores a hash in
 * store_settings; api/auth/login.ts checks it first on future logins,
 * falling back to the ADMIN_PASSWORD/STAFF_PASSWORD env vars only while no
 * hash has been set yet.
 */
async function put(req: VercelRequest, res: VercelResponse) {
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

export default methodRouter({ PUT: put })
