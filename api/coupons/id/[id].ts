import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from '../../_lib/db'
import { requireAuth } from '../../_lib/guard'
import { methodRouter } from '../../_lib/handler'

// Nested under /coupons/id/:id (not /coupons/:id) to avoid colliding with
// the code-based public lookup route at /coupons/[code].ts — Vercel's
// file-router can't have two dynamic siblings matching the same shape.

const WRITABLE_COLUMNS = new Set(['code', 'percentage', 'is_active', 'expiry_date', 'usage_limit', 'min_order_value'])

async function put(req: VercelRequest, res: VercelResponse) {
  // Coupon management is an admin-only tab in the Dashboard UI — mirrored here.
  if (!requireAuth(req, res, ['admin'])) return
  const id = Number(req.query.id)
  const body = (req.body ?? {}) as Record<string, unknown>

  const updates: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(body)) {
    if (!WRITABLE_COLUMNS.has(key)) continue
    if (key === 'code' && typeof value === 'string') {
      updates.code = value.trim().toUpperCase()
    } else if (key === 'expiry_date') {
      updates.expiry_date = value ? new Date(value as string) : null
    } else {
      updates[key] = value
    }
  }
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: 'No updatable fields provided' })
    return
  }

  try {
    const rows = await sql`
      UPDATE public.coupons
      SET ${sql(updates)}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, code, percentage, is_active, expiry_date, usage_limit, usage_count, min_order_value
    `
    if (rows.length === 0) {
      res.status(404).json({ error: 'Coupon not found' })
      return
    }
    res.status(200).json({ data: rows[0] })
  } catch (err) {
    if (err instanceof Error && (err as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'Coupon code already exists.' })
      return
    }
    throw err
  }
}

async function del(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res, ['admin'])) return
  const id = Number(req.query.id)
  const rows = await sql`DELETE FROM public.coupons WHERE id = ${id} RETURNING id`
  if (rows.length === 0) {
    res.status(404).json({ error: 'Coupon not found' })
    return
  }
  res.status(200).json({ data: { id } })
}

export default methodRouter({ PUT: put, DELETE: del })
