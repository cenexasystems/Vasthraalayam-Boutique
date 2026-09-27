import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from '../_lib/db'
import { requireAuth } from '../_lib/guard'
import { methodRouter } from '../_lib/handler'

type Row = Record<string, unknown>

function shape(row: Row) {
  return {
    id: row.id,
    barcode_value: row.barcode_value,
    entity_type: row.entity_type,
    product_id: row.product_id,
    variant_id: row.variant_id,
    is_active: row.is_active,
    created_by_name: row.created_by_name,
    created_at: row.created_at,
    updated_at: row.updated_at,
    product: row.p_id != null ? {
      id: row.p_id, name: row.p_name, name_ta: row.p_name_ta, price: row.p_price,
      offer_price: row.p_offer_price, image_url: row.p_image_url, category: row.p_category,
    } : null,
    variant: row.v_id != null ? {
      id: row.v_id, variant_name: row.v_variant_name, price: row.v_price, stock: row.v_stock, sku: row.v_sku,
    } : null,
  }
}

async function list(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return

  const search = typeof req.query.search === 'string' ? req.query.search.trim() : ''
  const limit = Math.min(Number(req.query.limit) || 50, 200)
  const offset = Number(req.query.offset) || 0

  const where = search ? sql`WHERE br.barcode_value ILIKE ${'%' + search + '%'}` : sql``

  const rows = await sql`
    SELECT
      br.id, br.barcode_value, br.entity_type, br.product_id, br.variant_id, br.is_active,
      br.created_by_name, br.created_at, br.updated_at,
      p.id AS p_id, p.name AS p_name, p.name_ta AS p_name_ta, p.price AS p_price,
      p.offer_price AS p_offer_price, p.image_url AS p_image_url, p.category AS p_category,
      v.id AS v_id, v.variant_name AS v_variant_name, v.price AS v_price, v.stock AS v_stock, v.sku AS v_sku,
      COUNT(*) OVER()::int AS total_count
    FROM public.barcode_registry br
    LEFT JOIN public.products p ON p.id = br.product_id
    LEFT JOIN public.product_variants v ON v.id = br.variant_id
    ${where}
    ORDER BY br.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `

  const total = rows.length > 0 ? Number(rows[0].total_count) : 0
  res.status(200).json({ data: rows.map(shape), total })
}

async function upsert(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return
  const body = (req.body ?? {}) as Record<string, unknown>

  const barcodeValue = typeof body.barcode_value === 'string' ? body.barcode_value.trim() : ''
  if (!barcodeValue || !body.product_id) {
    res.status(400).json({ error: 'barcode_value and product_id are required' })
    return
  }

  const entityType = body.variant_id ? 'variant' : 'product'

  const rows = await sql`
    INSERT INTO public.barcode_registry (barcode_value, entity_type, product_id, variant_id, is_active)
    VALUES (${barcodeValue}, ${entityType}, ${Number(body.product_id)}, ${(body.variant_id as string) ?? null}, true)
    ON CONFLICT (barcode_value) DO UPDATE SET
      product_id = EXCLUDED.product_id,
      variant_id = EXCLUDED.variant_id,
      entity_type = EXCLUDED.entity_type,
      is_active = true,
      updated_at = NOW()
    RETURNING id, barcode_value, entity_type, product_id, variant_id
  `
  res.status(200).json({ data: rows[0] })
}

export default methodRouter({ GET: list, POST: upsert })
