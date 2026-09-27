import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from '../_lib/db'
import { requireAuth } from '../_lib/guard'
import { methodRouter } from '../_lib/handler'


function digitsOf(s: string) { return s.replace(/\D/g, '') }

/**
 * Builds an OR'd group of ILIKE conditions across invoice_no/customer_name/
 * phone for a single free-text query, including digit-only variants — this
 * mirrors Dashboard.tsx's old client-built .or('invoice_no.ilike...,...')
 * Supabase query string, just expressed as SQL fragments instead.
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
      order_mode, order_type, user_id, items, coupon_code, discount_amount,
      manual_discount_amount, delivery_charge, total_gst, gst_amount, payment_mode,
      payment_method, remarks, tailor_name, reference_number, invoice_pdf_url
    FROM public.orders
    WHERE ${whereClause}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `
  res.status(200).json({ data: rows })
}

export default methodRouter({ GET: list })
