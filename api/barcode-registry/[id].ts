import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from '../_lib/db'
import { requireAuth } from '../_lib/guard'
import { methodRouter } from '../_lib/handler'

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

export default methodRouter({ PATCH: patch })
