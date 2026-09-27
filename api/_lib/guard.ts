import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifySessionToken, type Role, type SessionPayload } from './session'

/**
 * Verifies the caller's signed session token (issued by POST /api/auth/login
 * after real credential verification — see that file) and, if `allowedRoles`
 * is given, checks the role it was issued for. The role comes from inside
 * the signed payload, not from anything the client can set directly, so a
 * user cannot gain admin access by editing browser storage or headers —
 * only a token signed with the server's SESSION_SECRET is accepted.
 *
 * Returns the verified session on success. On failure it has already
 * written the 401/403 response — the caller should return immediately.
 */
export function requireAuth(
  req: VercelRequest,
  res: VercelResponse,
  allowedRoles: Role[] = ['admin', 'staff'],
): SessionPayload | null {
  const header = req.headers.authorization
  const bearer = Array.isArray(header) ? header[0] : header
  const token = bearer?.startsWith('Bearer ') ? bearer.slice('Bearer '.length) : undefined

  const session = verifySessionToken(token)
  if (!session) {
    res.status(401).json({ error: 'Unauthorized' })
    return null
  }

  if (!allowedRoles.includes(session.role)) {
    res.status(403).json({ error: 'Forbidden — this action requires a higher role' })
    return null
  }

  return session
}
