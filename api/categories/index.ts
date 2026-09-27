import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from '../_lib/db'
import { requireAuth } from '../_lib/guard'
import { methodRouter } from '../_lib/handler'

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

export default methodRouter({ GET: list, POST: create })
