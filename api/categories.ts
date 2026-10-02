import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from './_lib/db.js'
import { requireAuth } from './_lib/guard.js'
import { methodRouter } from './_lib/handler.js'

// Consolidated from api/categories/{index,[id]}.ts into a single file so
// this project stays within the Hobby plan's 12 Serverless Function limit.
// vercel.json rewrites PUT/DELETE /api/categories/:id onto ?id=:id.

const WRITABLE_COLUMNS = new Set(['name_en', 'name_ta', 'is_active', 'sort_order'])

async function list(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return

  const activeOnly = req.query.active === 'true'
  const rows = activeOnly
    ? await sql`
        SELECT id, name_en, name_ta, is_active, sort_order
        FROM public.categories
        WHERE is_active = true
        ORDER BY sort_order ASC
      `
    : await sql`
        SELECT id, name_en, name_ta, is_active, sort_order
        FROM public.categories
        ORDER BY sort_order ASC
      `

  res.status(200).json({ data: rows })
}

async function create(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return
  const body = (req.body ?? {}) as Record<string, unknown>
  const nameEn = typeof body.name_en === 'string' ? body.name_en.trim() : ''
  if (!nameEn) {
    res.status(400).json({ error: 'Category name is required' })
    return
  }

  try {
    const rows = await sql`
      INSERT INTO public.categories (name_en, name_ta, is_active, sort_order)
      VALUES (
        ${nameEn},
        ${typeof body.name_ta === 'string' ? body.name_ta.trim() : ''},
        ${body.is_active !== false},
        ${typeof body.sort_order === 'number' ? body.sort_order : 0}
      )
      RETURNING id, name_en, name_ta, is_active, sort_order
    `
    res.status(201).json({ data: rows[0] })
  } catch (err) {
    if (err instanceof Error && 'code' in err && (err as { code?: string }).code === '23505') {
      res.status(409).json({ error: `A category named "${nameEn}" already exists.` })
      return
    }
    throw err
  }
}

async function put(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return
  const id = Number(req.query.id)
  const body = (req.body ?? {}) as Record<string, unknown>

  const updates: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(body)) {
    if (WRITABLE_COLUMNS.has(key)) {
      updates[key] = key === 'name_en' && typeof value === 'string' ? value.trim() : value
    }
  }
  if (updates.name_ta !== undefined && typeof updates.name_ta === 'string') {
    updates.name_ta = updates.name_ta.trim()
  }
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: 'No updatable fields provided' })
    return
  }

  try {
    const rows = await sql`
      UPDATE public.categories
      SET ${sql(updates)}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, name_en, name_ta, is_active, sort_order
    `
    if (rows.length === 0) {
      res.status(404).json({ error: 'Category not found' })
      return
    }
    res.status(200).json({ data: rows[0] })
  } catch (err) {
    if (err instanceof Error && (err as { code?: string }).code === '23505') {
      res.status(409).json({ error: `A category named "${String(updates.name_en ?? '')}" already exists.` })
      return
    }
    throw err
  }
}

async function del(req: VercelRequest, res: VercelResponse) {
  const session = requireAuth(req, res, ['admin'])
  if (!session) return
  const id = Number(req.query.id)
  if (!id || isNaN(id)) {
    res.status(400).json({ error: 'Valid category ID is required' })
    return
  }

  const force = req.query.force === 'true' || req.query.force === '1'
  const businessId = String(req.query.business_id || '1').trim()
  try {
    const rows = await sql`
      SELECT public.hard_delete_category(
        ${id}::bigint,
        ${businessId},
        ${session.portalId},
        ${force}
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
    if (msg.includes('contains') && msg.includes('products')) {
      res.status(409).json({ error: msg, requiresConfirmation: true })
      return
    }
    console.error('[categories.del] Hard delete failed:', err)
    res.status(500).json({ error: msg || 'Failed to hard delete category' })
  }
}

export default methodRouter({ GET: list, POST: create, PUT: put, DELETE: del })
