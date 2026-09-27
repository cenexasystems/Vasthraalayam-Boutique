import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from '../_lib/db'
import { requireAuth } from '../_lib/guard'
import { methodRouter } from '../_lib/handler'

async function adjust(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return
  const body = (req.body ?? {}) as Record<string, unknown>

  if (!body.product_id || body.new_quantity === undefined) {
    res.status(400).json({ error: 'product_id and new_quantity are required' })
    return
  }

  // adjust_inventory_stock() RETURNS JSONB — same aliasing note as receive.ts.
  const [row] = await sql`
    SELECT public.adjust_inventory_stock(
      p_product_id => ${Number(body.product_id)},
      p_variant_id => ${(body.variant_id as string) ?? null},
      p_new_quantity => ${Number(body.new_quantity)},
      p_reason => ${(body.reason as string) ?? 'RESTOCK'},
      p_note => ${(body.note as string) ?? ''},
      p_created_by_name => ${(body.created_by_name as string) ?? 'Admin'}
    ) AS result
  `
  res.status(200).json({ data: row.result })
}

export default methodRouter({ POST: adjust })
