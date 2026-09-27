import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from '../_lib/db'
import { requireAuth } from '../_lib/guard'
import { methodRouter } from '../_lib/handler'

const WRITABLE_COLUMNS = new Set(['name_en', 'name_ta', 'is_active', 'sort_order'])

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
  if (!requireAuth(req, res)) return
  const id = Number(req.query.id)
  const rows = await sql`DELETE FROM public.categories WHERE id = ${id} RETURNING id`
  if (rows.length === 0) {
    res.status(404).json({ error: 'Category not found' })
    return
  }
  res.status(200).json({ data: { id } })
}

export default methodRouter({ PUT: put, DELETE: del })
