import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from './_lib/db.js'
import { requireAuth } from './_lib/guard.js'
import { methodRouter } from './_lib/handler.js'

// Consolidated from api/inventory/{adjust,receive}.ts and api/inventory-movements.ts
// into a single file so this project stays comfortably within the Hobby plan's
// 12 Serverless Function limit.
// vercel.json rewrites:
//   POST /api/inventory/adjust     -> ?action=adjust
//   POST /api/inventory/receive    -> ?action=receive
//   GET/POST /api/inventory-movements -> ?resource=movements

function shapeMovement(row: Record<string, unknown>) {
  return {
    id: row.id,
    product_id: row.product_id,
    variant_id: row.variant_id,
    barcode_id: row.barcode_id,
    movement_type: row.movement_type,
    quantity_delta: row.quantity_delta,
    quantity_before: row.quantity_before,
    quantity_after: row.quantity_after,
    unit_cost: row.unit_cost,
    reference_type: row.reference_type,
    reference_id: row.reference_id,
    note: row.note,
    created_by_name: row.created_by_name,
    created_at: row.created_at,
    product: row.p_id != null ? { id: row.p_id, name: row.p_name, name_ta: row.p_name_ta, image_url: row.p_image_url } : null,
    variant: row.v_id != null ? { id: row.v_id, variant_name: row.v_variant_name, sku: row.v_sku } : null,
  }
}

async function listMovements(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return

  const productId = req.query.product_id ? Number(req.query.product_id) : null
  const variantId = typeof req.query.variant_id === 'string' ? req.query.variant_id : null
  const movementType = typeof req.query.movement_type === 'string' ? req.query.movement_type : null
  const startDate = typeof req.query.start_date === 'string' ? req.query.start_date : null
  const endDate = typeof req.query.end_date === 'string' ? req.query.end_date : null
  const limit = Math.min(Number(req.query.limit) || 100, 1000)
  const offset = Number(req.query.offset) || 0

  const conditions = [sql`TRUE`]
  if (productId) conditions.push(sql`m.product_id = ${productId}`)
  if (variantId) conditions.push(sql`m.variant_id = ${variantId}`)
  if (movementType) conditions.push(sql`m.movement_type = ${movementType}`)
  if (startDate) conditions.push(sql`m.created_at >= ${startDate}`)
  if (endDate) conditions.push(sql`m.created_at <= ${endDate}`)

  let whereClause = conditions[0]
  for (let i = 1; i < conditions.length; i++) {
    whereClause = sql`${whereClause} AND ${conditions[i]}`
  }

  const rows = await sql`
    SELECT
      m.id, m.product_id, m.variant_id, m.barcode_id, m.movement_type,
      m.quantity_delta, m.quantity_before, m.quantity_after, m.unit_cost,
      m.reference_type, m.reference_id, m.note, m.created_by_name, m.created_at,
      p.id AS p_id, p.name AS p_name, p.name_ta AS p_name_ta, p.image_url AS p_image_url,
      v.id AS v_id, v.variant_name AS v_variant_name, v.sku AS v_sku,
      COUNT(*) OVER()::int AS total_count
    FROM public.inventory_movements m
    LEFT JOIN public.products p ON p.id = m.product_id
    LEFT JOIN public.product_variants v ON v.id = m.variant_id
    WHERE ${whereClause}
    ORDER BY m.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `

  const total = rows.length > 0 ? Number(rows[0].total_count) : 0
  res.status(200).json({ data: rows.map(shapeMovement), total })
}

async function createMovement(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return
  const body = (req.body ?? {}) as Record<string, unknown>

  if (!body.movement_type || body.quantity_delta === undefined) {
    res.status(400).json({ error: 'movement_type and quantity_delta are required' })
    return
  }

  const rows = await sql`
    INSERT INTO public.inventory_movements (
      product_id, variant_id, barcode_id, movement_type, quantity_delta,
      quantity_before, quantity_after, unit_cost, reference_type, reference_id,
      note, created_by_name
    ) VALUES (
      ${(body.product_id as number) ?? null}, ${(body.variant_id as string) ?? null}, ${(body.barcode_id as string) ?? null},
      ${body.movement_type as string}, ${Number(body.quantity_delta)},
      ${Number(body.quantity_before ?? 0)}, ${Number(body.quantity_after ?? 0)},
      ${body.unit_cost != null ? Number(body.unit_cost) : null},
      ${(body.reference_type as string) ?? null}, ${(body.reference_id as string) ?? null},
      ${(body.note as string) ?? ''}, ${(body.created_by_name as string) ?? 'Admin'}
    )
    RETURNING id
  `
  res.status(201).json({ data: rows[0] })
}

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

async function get(req: VercelRequest, res: VercelResponse) {
  if (req.query.resource === 'movements') return listMovements(req, res)
  res.status(404).json({ error: 'Not found' })
}

async function post(req: VercelRequest, res: VercelResponse) {
  if (req.query.resource === 'movements') return createMovement(req, res)
  if (req.query.action === 'receive') return receive(req, res)
  if (req.query.action === 'adjust') return adjust(req, res)
  res.status(404).json({ error: 'Unknown inventory action' })
}

async function del(req: VercelRequest, res: VercelResponse) {
  if (req.query.resource === 'movements') {
    const session = requireAuth(req, res, ['admin'])
    if (!session) return
    const id = Number(req.query.id)
    if (!id || isNaN(id)) {
      res.status(400).json({ error: 'Valid movement ID is required' })
      return
    }
    const businessId = String(req.query.business_id || '1').trim()
    try {
      const rows = await sql`
        SELECT public.hard_delete_inventory_movement(
          ${id}::bigint,
          ${businessId},
          ${session.portalId}
        ) AS result
      `
      res.status(200).json({ data: rows[0]?.result })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('not found')) {
        res.status(404).json({ error: msg })
        return
      }
      console.error('[inventory.del] Hard delete failed:', err)
      res.status(500).json({ error: msg || 'Failed to hard delete movement' })
    }
    return
  }
  res.status(404).json({ error: 'Unknown inventory resource for delete' })
}

export default methodRouter({ GET: get, POST: post, DELETE: del })
