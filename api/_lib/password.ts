import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const KEY_LENGTH = 64

/** Hashes a password with a random salt (scrypt, no extra dependency). Format: `<salt-hex>:<hash-hex>`. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, KEY_LENGTH).toString('hex')
  return `${salt}:${hash}`
}

/** Verifies a password against a hash produced by hashPassword(). */
export function verifyPasswordHash(password: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(':')
  if (!salt || !hash) return false
  const candidate = scryptSync(password, salt, KEY_LENGTH)
  const expected = Buffer.from(hash, 'hex')
  return candidate.length === expected.length && timingSafeEqual(candidate, expected)
}
