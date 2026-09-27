import { createHmac, timingSafeEqual } from 'node:crypto'

export type Role = 'admin' | 'staff'

export interface SessionPayload {
  role: Role
  portalId: string
  iat: number
  exp: number
}

const SESSION_TTL_SECONDS = 12 * 60 * 60 // 12h — sessionStorage already clears on tab close; this bounds a leaked token's lifetime too.

function sign(payloadB64: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadB64).digest('base64url')
}

function requireSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (!secret) {
    throw new Error('SESSION_SECRET is not configured on the server')
  }
  return secret
}

/**
 * Issues a signed, tamper-evident session token after credentials have
 * already been verified server-side (see api/auth/login.ts). The role is
 * embedded in the signed payload — a client cannot change it by editing
 * localStorage/sessionStorage or request headers without invalidating the
 * signature.
 */
export function issueSessionToken(role: Role, portalId: string): { token: string; expiresAt: number } {
  const secret = requireSecret()
  const now = Math.floor(Date.now() / 1000)
  const payload: SessionPayload = { role, portalId, iat: now, exp: now + SESSION_TTL_SECONDS }
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const signature = sign(payloadB64, secret)
  return { token: `${payloadB64}.${signature}`, expiresAt: payload.exp }
}

/**
 * Verifies a session token's signature and expiry. Returns the decoded
 * payload only if the signature matches (constant-time comparison) and the
 * token has not expired; otherwise null.
 */
export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token) return null
  const secret = process.env.SESSION_SECRET
  if (!secret) return null

  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [payloadB64, signature] = parts

  const expectedSignature = sign(payloadB64, secret)
  const provided = Buffer.from(signature)
  const expected = Buffer.from(expectedSignature)
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null
  }

  let payload: SessionPayload
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'))
  } catch {
    return null
  }

  if (payload.role !== 'admin' && payload.role !== 'staff') return null
  if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null

  return payload
}
