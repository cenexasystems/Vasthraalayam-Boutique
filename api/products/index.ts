import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from '../_lib/db'
import { requireAuth } from '../_lib/guard'
import { methodRouter } from '../_lib/handler'

// Column names are a fixed, trusted constant (not user input) — safe to inline.
const PRODUCT_COLUMNS = `
  id, name, name_ta, tamil_name, category, category_id,
  remedy, price, offer_price, purchase_price, unit_type, unit_label,
  base_quantity, stock_quantity, stock_unit, allow_decimal_quantity,
  predefined_options, is_active, sort_order, unit, rating,
  description, description_ta, benefits, benefits_ta,
  image_url, image, has_variants, barcode, sku, item_type, low_stock_alert
`

const WRITABLE_COLUMNS = new Set([
  'name', 'name_ta', 'tamil_name', 'category', 'category_id', 'price', 'offer_price',
  'purchase_price', 'mrp', 'gst_percent', 'unit_type', 'unit_label', 'unit',
  'base_quantity', 'stock_quantity', 'stock', 'stock_unit', 'low_stock_alert',
  'allow_decimal_quantity', 'predefined_options', 'description', 'description_ta',
  'benefits', 'benefits_ta', 'image', 'image_url', 'sku', 'barcode', 'brand',
  'supplier', 'size', 'color', 'rating', 'has_variants', 'is_active', 'sort_order',
  'item_type',
])

async function list(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return
  const rows = await sql.unsafe(`SELECT ${PRODUCT_COLUMNS} FROM public.products ORDER BY sort_order ASC`)
  res.status(200).json({ data: rows })
}

async function create(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return
  const body = (req.body ?? {}) as Record<string, unknown>

  if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
    res.status(400).json({ error: 'Product name is required' })
    return
  }

  const insertData: Record<string, unknown> = { is_active: true }
  for (const [key, value] of Object.entries(body)) {
    if (WRITABLE_COLUMNS.has(key)) insertData[key] = value
  }

  const rows = await sql`
    INSERT INTO public.products ${sql(insertData)}
    RETURNING id, name
  `
  res.status(201).json({ data: rows[0] })
}

export default methodRouter({ GET: list, POST: create })
