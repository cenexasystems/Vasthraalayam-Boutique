import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { JSONValue } from 'postgres'
import { sql } from './_lib/db.js'
import { requireAuth } from './_lib/guard.js'
import { methodRouter } from './_lib/handler.js'

// ─── Types ────────────────────────────────────────────────────────────────────
type AdvanceStatus =
  | 'pending_deposit'
  | 'ready_for_delivery'
  | 'waiting_final_payment'
  | 'completed'
  | 'cancelled'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function normalizeOrder(row: Record<string, unknown>) {
  return {
    ...row,
    id: String(row.id || ''),
    deposit_id: String(row.deposit_id || ''),
    customer_name: String(row.customer_name || ''),
    phone: String(row.phone || ''),
    address: String(row.address || ''),
    product_name: String(row.product_name || ''),
    products: Array.isArray(row.products) ? row.products : [],
    category: String(row.category || ''),
    description: String(row.description || ''),
    total_amount: Number(row.total_amount || 0),
    deposit_amount: Number(row.deposit_amount || 0),
    remaining_balance: Number(row.remaining_balance ?? (Number(row.total_amount || 0) - Number(row.deposit_amount || 0))),
    expected_delivery_date: String(row.expected_delivery_date || ''),
    status: String(row.status || 'pending_deposit') as AdvanceStatus,
    remarks: String(row.remarks || ''),
    reference_number: String(row.reference_number || ''),
    created_by_name: String(row.created_by_name || ''),
    created_at: String(row.created_at || new Date().toISOString()),
    updated_at: String(row.updated_at || new Date().toISOString()),
    completed_at: row.completed_at ? String(row.completed_at) : null,
    completed_order_id: row.completed_order_id ? String(row.completed_order_id) : null,
    invoice_number: row.invoice_number ? String(row.invoice_number) : null,
    final_payment_method: row.final_payment_method ? String(row.final_payment_method) : null,
  }
}

// ─── GET /api/advance-orders — list all ──────────────────────────────────────
async function list(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return

  const rows = await sql`
    SELECT
      id, deposit_id, customer_name, phone, address,
      product_name, products, category, description,
      total_amount, deposit_amount, remaining_balance,
      expected_delivery_date, status, remarks,
      COALESCE(reference_number, '') AS reference_number,
      created_by, created_by_name, created_at, updated_at,
      completed_at, completed_order_id, invoice_number, final_payment_method
    FROM public.advance_orders
    ORDER BY created_at DESC
    LIMIT 1000
  `
  res.status(200).json({ data: rows.map(r => normalizeOrder(r as Record<string, unknown>)) })
}

// ─── GET /api/advance-orders?id=:id — single order ───────────────────────────
async function getById(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return
  const id = String(req.query.id)
  const rows = await sql`
    SELECT * FROM public.advance_orders WHERE id = ${id} LIMIT 1
  `
  if (rows.length === 0) { res.status(404).json({ error: 'Advance order not found' }); return }
  res.status(200).json({ data: normalizeOrder(rows[0] as Record<string, unknown>) })
}

// ─── GET /api/advance-orders?history=:id — timeline + payments ───────────────
async function getHistory(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return
  const id = String(req.query.history)
  const [timeline, payments] = await Promise.all([
    sql`SELECT * FROM public.advance_order_timeline WHERE advance_order_id = ${id} ORDER BY created_at ASC`,
    sql`SELECT * FROM public.advance_order_payments WHERE advance_order_id = ${id} ORDER BY received_at ASC`,
  ])
  res.status(200).json({ data: { timeline, payments } })
}

// ─── GET handler dispatch ─────────────────────────────────────────────────────
async function get(req: VercelRequest, res: VercelResponse) {
  if (req.query.history !== undefined) return getHistory(req, res)
  if (req.query.id !== undefined) return getById(req, res)
  return list(req, res)
}

// ─── POST /api/advance-orders — create ───────────────────────────────────────
async function create(req: VercelRequest, res: VercelResponse) {
  const session = requireAuth(req, res)
  if (!session) return
  const body = (req.body ?? {}) as Record<string, unknown>

  // ── Server-side validation ─────────────────────────────────────────────────
  const customerName = String(body.p_customer_name || body.customer_name || '').trim()
  const phone = String(body.p_phone || body.phone || '').trim()
  const productName = String(body.p_product_name || body.product_name || '').trim()
  const totalAmount = Number(body.p_total_amount || body.total_amount || 0)
  const depositAmount = Number(body.p_deposit_amount || body.deposit_amount || 0)
  const deliveryDate = String(body.p_expected_delivery_date || body.expected_delivery_date || '').trim()
  const products = Array.isArray(body.p_products || body.products) ? (body.p_products || body.products) as unknown[] : []
  const paymentMethod = String(body.p_payment_method || body.payment_method || '').toLowerCase()

  if (!customerName) { res.status(400).json({ error: 'Customer name is required' }); return }
  if (!phone) { res.status(400).json({ error: 'Phone number is required' }); return }
  if (!productName && products.length === 0) { res.status(400).json({ error: 'At least one product is required' }); return }
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) { res.status(400).json({ error: 'Total amount must be greater than zero' }); return }
  if (!Number.isFinite(depositAmount) || depositAmount <= 0) { res.status(400).json({ error: 'Deposit amount must be greater than zero' }); return }
  if (depositAmount >= totalAmount) { res.status(400).json({ error: 'Deposit must be less than the total amount' }); return }
  if (!deliveryDate) { res.status(400).json({ error: 'Expected delivery date is required' }); return }
  if (!['cash', 'upi', 'card'].includes(paymentMethod)) { res.status(400).json({ error: 'Select a valid payment method: cash, upi, or card' }); return }

  try {
    const rows = await sql`
      SELECT public.create_advance_order(
        p_customer_name       => ${customerName},
        p_phone               => ${phone},
        p_address             => ${String(body.p_address || body.address || '').trim()},
        p_product_name        => ${productName || (products as Record<string, unknown>[]).map(p => String(p.name || '')).filter(Boolean).join(', ')},
        p_category            => ${String(body.p_category || body.category || '').trim()},
        p_description         => ${String(body.p_description || body.description || '').trim()},
        p_total_amount        => ${totalAmount},
        p_deposit_amount      => ${depositAmount},
        p_expected_delivery_date => ${deliveryDate},
        p_remarks             => ${String(body.p_remarks || body.remarks || '').trim()},
        p_payment_method      => ${paymentMethod},
        p_created_by_name     => ${String(body.p_created_by_name || body.created_by_name || session.portalId || '').trim()},
        p_products            => ${sql.json(products as unknown as JSONValue)},
        p_created_by          => ${session.portalId}
      ) AS result
    `
    const order = rows[0]?.result as Record<string, unknown>
    if (!order) throw new Error('create_advance_order returned no result')

    // Patch reference_number if provided (not in RPC signature)
    const refNum = String(body.reference_number || '').trim()
    if (refNum) {
      await sql`UPDATE public.advance_orders SET reference_number = ${refNum} WHERE id = ${String(order.id)}`
      order.reference_number = refNum
    }

    res.status(201).json({ data: normalizeOrder(order) })
  } catch (err) {
    console.error('[POST advance-orders]', err)
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create advance order' })
  }
}


// ─── PATCH /api/advance-orders?id=:id — status update ───────────────────────
async function patch(req: VercelRequest, res: VercelResponse) {
  const session = requireAuth(req, res)
  if (!session) return
  const id = String(req.query.id)
  const body = (req.body ?? {}) as Record<string, unknown>

  // Add an event without status change
  if (body.action === 'add_event') {
    try {
      await sql`
        SELECT public.add_advance_order_event(
          p_order_id  => ${id}::UUID,
          p_event_type=> ${String(body.event_type || 'note')},
          p_label     => ${String(body.label || 'Note')},
          p_remarks   => ${String(body.remarks || '')},
          p_created_by=> ${session.portalId}
        )
      `
      res.status(200).json({ data: { ok: true } })
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to add event' })
    }
    return
  }

  // Complete the advance order — final payment
  if (body.action === 'complete') {
    try {
      const rows = await sql`
        SELECT order_id, invoice_no, completed_at
        FROM public.complete_advance_order_v2(
          p_order_id          => ${id}::UUID,
          p_payment_method    => ${String(body.payment_method || 'cash')},
          p_final_amount      => ${Number(body.final_amount || 0)},
          p_coupon_code       => ${body.coupon_code ? String(body.coupon_code) : null},
          p_coupon_percentage => ${Number(body.coupon_percentage || 0)},
          p_manual_discount   => ${Number(body.manual_discount || 0)},
          p_remarks           => ${String(body.remarks || '')},
          p_created_by        => ${session.portalId}
        )
      `
      res.status(200).json({ data: rows[0] })
    } catch (err) {
      console.error('[PATCH advance-orders complete]', err)
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to complete advance order' })
    }
    return
  }

  // Status update
  if (body.status) {
    try {
      const rows = await sql`
        SELECT * FROM public.update_advance_order_status(
          p_order_id   => ${id}::UUID,
          p_status     => ${String(body.status)},
          p_remarks    => ${String(body.remarks || '')},
          p_created_by => ${session.portalId}
        )
      `
      res.status(200).json({ data: normalizeOrder(rows[0] as Record<string, unknown>) })
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update status' })
    }
    return
  }

  res.status(400).json({ error: 'Provide action=complete|add_event or status field' })
}

// ─── DELETE /api/advance-orders?id=:id ───────────────────────────────────────
async function del(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res, ['admin'])) return
  const id = String(req.query.id)
  const rows = await sql`DELETE FROM public.advance_orders WHERE id = ${id} RETURNING id`
  if (rows.length === 0) { res.status(404).json({ error: 'Advance order not found' }); return }
  res.status(200).json({ data: { id } })
}

export default methodRouter({ GET: get, POST: create, PATCH: patch, DELETE: del })
