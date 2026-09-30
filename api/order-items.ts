import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from './_lib/db.js'
import { requireAuth } from './_lib/guard.js'
import { methodRouter } from './_lib/handler.js'

async function list(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return

  const orderIdsParam = typeof req.query.order_ids === 'string' ? req.query.order_ids : ''
  const orderIds = orderIdsParam.split(',').map((s) => s.trim()).filter(Boolean)
  if (orderIds.length === 0) {
    res.status(200).json({ data: [] })
    return
  }

  const rows = await sql`
    SELECT order_id, product_id, product_name, variant_name, category, quantity, line_total, is_manual, source
    FROM public.order_items
    WHERE order_id IN ${sql(orderIds)}
  `
  res.status(200).json({ data: rows })
}

export default methodRouter({ GET: list })
