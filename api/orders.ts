import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { JSONValue } from 'postgres'
import { sql } from './_lib/db.js'
import { requireAuth } from './_lib/guard.js'
import { methodRouter } from './_lib/handler.js'
import { toNumber, roundTo, computeOrderTotal } from './_lib/money.js'

// Consolidated from api/orders/{index,[id]}.ts and api/order-items.ts into a
// single file so this project stays within the Hobby plan's 12 Serverless Function limit.
// vercel.json rewrites:
//   GET /api/orders/:id -> ?id=:id
//   GET /api/order-items -> ?resource=items

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
  'payments',
  'change_given',
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

function digitsOf(s: string) { return s.replace(/\D/g, '') }

function round2(num: number): number {
  return roundTo(num, 2)
}

/**
 * Builds an OR'd group of ILIKE conditions across invoice_no/customer_name/
 * phone for a single free-text query, including digit-only variants.
 */
function textSearchGroup(qText: string, fields: Array<'invoice_no' | 'customer_name' | 'phone'>) {
  const digitsOnly = digitsOf(qText)
  const nonZeroDigits = digitsOnly.replace(/^0+/, '')
  const parts: ReturnType<typeof sql>[] = []

  for (const field of fields) {
    parts.push(sql`${sql(field)} ILIKE ${'%' + qText + '%'}`)
    if (field !== 'customer_name' && digitsOnly && digitsOnly !== qText) {
      if (field === 'phone' && digitsOnly.length < 4) continue
      parts.push(sql`${sql(field)} ILIKE ${'%' + digitsOnly + '%'}`)
    }
  }
  if (nonZeroDigits && nonZeroDigits !== digitsOnly && nonZeroDigits !== qText && fields.includes('invoice_no')) {
    parts.push(sql`invoice_no ILIKE ${'%' + nonZeroDigits + '%'}`)
  }

  let group = parts[0]
  for (let i = 1; i < parts.length; i++) group = sql`${group} OR ${parts[i]}`
  return group
}

/**
 * Ensures numeric fields are coerced to numbers and payments/change_given are normalized
 */
function formatOrderRow(row: Record<string, unknown>) {
  const subtotal = toNumber(row.subtotal, 0)
  const deliveryCharge = toNumber(row.delivery_charge ?? row.shipping, 0)
  const discountAmount = toNumber(row.discount_amount, 0)
  const manualDiscountAmount = toNumber(row.manual_discount_amount, 0)
  const totalGst = toNumber(row.total_gst ?? row.gst_amount, 0)
  const total = computeOrderTotal({
    total: row.total ?? row.total_amount ?? row.grand_total,
    subtotal,
    delivery_charge: deliveryCharge,
    total_gst: totalGst,
    discount_amount: discountAmount,
    manual_discount_amount: manualDiscountAmount,
  })
  const changeGiven = toNumber(row.change_given, 0)

  const rawPayments = Array.isArray(row.payments) && row.payments.length > 0
    ? row.payments
    : [{ mode: String(row.payment_mode || row.payment_method || 'cash').toLowerCase(), amount: total }]

  const payments = (rawPayments as Array<Record<string, unknown>>).map((p) => ({
    mode: String(p?.mode || 'cash').toLowerCase(),
    amount: toNumber(p?.amount, 0),
    phase: p?.phase ? String(p.phase) : undefined,
    paid_at: p?.paid_at ? String(p.paid_at) : undefined,
    notes: p?.notes ? String(p.notes) : undefined,
  }))

  const advPaid = payments.filter(p => p.phase === 'deposit' || p.phase === 'advance').reduce((s, p) => s + p.amount, 0)
  const balPaid = payments.filter(p => p.phase === 'remaining' || p.phase === 'balance').reduce((s, p) => s + p.amount, 0)

  return {
    ...row,
    total,
    total_amount: total,
    grand_total: total,
    subtotal,
    delivery_charge: deliveryCharge,
    shipping: deliveryCharge,
    discount_amount: discountAmount,
    manual_discount_amount: manualDiscountAmount,
    manual_discount_type: row.manual_discount_type || 'flat',
    manual_discount_value: toNumber(row.manual_discount_value != null ? row.manual_discount_value : manualDiscountAmount, 0),
    total_gst: totalGst,
    gst_amount: totalGst,
    change_given: changeGiven,
    payments,
    deposit_amount: row.deposit_amount != null ? toNumber(row.deposit_amount, 0) : (advPaid > 0 ? advPaid : undefined),
    advance_paid: row.advance_paid != null ? toNumber(row.advance_paid, 0) : (advPaid > 0 ? advPaid : undefined),
    balance_paid: row.balance_paid != null ? toNumber(row.balance_paid, 0) : (balPaid > 0 ? balPaid : undefined),
    balance_due: row.status === 'completed' ? 0 : (row.balance_due != null ? toNumber(row.balance_due, 0) : Math.max(0, total - (advPaid + balPaid))),
    remaining_balance: row.status === 'completed' ? 0 : (row.remaining_balance != null ? toNumber(row.remaining_balance, 0) : Math.max(0, total - (advPaid + balPaid))),
  }
}

async function enrichAdvanceOrderRow(row: Record<string, unknown>) {
  if (row.order_type !== 'advance_order') return row
  try {
    const advRows = await sql`
      SELECT * FROM public.advance_orders
      WHERE completed_order_id = ${String(row.id)}::UUID OR invoice_number = ${String(row.invoice_no)}
      LIMIT 1
    `
    if (advRows.length > 0) {
      const adv = advRows[0] as Record<string, unknown>
      if (toNumber(row.manual_discount_amount, 0) === 0 && toNumber(adv.manual_discount_amount, 0) > 0) {
        row.manual_discount_amount = adv.manual_discount_amount
        row.manual_discount_type = adv.manual_discount_type || row.manual_discount_type || 'flat'
        row.manual_discount_value = adv.manual_discount_value || adv.manual_discount_amount
      }
      if (toNumber(row.discount_amount, 0) === 0 && toNumber(adv.discount_amount, 0) > 0) {
        row.discount_amount = adv.discount_amount
        row.coupon_code = adv.coupon_code || row.coupon_code
        row.coupon_percentage = adv.coupon_percentage || row.coupon_percentage
      }
      if (toNumber(row.delivery_charge ?? row.shipping, 0) === 0 && toNumber(adv.delivery_charge ?? adv.shipping, 0) > 0) {
        row.delivery_charge = adv.delivery_charge ?? adv.shipping
        row.shipping = adv.delivery_charge ?? adv.shipping
      }
      if (!row.deposit_amount && adv.deposit_amount) row.deposit_amount = adv.deposit_amount
      if (!row.advance_paid && adv.deposit_amount) row.advance_paid = adv.deposit_amount
    }
  } catch (err) {
    console.warn('[enrichAdvanceOrderRow warning]', err)
  }
  return row
}

async function list(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return

  const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
  const invoiceQ = typeof req.query.invoice === 'string' ? req.query.invoice.trim() : ''
  const phoneQ = typeof req.query.phone === 'string' ? req.query.phone.trim() : ''
  const customerQ = typeof req.query.customer === 'string' ? req.query.customer.trim() : ''
  const dateFrom = typeof req.query.date_from === 'string' ? req.query.date_from : ''
  const dateTo = typeof req.query.date_to === 'string' ? req.query.date_to : ''
  const billType = typeof req.query.bill_type === 'string' ? req.query.bill_type : 'all'
  const excludeOnlineRequest = req.query.exclude_online_request === 'true'
  const hasQuery = Boolean(q || invoiceQ || phoneQ || customerQ)
  const limit = Math.min(Number(req.query.limit) || (hasQuery ? 1000 : 500), 2000)

  const conditions: Array<ReturnType<typeof sql>> = []
  if (excludeOnlineRequest) conditions.push(sql`order_type != 'online_request'`)
  if (q) conditions.push(textSearchGroup(q, ['invoice_no', 'customer_name', 'phone']))
  if (invoiceQ) conditions.push(textSearchGroup(invoiceQ, ['invoice_no']))
  if (phoneQ) conditions.push(textSearchGroup(phoneQ, ['phone']))
  if (customerQ) conditions.push(sql`customer_name ILIKE ${'%' + customerQ + '%'}`)
  if (!hasQuery || (dateFrom && dateTo)) {
    if (dateFrom) conditions.push(sql`created_at >= ${dateFrom + 'T00:00:00'}`)
    if (dateTo) conditions.push(sql`created_at <= ${dateTo + 'T23:59:59'}`)
  }
  if (billType === 'manual') conditions.push(sql`order_type = 'manual_sale'`)
  else if (billType === 'offline') conditions.push(sql`order_type = 'pos_sale' AND order_mode = 'offline'`)
  else if (billType === 'online') conditions.push(sql`order_type = 'pos_sale' AND order_mode = 'online'`)

  let whereClause = sql`TRUE`
  for (const c of conditions) whereClause = sql`${whereClause} AND (${c})`

  const rows = await sql`
    SELECT
      id, invoice_no, customer_name, phone, address, created_at, total, status,
      order_mode, order_type, user_id, items, coupon_code, coupon_percentage, discount_amount,
      manual_discount_amount, manual_discount_type, manual_discount_value, delivery_charge,
      subtotal, total_gst, gst_amount, gst_enabled, payment_mode,
      payment_method, remarks, tailor_name, reference_number, invoice_pdf_url,
      payments, change_given, business_id
    FROM public.orders
    WHERE ${whereClause}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `
  res.status(200).json({ data: rows.map(formatOrderRow) })
}

async function getById(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return
  const id = String(req.query.id)
  const rows = await sql`
    SELECT
      id, invoice_no, customer_name, phone, address, created_at, total, status,
      order_mode, order_type, user_id, items, coupon_code, coupon_percentage, discount_amount,
      manual_discount_amount, manual_discount_type, manual_discount_value, delivery_charge,
      subtotal, total_gst, gst_amount, gst_enabled, payment_mode,
      payment_method, remarks, tailor_name, reference_number, invoice_pdf_url,
      payments, change_given, business_id
    FROM public.orders
    WHERE id = ${id}
    LIMIT 1
  `
  if (rows.length === 0) {
    res.status(404).json({ error: 'Order not found' })
    return
  }
  const row = await enrichAdvanceOrderRow(rows[0] as Record<string, unknown>)
  res.status(200).json({ data: formatOrderRow(row) })
}

async function listOrderItems(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return

  const orderIdsParam = typeof req.query.order_ids === 'string' ? req.query.order_ids : ''
  const orderIds = orderIdsParam.split(',').map((s) => s.trim()).filter(Boolean)
  if (orderIds.length === 0) {
    res.status(200).json({ data: [] })
    return
  }

  const rows = await sql`
    SELECT order_id, product_id, variant_id, product_name, variant_name, category, quantity, unit_price, base_price, line_total, gst_rate, gst_amount, is_manual, source, item_type, business_id
    FROM public.order_items
    WHERE order_id IN ${sql(orderIds)}
  `
  res.status(200).json({ data: rows })
}

async function getPublicInvoice(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  const raw = String(req.query.id || req.query.invoice_no || '').trim()
  if (!raw) {
    res.status(400).json({ error: 'Invoice identifier is required' })
    return
  }

  const isUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw)
  const stripped = raw.replace(/^(INV|PB|DEP)[-_ ]*/i, '').trim()
  const digits = raw.replace(/\D/g, '')
  const unpadded = digits.replace(/^0+/, '')
  const padded6 = digits ? digits.padStart(6, '0') : ''
  const padded8 = digits ? digits.padStart(8, '0') : ''
  const candidates = Array.from(new Set([
    stripped, raw, digits, unpadded, padded8, `INV${padded8}`, `INV-${padded8}`,
    `DEP${padded6}`, `DEP${digits}`, `DEP${unpadded ? unpadded.padStart(6, '0') : ''}`, `DEP-${padded6}`, `DEP-${unpadded}`
  ])).filter(Boolean)

  let rows = isUuidPattern
    ? await sql`
        SELECT
          id, invoice_no, customer_name, phone, address, created_at, total, status,
          order_mode, order_type, user_id, items, coupon_code, coupon_percentage, discount_amount,
          manual_discount_amount, manual_discount_type, manual_discount_value, delivery_charge,
          subtotal, total_gst, gst_amount, gst_enabled, payment_mode,
          payment_method, remarks, tailor_name, reference_number, invoice_pdf_url,
          payments, change_given, business_id
        FROM public.orders
        WHERE id = ${raw} OR invoice_no IN ${sql(candidates)}
        LIMIT 1
      `
    : await sql`
        SELECT
          id, invoice_no, customer_name, phone, address, created_at, total, status,
          order_mode, order_type, user_id, items, coupon_code, coupon_percentage, discount_amount,
          manual_discount_amount, manual_discount_type, manual_discount_value, delivery_charge,
          subtotal, total_gst, gst_amount, gst_enabled, payment_mode,
          payment_method, remarks, tailor_name, reference_number, invoice_pdf_url,
          payments, change_given, business_id
        FROM public.orders
        WHERE invoice_no IN ${sql(candidates)}
        LIMIT 1
      `

  if (rows.length > 0) {
    const row = await enrichAdvanceOrderRow(rows[0] as Record<string, unknown>)
    res.status(200).json({ data: formatOrderRow(row) })
    return
  }

  // Fallback to advance_orders table if not found in orders
  const advRows = isUuidPattern
    ? await sql`
        SELECT *
        FROM public.advance_orders
        WHERE id = ${raw} OR invoice_number IN ${sql(candidates)} OR deposit_id IN ${sql(candidates)}
        LIMIT 1
      `
    : await sql`
        SELECT *
        FROM public.advance_orders
        WHERE invoice_number IN ${sql(candidates)} OR deposit_id IN ${sql(candidates)}
        LIMIT 1
      `

  if (advRows.length > 0) {
    const adv = advRows[0] as Record<string, unknown>
    const advItems = Array.isArray(adv.products) && adv.products.length > 0
      ? adv.products
      : [{
          name: adv.product_name || 'Advance Order Item',
          quantity: 1,
          unit: 'piece',
          unit_type: 'unit',
          base_price: Number(adv.total_amount || 0),
          line_total: Number(adv.total_amount || 0),
        }]
    const mappedTotal = toNumber(adv.total_amount, 0)
    const depositAmt = toNumber(adv.deposit_amount, 0)
    const remBal = toNumber(adv.remaining_balance, 0)

    // Load advance order payments from DB if present
    const advOrderId = String(adv.id || '')
    const advPmtRows = await sql`
      SELECT payment_type, amount, payment_method, received_at, remarks
      FROM public.advance_order_payments
      WHERE advance_order_id = ${advOrderId}
      ORDER BY received_at ASC
    `
    const mappedPayments = advPmtRows.length > 0
      ? advPmtRows.map(p => ({
          mode: String(p.payment_method || 'cash').toLowerCase(),
          amount: toNumber(p.amount, 0),
          phase: String(p.payment_type || 'deposit'),
          paid_at: p.received_at ? String(p.received_at) : undefined,
          notes: p.remarks ? String(p.remarks) : undefined,
        }))
      : [{ mode: String(adv.final_payment_method || adv.advance_payment_method || 'cash').toLowerCase(), amount: mappedTotal }]

    const deliveryCharge = Math.max(0, Math.round((mappedTotal - ((adv.subtotal != null ? toNumber(adv.subtotal, mappedTotal) : mappedTotal) - (toNumber(adv.discount_amount, 0) + toNumber(adv.manual_discount_amount, 0)))) * 100) / 100)

    const mapped = {
      id: adv.completed_order_id || adv.id,
      deposit_id: adv.deposit_id,
      invoice_no: adv.invoice_number || adv.deposit_id,
      customer_name: adv.customer_name,
      phone: adv.phone,
      address: adv.address || '',
      items: advItems,
      total: mappedTotal,
      total_amount: mappedTotal,
      grand_total: mappedTotal,
      subtotal: adv.subtotal != null ? toNumber(adv.subtotal, mappedTotal) : mappedTotal,
      delivery_charge: deliveryCharge,
      shipping: deliveryCharge,
      discount_amount: toNumber(adv.discount_amount, 0),
      manual_discount_amount: toNumber(adv.manual_discount_amount, 0),
      manual_discount_type: adv.manual_discount_type || 'flat',
      manual_discount_value: toNumber(adv.manual_discount_value != null ? adv.manual_discount_value : adv.manual_discount_amount, 0),
      coupon_code: adv.coupon_code || undefined,
      coupon_percentage: adv.coupon_percentage != null ? toNumber(adv.coupon_percentage, 0) : undefined,
      total_gst: toNumber(adv.total_gst ?? adv.gst_amount, 0),
      gst_amount: toNumber(adv.gst_amount ?? adv.total_gst, 0),
      gst_rate: adv.gst_rate != null ? toNumber(adv.gst_rate, 0) : undefined,
      status: adv.status,
      payment_mode: adv.final_payment_method || adv.advance_payment_method || 'Advance Payment',
      payments: mappedPayments,
      deposit_amount: depositAmt,
      remaining_balance: adv.status === 'completed' ? 0 : remBal,
      advance_paid: depositAmt,
      balance_paid: adv.status === 'completed' ? Math.max(0, mappedTotal - depositAmt) : 0,
      balance_due: adv.status === 'completed' ? 0 : remBal,
      change_given: 0,
      created_at: adv.completed_at || adv.created_at,
    }
    res.status(200).json({ data: mapped })
    return
  }

  res.status(404).json({ error: 'Invoice not found' })
}

async function get(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')
  if (req.query.action === 'public' || req.query.public === 'true') return getPublicInvoice(req, res)
  if (req.query.resource === 'items') return listOrderItems(req, res)
  if (req.query.id !== undefined) return getById(req, res)
  return list(req, res)
}

async function patch(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return
  const id = String(req.query.id)
  const body = (req.body ?? {}) as Record<string, unknown>

  const updates: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(body)) {
    if (PATCHABLE_COLUMNS.has(key)) updates[key] = value
  }

  // Handle payments array validation and formatting if provided
  if (Array.isArray(body.payments)) {
    const rawPayments = body.payments as Array<{ mode?: string; amount?: unknown }>
    const validPayments: Array<{ mode: string; amount: number }> = []
    for (const p of rawPayments) {
      const mode = String(p.mode || '').toLowerCase()
      const amt = round2(Number(p.amount) || 0)
      if (amt > 0 && ['cash', 'qr', 'card', 'online'].includes(mode)) {
        validPayments.push({ mode, amount: amt })
      }
    }
    updates.payments = sql.json(validPayments as unknown as JSONValue)
    if (validPayments.length > 0) {
      const computedMode = validPayments.length > 1 ? 'split' : validPayments[0].mode
      updates.payment_mode = computedMode
      updates.payment_method = computedMode
    }
  }

  if (body.change_given !== undefined) {
    updates.change_given = round2(Number(body.change_given) || 0)
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: 'No updatable fields provided' })
    return
  }

  const rows = await sql`
    UPDATE public.orders
    SET ${sql(updates)}, updated_at = NOW()
    WHERE id = ${id}
    RETURNING id, invoice_no, total, payments, change_given, payment_mode
  `

  if (rows.length === 0) {
    res.status(404).json({ error: 'Order not found' })
    return
  }

  res.status(200).json({ data: formatOrderRow(rows[0] as Record<string, unknown>) })
}

async function del(req: VercelRequest, res: VercelResponse) {
  const session = requireAuth(req, res, ['admin'])
  if (!session) return
  const id = String(req.query.id)
  if (!id) {
    res.status(400).json({ error: 'Order ID is required' })
    return
  }

  const businessId = String(req.query.business_id || '1').trim()
  try {
    const rows = await sql`
      SELECT public.hard_delete_order(
        ${id}::uuid,
        ${businessId},
        ${session.portalId}
      ) AS result
    `
    const result = rows[0]?.result as Record<string, unknown>
    res.status(200).json({ data: result })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('not found') || msg.includes('not authorized')) {
      res.status(404).json({ error: msg })
      return
    }
    console.error('[orders.del] Hard delete failed:', err)
    res.status(500).json({ error: msg || 'Failed to hard delete order' })
  }
}

export default methodRouter({ GET: get, PATCH: patch, DELETE: del })
