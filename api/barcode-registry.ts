import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from './_lib/db.js'
import { requireAuth } from './_lib/guard.js'
import { methodRouter } from './_lib/handler.js'

// Consolidated from api/barcode-registry/{index,[id],lookup/[code]}.ts into a
// single file so this project stays within the Hobby plan's 12 Serverless
// Function limit. vercel.json rewrites the old sub-paths onto query params:
//   GET  /api/barcode-registry/lookup/:code -> ?action=lookup&code=:code
//   PATCH /api/barcode-registry/:id         -> ?id=:id

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

// 3-tier fallback lookup, matching barcodeService.lookupBarcode's original
// client-side logic: registry first, then product_variants.barcode, then
// products.barcode. Normalizes to uppercase since hardware scanners can emit
// lowercase.
async function lookup(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return
  const code = String(req.query.code || '').trim().toUpperCase()
  if (!code) {
    res.status(200).json({ data: null })
    return
  }

  const [registryRow] = await sql`
    SELECT
      br.id, br.barcode_value, br.entity_type, br.product_id, br.variant_id, br.is_active,
      br.created_by_name, br.created_at, br.updated_at,
      p.id AS p_id, p.name AS p_name, p.name_ta AS p_name_ta, p.price AS p_price,
      p.offer_price AS p_offer_price, p.image_url AS p_image_url, p.category AS p_category,
      v.id AS v_id, v.variant_name AS v_variant_name, v.price AS v_price, v.stock AS v_stock, v.sku AS v_sku
    FROM public.barcode_registry br
    LEFT JOIN public.products p ON p.id = br.product_id
    LEFT JOIN public.product_variants v ON v.id = br.variant_id
    WHERE UPPER(br.barcode_value) = ${code} AND br.is_active = true
    LIMIT 1
  `
  if (registryRow) {
    res.status(200).json({
      data: {
        id: registryRow.id,
        barcode_value: registryRow.barcode_value,
        entity_type: registryRow.entity_type,
        product_id: registryRow.product_id,
        variant_id: registryRow.variant_id,
        is_active: registryRow.is_active,
        created_by_name: registryRow.created_by_name,
        created_at: registryRow.created_at,
        updated_at: registryRow.updated_at,
        product: registryRow.p_id != null ? {
          id: registryRow.p_id, name: registryRow.p_name, name_ta: registryRow.p_name_ta,
          price: registryRow.p_price, offer_price: registryRow.p_offer_price,
          image_url: registryRow.p_image_url, category: registryRow.p_category,
        } : null,
        variant: registryRow.v_id != null ? {
          id: registryRow.v_id, variant_name: registryRow.v_variant_name,
          price: registryRow.v_price, stock: registryRow.v_stock, sku: registryRow.v_sku,
        } : null,
      },
    })
    return
  }

  const [variantRow] = await sql`
    SELECT v.id, v.product_id, v.variant_name, v.price, v.stock, v.sku,
           p.id AS p_id, p.name AS p_name, p.name_ta AS p_name_ta, p.price AS p_price,
           p.offer_price AS p_offer_price, p.image_url AS p_image_url, p.category AS p_category
    FROM public.product_variants v
    LEFT JOIN public.products p ON p.id = v.product_id
    WHERE UPPER(v.barcode) = ${code}
    LIMIT 1
  `
  if (variantRow) {
    const now = new Date().toISOString()
    res.status(200).json({
      data: {
        id: `var-${variantRow.id}`, barcode_value: code, entity_type: 'variant',
        product_id: variantRow.product_id, variant_id: variantRow.id, is_active: true,
        created_by_name: 'System', created_at: now, updated_at: now,
        product: { id: variantRow.p_id, name: variantRow.p_name, name_ta: variantRow.p_name_ta, price: variantRow.p_price, offer_price: variantRow.p_offer_price, image_url: variantRow.p_image_url, category: variantRow.p_category },
        variant: { id: variantRow.id, variant_name: variantRow.variant_name, price: variantRow.price, stock: variantRow.stock, sku: variantRow.sku },
      },
    })
    return
  }

  const [productRow] = await sql`
    SELECT id, name, name_ta, price, offer_price, image_url, category, barcode, stock_quantity
    FROM public.products WHERE UPPER(barcode) = ${code} LIMIT 1
  `
  if (productRow) {
    const now = new Date().toISOString()
    res.status(200).json({
      data: {
        id: `prod-${productRow.id}`, barcode_value: code, entity_type: 'product',
        product_id: productRow.id, variant_id: null, is_active: true,
        created_by_name: 'System', created_at: now, updated_at: now,
        product: productRow, variant: null,
      },
    })
    return
  }

  res.status(200).json({ data: null })
}

async function get(req: VercelRequest, res: VercelResponse) {
  if (req.query.action === 'lookup') return lookup(req, res)
  return list(req, res)
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

async function patch(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return
  const id = String(req.query.id)
  const body = (req.body ?? {}) as { is_active?: boolean }

  const rows = await sql`
    UPDATE public.barcode_registry
    SET is_active = ${body.is_active ?? false}, updated_at = NOW()
    WHERE id = ${id}
    RETURNING id
  `
  if (rows.length === 0) {
    res.status(404).json({ error: 'Barcode not found' })
    return
  }
  res.status(200).json({ data: rows[0] })
}

export default methodRouter({ GET: get, POST: upsert, PATCH: patch })
