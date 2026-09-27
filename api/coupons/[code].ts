import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from '../_lib/db'
import { requireAuth } from '../_lib/guard'
import { methodRouter } from '../_lib/handler'

async function get(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return
  const code = String(req.query.code || '').trim()

  const rows = await sql`
    SELECT code, percentage, is_active, expiry_date, usage_limit, usage_count, min_order_value
    FROM public.coupons
    WHERE is_active = true AND UPPER(BTRIM(code)) = UPPER(BTRIM(${code}))
    LIMIT 1
  `

  if (rows.length === 0) {
    res.status(404).json({ error: 'Invalid or expired coupon code' })
    return
  }

  res.status(200).json({ data: rows[0] })
}

export default methodRouter({ GET: get })
