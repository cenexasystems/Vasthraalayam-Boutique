import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from './_lib/db.js'
import { requireAuth } from './_lib/guard.js'
import { methodRouter } from './_lib/handler.js'

// Consolidated from api/variants/{index,[id]}.ts into a single file so this
// project stays within the Hobby plan's 12 Serverless Function limit.
// vercel.json rewrites GET/PUT/DELETE /api/variants/:id onto ?id=:id.

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
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  const productId = req.query.product_id ? Number(req.query.product_id) : null

  const rows = productId
    ? await sql.unsafe(
        `SELECT ${VARIANT_COLUMNS} FROM public.product_variants WHERE is_active = true AND product_id = $1 ORDER BY sort_order ASC`,
        [productId],
      )
    : await sql.unsafe(`SELECT ${VARIANT_COLUMNS} FROM public.product_variants WHERE is_active = true ORDER BY sort_order ASC`)

  res.status(200).json({ data: rows })
}

async function getById(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  const id = String(req.query.id)
  const rows = await sql`SELECT id, product_id, stock FROM public.product_variants WHERE id = ${id} LIMIT 1`
  if (rows.length === 0) {
    res.status(404).json({ error: 'Variant not found' })
    return
  }
  res.status(200).json({ data: rows[0] })
}

async function get(req: VercelRequest, res: VercelResponse) {
  if (req.query.id !== undefined) return getById(req, res)
  return list(req, res)
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
  const session = requireAuth(req, res, ['admin'])
  if (!session) return
  const id = String(req.query.id)
  if (!id) {
    res.status(400).json({ error: 'Variant ID is required' })
    return
  }

  const businessId = String(req.query.business_id || '1').trim()
  try {
    const rows = await sql`
      SELECT public.hard_delete_variant(
        ${id}::uuid,
        ${businessId},
        ${session.portalId}
      ) AS result
    `
    const result = rows[0]?.result as Record<string, unknown>
    res.status(200).json({ data: result })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('not found')) {
      res.status(404).json({ error: msg })
      return
    }
    console.error('[variants.del] Hard delete failed:', err)
    res.status(500).json({ error: msg || 'Failed to hard delete variant' })
  }
}

export default methodRouter({ GET: get, POST: create, PUT: put, DELETE: del })
