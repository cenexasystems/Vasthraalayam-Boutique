import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from '../_lib/db'
import { requireAuth } from '../_lib/guard'
import { methodRouter } from '../_lib/handler'

// Columns the client is allowed to PATCH after checkout (fixing up totals /
// billing metadata that the client computes more precisely than the RPC's
// first pass, plus the invoice PDF URL once the Storage phase lands) or from
// the Recent Orders admin view (status changes).
const PATCHABLE_COLUMNS = new Set([
  'subtotal',
  'total',
  'total_gst',
  'gst_amount',
  'payment_mode',
  'payment_method',
  'discount_amount',
  'manual_discount_amount',
  'delivery_charge',
  'remarks',
  'tailor_name',
  'reference_number',
  'billing_date',
  'invoice_pdf_url',
  'status',
])

async function get(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return
  const id = String(req.query.id)
  const rows = await sql`SELECT id, invoice_no FROM public.orders WHERE id = ${id} LIMIT 1`
  if (rows.length === 0) {
    res.status(404).json({ error: 'Order not found' })
    return
  }
  res.status(200).json({ data: rows[0] })
}

async function patch(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return
  const id = String(req.query.id)
  const body = (req.body ?? {}) as Record<string, unknown>

  const updates: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(body)) {
    if (PATCHABLE_COLUMNS.has(key)) updates[key] = value
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: 'No updatable fields provided' })
    return
  }

  const rows = await sql`
    UPDATE public.orders
    SET ${sql(updates)}, updated_at = NOW()
    WHERE id = ${id}
    RETURNING id
  `

  if (rows.length === 0) {
    res.status(404).json({ error: 'Order not found' })
    return
  }

  res.status(200).json({ data: rows[0] })
}

async function del(req: VercelRequest, res: VercelResponse) {
  // Order deletion is destructive and irreversible (permanently removes a
  // billing record). The old client-side gate for this was a hardcoded
  // password prompt shown to staff (visible in the bundle, trivially
  // bypassable) — replaced here with real server-side role enforcement:
  // admin only.
  if (!requireAuth(req, res, ['admin'])) return
  const id = String(req.query.id)
  const rows = await sql`DELETE FROM public.orders WHERE id = ${id} RETURNING id`
  if (rows.length === 0) {
    res.status(404).json({ error: 'Order not found' })
    return
  }
  res.status(200).json({ data: { id } })
}

export default methodRouter({ GET: get, PATCH: patch, DELETE: del })
