import type { VercelRequest, VercelResponse } from '@vercel/node'

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
type RouteHandler = (req: VercelRequest, res: VercelResponse) => Promise<void> | void

/**
 * Routes a Vercel function by HTTP method and wraps every handler with a
 * consistent error response. Postgres `RAISE EXCEPTION` messages from our
 * SQL functions (e.g. "Insufficient stock for X") are written as user-facing
 * validation text, so they're safe to surface directly — same behavior the
 * Supabase RPC error path had.
 */
export function methodRouter(handlers: Partial<Record<Method, RouteHandler>>) {
  return async (req: VercelRequest, res: VercelResponse) => {
    const method = (req.method || 'GET').toUpperCase() as Method
    const fn = handlers[method]

    if (!fn) {
      res.setHeader('Allow', Object.keys(handlers).join(', '))
      res.status(405).json({ error: `Method ${method} not allowed` })
      return
    }

    try {
      await fn(req, res)
    } catch (err) {
      console.error('[api]', req.url, err)
      const message = err instanceof Error ? err.message : 'Internal server error'
      res.status(400).json({ error: message })
    }
  }
}
