import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from './_lib/db.js'
import { requireAuth } from './_lib/guard.js'
import { methodRouter } from './_lib/handler.js'

// Consolidated from api/coupons/{index,[code],id/[id]}.ts into a single file
// so this project stays within the Hobby plan's 12 Serverless Function
// limit. vercel.json rewrites:
//   GET /api/coupons/:code    -> ?code=:code   (public lookup)
//   PUT/DELETE /api/coupons/id/:id -> ?id=:id  (admin management)

const COUPON_COLUMNS = 'id, code, percentage, is_active, expiry_date, usage_limit, usage_count, min_order_value, created_at'
const WRITABLE_COLUMNS = new Set(['code', 'percentage', 'is_active', 'expiry_date', 'usage_limit', 'min_order_value'])

async function list(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return

  const activeOnly = req.query.active === 'true'
  const limit = Math.min(Number(req.query.limit) || 100, 500)

  const rows = activeOnly
    ? await sql.unsafe(`SELECT ${COUPON_COLUMNS} FROM public.coupons WHERE is_active = true ORDER BY created_at DESC LIMIT $1`, [limit])
    : await sql.unsafe(`SELECT ${COUPON_COLUMNS} FROM public.coupons ORDER BY created_at DESC LIMIT $1`, [limit])

  res.status(200).json({ data: rows })
}

async function getByCode(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return
  const code = String(req.query.code || '').trim()

  const rows = await sql`
    SELECT code, percentage, is_active, expiry_date, usage_limit, usage_count, min_order_value
    FROM public.coupons
    WHERE is_active = true AND UPPER(BTRIM(code)) = UPPER(BTRIM(${code}))
    LIMIT 1
  `

  if (rows.length === 0) {
    res.status(404).json({ error: 'Invalid or expired coupon code' })
    return
  }

  res.status(200).json({ data: rows[0] })
}

async function get(req: VercelRequest, res: VercelResponse) {
  if (req.query.code !== undefined) return getByCode(req, res)
  return list(req, res)
}

async function create(req: VercelRequest, res: VercelResponse) {
  // Coupon management is an admin-only tab in the Dashboard UI — mirrored here.
  if (!requireAuth(req, res, ['admin'])) return
  const body = (req.body ?? {}) as Record<string, unknown>

  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : ''
  const percentage = Number(body.percentage)
  if (!code || !Number.isFinite(percentage) || percentage <= 0 || percentage > 100) {
    res.status(400).json({ error: 'A coupon code and a percentage between 0 and 100 are required' })
    return
  }

  try {
    const rows = await sql`
      INSERT INTO public.coupons (code, percentage, is_active, expiry_date, usage_limit, min_order_value)
      VALUES (
        ${code},
        ${percentage},
        ${body.is_active !== false},
        ${body.expiry_date ? new Date(body.expiry_date as string) : null},
        ${body.usage_limit ? Number(body.usage_limit) : null},
        ${body.min_order_value ? Number(body.min_order_value) : 0}
      )
      RETURNING id, code, percentage, is_active, expiry_date, usage_limit, usage_count, min_order_value, created_at
    `
    res.status(201).json({ data: rows[0] })
  } catch (err) {
    if (err instanceof Error && (err as { code?: string }).code === '23505') {
      res.status(409).json({ error: `Coupon code "${code}" already exists.` })
      return
    }
    throw err
  }
}

async function put(req: VercelRequest, res: VercelResponse) {
  // Coupon management is an admin-only tab in the Dashboard UI — mirrored here.
  if (!requireAuth(req, res, ['admin'])) return
  const id = Number(req.query.id)
  const body = (req.body ?? {}) as Record<string, unknown>

  const updates: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(body)) {
    if (!WRITABLE_COLUMNS.has(key)) continue
    if (key === 'code' && typeof value === 'string') {
      updates.code = value.trim().toUpperCase()
    } else if (key === 'expiry_date') {
      updates.expiry_date = value ? new Date(value as string) : null
    } else {
      updates[key] = value
    }
  }
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: 'No updatable fields provided' })
    return
  }

  try {
    const rows = await sql`
      UPDATE public.coupons
      SET ${sql(updates)}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, code, percentage, is_active, expiry_date, usage_limit, usage_count, min_order_value
    `
    if (rows.length === 0) {
      res.status(404).json({ error: 'Coupon not found' })
      return
    }
    res.status(200).json({ data: rows[0] })
  } catch (err) {
    if (err instanceof Error && (err as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'Coupon code already exists.' })
      return
    }
    throw err
  }
}

async function del(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res, ['admin'])) return
  const id = Number(req.query.id)
  const rows = await sql`DELETE FROM public.coupons WHERE id = ${id} RETURNING id`
  if (rows.length === 0) {
    res.status(404).json({ error: 'Coupon not found' })
    return
  }
  res.status(200).json({ data: { id } })
}

export default methodRouter({ GET: get, POST: create, PUT: put, DELETE: del })
