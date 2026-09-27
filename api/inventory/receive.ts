import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from '../_lib/db'
import { requireAuth } from '../_lib/guard'
import { methodRouter } from '../_lib/handler'

async function receive(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return
  const body = (req.body ?? {}) as Record<string, unknown>

  if (!body.product_id) {
    res.status(400).json({ error: 'product_id is required' })
    return
  }

  // create_barcode_and_receive_stock() RETURNS JSONB — alias it so
  // postgres.js deserializes the value instead of giving one unnamed column.
  const [row] = await sql`
    SELECT public.create_barcode_and_receive_stock(
      p_product_id => ${Number(body.product_id)},
      p_variant_id => ${(body.variant_id as string) ?? null},
      p_quantity_received => ${Number(body.quantity_received ?? 0)},
      p_unit_cost => ${body.unit_cost != null ? Number(body.unit_cost) : null},
      p_created_by_name => ${(body.created_by_name as string) ?? 'Admin'},
      p_custom_barcode => ${(body.custom_barcode as string) ?? null},
      p_note => ${(body.note as string) ?? ''}
    ) AS result
  `
  res.status(200).json({ data: row.result })
}

export default methodRouter({ POST: receive })
