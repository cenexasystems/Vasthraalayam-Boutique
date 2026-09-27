import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from '../_lib/db'
import { requireAuth } from '../_lib/guard'
import { methodRouter } from '../_lib/handler'

const VARIANT_COLUMNS = `
  id, product_id, variant_name, size_label, weight_value, weight_unit,
  sku, barcode, purchase_price, mrp, price, stock, is_default, is_active,
  sort_order, image_url, group_name
`

const WRITABLE_COLUMNS = new Set([
  'product_id', 'variant_name', 'size_label', 'weight_value', 'weight_unit',
  'sku', 'barcode', 'purchase_price', 'mrp', 'price', 'stock', 'is_default',
  'is_active', 'sort_order', 'image_url', 'group_name',
])

async function list(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return
  const productId = req.query.product_id ? Number(req.query.product_id) : null

  const rows = productId
    ? await sql.unsafe(
        `SELECT ${VARIANT_COLUMNS} FROM public.product_variants WHERE is_active = true AND product_id = $1 ORDER BY sort_order ASC`,
        [productId],
      )
    : await sql.unsafe(`SELECT ${VARIANT_COLUMNS} FROM public.product_variants WHERE is_active = true ORDER BY sort_order ASC`)

  res.status(200).json({ data: rows })
}

async function create(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return
  const body = (req.body ?? {}) as Record<string, unknown>

  if (!body.product_id || !body.variant_name || typeof body.variant_name !== 'string' || !body.variant_name.trim()) {
    res.status(400).json({ error: 'product_id and variant_name are required' })
    return
  }

  const insertData: Record<string, unknown> = { is_active: true }
  for (const [key, value] of Object.entries(body)) {
    if (WRITABLE_COLUMNS.has(key)) insertData[key] = value
  }

  const rows = await sql`
    INSERT INTO public.product_variants ${sql(insertData)}
    RETURNING id, product_id, variant_name, size_label, price, stock
  `
  res.status(201).json({ data: rows[0] })
}

export default methodRouter({ GET: list, POST: create })
