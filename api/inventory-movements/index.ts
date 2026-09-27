import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from '../_lib/db'
import { requireAuth } from '../_lib/guard'
import { methodRouter } from '../_lib/handler'

function shape(row: Record<string, unknown>) {
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

async function list(req: VercelRequest, res: VercelResponse) {
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
  res.status(200).json({ data: rows.map(shape), total })
}

async function create(req: VercelRequest, res: VercelResponse) {
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

export default methodRouter({ GET: list, POST: create })
