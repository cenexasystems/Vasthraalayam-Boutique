import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from '../_lib/db'
import { requireAuth } from '../_lib/guard'
import { methodRouter } from '../_lib/handler'

const WRITABLE_COLUMNS = new Set([
  'variant_name', 'size_label', 'weight_value', 'weight_unit',
  'sku', 'barcode', 'purchase_price', 'mrp', 'price', 'stock', 'is_default',
  'is_active', 'sort_order', 'image_url', 'group_name',
])

async function get(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return
  const id = String(req.query.id)
  const rows = await sql`SELECT id, product_id, stock FROM public.product_variants WHERE id = ${id} LIMIT 1`
  if (rows.length === 0) {
    res.status(404).json({ error: 'Variant not found' })
    return
  }
  res.status(200).json({ data: rows[0] })
}

async function put(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return
  const id = String(req.query.id)
  const body = (req.body ?? {}) as Record<string, unknown>

  const updates: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(body)) {
    if (WRITABLE_COLUMNS.has(key)) updates[key] = value
  }
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: 'No updatable fields provided' })
    return
  }

  // Note: setting is_default = true here is enough on its own — the
  // ensure_one_default_variant_trigger (neon/migrations/0001) automatically
  // clears the flag on the product's other variants, no separate call needed.
  const rows = await sql`
    UPDATE public.product_variants
    SET ${sql(updates)}, updated_at = NOW()
    WHERE id = ${id}
    RETURNING id
  `
  if (rows.length === 0) {
    res.status(404).json({ error: 'Variant not found' })
    return
  }
  res.status(200).json({ data: rows[0] })
}

async function del(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return
  const id = String(req.query.id)
  // Soft delete, matching the existing deleteVariant() behavior.
  const rows = await sql`
    UPDATE public.product_variants SET is_active = false, updated_at = NOW()
    WHERE id = ${id}
    RETURNING id
  `
  if (rows.length === 0) {
    res.status(404).json({ error: 'Variant not found' })
    return
  }
  res.status(200).json({ data: { id } })
}

export default methodRouter({ GET: get, PUT: put, DELETE: del })
