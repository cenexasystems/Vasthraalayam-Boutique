/**
 * Thin fetch client for the Neon-backed API routes under /api. Mirrors the
 * shape service files already expect from Supabase ({ data, error }) so
 * existing callers need minimal changes — see src/services/api.ts for the
 * (unused) precedent this follows.
 *
 * Auth: every request carries a signed session token (set via
 * setNeonSessionToken, called from useAdminAuthStore whenever it changes —
 * see src/store/store.ts) instead of a static secret. There is no static
 * portal token anymore: a VITE_-prefixed value would ship in the client
 * bundle for anyone to read, so credential verification now happens
 * server-side in api/auth/login.ts, which issues a short-lived, signed,
 * per-session token instead.
 */

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') || '/api'

let sessionToken: string | null = null

/** Called by useAdminAuthStore on login/logout/rehydration to keep this module's token in sync. */
export function setNeonSessionToken(token: string | null) {
  sessionToken = token
}

export interface NeonApiResult<T> {
  data: T | null
  error: Error | null
  /** Any other top-level fields the route returned alongside `data` (e.g. `total` for paginated lists). */
  meta?: Record<string, unknown>
}

async function request<T>(path: string, options: RequestInit = {}): Promise<NeonApiResult<T>> {
  try {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      ...(options.headers || {}),
    }

    const res = await fetch(`${BASE_URL}${path}`, { ...options, headers })
    const body = await res.json().catch(() => null)

    if (!res.ok) {
      const message = (body && typeof body === 'object' && 'error' in body ? String(body.error) : null)
        || `Request failed (${res.status})`
      return { data: null, error: new Error(message) }
    }

    const { data, ...meta } = (body ?? {}) as { data?: unknown } & Record<string, unknown>
    return { data: (data ?? body) as T, error: null, meta }
  } catch (err) {
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) }
  }
}

export const neonApi = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}

/**
 * Verifies portal credentials server-side and returns a signed session
 * token. Deliberately bypasses the `sessionToken` header above — you don't
 * have one yet when logging in.
 */
export async function authLogin(portalId: string, password: string): Promise<NeonApiResult<{ role: 'admin' | 'staff'; token: string; expiresAt: number }>> {
  return request(`/auth/login`, { method: 'POST', body: JSON.stringify({ portalId, password }) })
}
