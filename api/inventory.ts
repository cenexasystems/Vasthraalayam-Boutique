import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from './_lib/db.js'
import { requireAuth } from './_lib/guard.js'
import { methodRouter } from './_lib/handler.js'

// Consolidated from api/inventory/{adjust,receive}.ts into a single file so
// this project stays within the Hobby plan's 12 Serverless Function limit.
// vercel.json rewrites:
//   POST /api/inventory/adjust  -> ?action=adjust
//   POST /api/inventory/receive -> ?action=receive

async function adjust(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return
  const body = (req.body ?? {}) as Record<string, unknown>

  if (!body.product_id || body.new_quantity === undefined) {
    res.status(400).json({ error: 'product_id and new_quantity are required' })
    return
  }

  // adjust_inventory_stock() RETURNS JSONB — same aliasing note as receive.
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

async function post(req: VercelRequest, res: VercelResponse) {
  if (req.query.action === 'receive') return receive(req, res)
  if (req.query.action === 'adjust') return adjust(req, res)
  res.status(404).json({ error: 'Unknown inventory action' })
}

export default methodRouter({ POST: post })
