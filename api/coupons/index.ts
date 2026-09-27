import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from '../_lib/db'
import { requireAuth } from '../_lib/guard'
import { methodRouter } from '../_lib/handler'

const COUPON_COLUMNS = 'id, code, percentage, is_active, expiry_date, usage_limit, usage_count, min_order_value, created_at'

async function list(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return

  const activeOnly = req.query.active === 'true'
  const limit = Math.min(Number(req.query.limit) || 100, 500)

  const rows = activeOnly
    ? await sql.unsafe(`SELECT ${COUPON_COLUMNS} FROM public.coupons WHERE is_active = true ORDER BY created_at DESC LIMIT $1`, [limit])
    : await sql.unsafe(`SELECT ${COUPON_COLUMNS} FROM public.coupons ORDER BY created_at DESC LIMIT $1`, [limit])

  res.status(200).json({ data: rows })
}

async function create(req: VercelRequest, res: VercelResponse) {
  // Coupon management is an admin-only tab in the Dashboard UI — mirrored here.
  if (!requireAuth(req, res, ['admin'])) return
  const body = (req.body ?? {}) as Record<string, unknown>

  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : ''
  const percentage = Number(body.percentage)
  if (!code || !Number.isFinite(percentage) || percentage <= 0 || percentage > 100) {
    res.status(400).json({ error: 'A coupon code and a percentage between 0 and 100 are required' })
    return
  }

  try {
    const rows = await sql`
      INSERT INTO public.coupons (code, percentage, is_active, expiry_date, usage_limit, min_order_value)
      VALUES (
        ${code},
        ${percentage},
        ${body.is_active !== false},
        ${body.expiry_date ? new Date(body.expiry_date as string) : null},
        ${body.usage_limit ? Number(body.usage_limit) : null},
        ${body.min_order_value ? Number(body.min_order_value) : 0}
      )
      RETURNING id, code, percentage, is_active, expiry_date, usage_limit, usage_count, min_order_value, created_at
    `
    res.status(201).json({ data: rows[0] })
  } catch (err) {
    if (err instanceof Error && (err as { code?: string }).code === '23505') {
      res.status(409).json({ error: `Coupon code "${code}" already exists.` })
      return
    }
    throw err
  }
}

export default methodRouter({ GET: list, POST: create })
