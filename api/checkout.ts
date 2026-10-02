import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { JSONValue } from 'postgres'
import { sql } from './_lib/db.js'
import { requireAuth } from './_lib/guard.js'
import { methodRouter } from './_lib/handler.js'
import { toNumber, roundTo } from './_lib/money.js'

type IncomingItem = Record<string, unknown>
export interface PaymentItem {
  mode: 'cash' | 'qr' | 'card' | 'online'
  amount: number
}

/**
 * Manual/unregistered items may carry a product_id that was never created in
 * this database. complete_pos_sale_with_inventory() skips stock lookups for
 * is_manual items, but order_items.product_id has a foreign key here — so we
 * drop any id we can't vouch for instead of risking an FK failure.
 */
function sanitizeItems(items: IncomingItem[]): IncomingItem[] {
  return items.map((item) => {
    const isManual = Boolean(item.is_manual) || item.source === 'manual' || item.category === 'Unregistered'
    const rawType = (item.item_type as string) || (item.itemType as string)
    const itType = rawType === 'service' ? 'service' : (rawType === 'product' ? 'product' : undefined)
    const normalized: IncomingItem = {
      ...item,
      product_id: item.product_id ?? item.productId ?? null,
      variant_id: item.variant_id ?? item.variantId ?? null,
      quantity: toNumber(item.quantity ?? item.qty, 1),
      unit_price: toNumber(item.unit_price ?? item.base_price ?? item.basePrice ?? item.price, 0),
      base_price: toNumber(item.base_price ?? item.basePrice ?? item.unit_price ?? item.price, 0),
      product_name: String(item.product_name || item.name || 'Product'),
      product_tamil_name: item.product_tamil_name ?? item.tamilName ?? item.nameTa ?? null,
      item_type: itType,
    }
    if (isManual) {
      normalized.product_id = null
      normalized.variant_id = null
    }
    return normalized
  })
}

function round2(num: number): number {
  return roundTo(num, 2)
}

async function checkout(req: VercelRequest, res: VercelResponse) {
  const session = requireAuth(req, res)
  if (!session) return

  const body = req.body ?? {}
  const items = Array.isArray(body.items) ? sanitizeItems(body.items) : null
  if (!items || items.length === 0) {
    res.status(400).json({ error: 'Order items cannot be empty' })
    return
  }

  // Pre-calculate subtotal and estimated grand total for server-side payment validation
  let subtotal = 0
  for (const item of items) {
    const qty = toNumber(item.quantity, 0)
    const unitPrice = toNumber(item.unit_price ?? item.base_price ?? item.price, 0)
    const lineTotal = toNumber(item.line_total, round2(qty * unitPrice))
    subtotal += lineTotal
  }
  subtotal = round2(subtotal)
  const shipping = toNumber(body.shipping, 0)
  const deliveryCharge = toNumber(body.delivery_charge, 0)
  const discountAmount = toNumber(body.discount_amount, 0)
  const manualDiscountAmount = toNumber(body.manual_discount_amount, 0)
  const totalGst = toNumber(body.total_gst ?? body.gst_amount, 0)
  const grandTotal = Math.max(0, round2(subtotal + shipping + deliveryCharge + totalGst - discountAmount - manualDiscountAmount))

  if (grandTotal <= 0) {
    res.status(400).json({ error: 'Total amount must be greater than 0' })
    return
  }

  // Validate client-sent total if present
  if (body.total !== undefined || body.total_amount !== undefined || body.grand_total !== undefined) {
    const clientTotal = toNumber(body.total_amount ?? body.total ?? body.grand_total, -1)
    if (clientTotal <= 0) {
      res.status(400).json({ error: 'Total amount must be a valid number greater than 0' })
      return
    }
    if (Math.abs(clientTotal - grandTotal) > 0.05) {
      res.status(400).json({ error: `Total amount (${clientTotal}) does not match calculated total (${grandTotal})` })
      return
    }
  }

  // Validate payments array: [{ mode: 'cash'|'qr'|'card'|'online', amount }]
  const incomingPayments = Array.isArray(body.payments) ? (body.payments as Array<{ mode?: string; amount?: unknown }>) : null
  const defaultMode = String(body.payment_method || body.payment_mode || 'cash').toLowerCase() as PaymentItem['mode']
  let normalizedPayments: PaymentItem[] = []

  if (incomingPayments && incomingPayments.length > 0) {
    for (const p of incomingPayments) {
      const mode = String(p.mode || '').toLowerCase()
      if (!['cash', 'qr', 'card', 'online'].includes(mode)) {
        res.status(400).json({ error: `Invalid payment mode: ${mode}` })
        return
      }
      const amt = toNumber(p.amount, -1)
      if (amt < 0) {
        res.status(400).json({ error: 'Payment amount must be greater than or equal to 0' })
        return
      }
      const roundedAmt = round2(amt)
      if (roundedAmt > 0) {
        normalizedPayments.push({ mode: mode as PaymentItem['mode'], amount: roundedAmt })
      }
    }
  }

  // Fallback to single payment mode if payments array empty
  if (normalizedPayments.length === 0) {
    normalizedPayments = [{ mode: defaultMode, amount: grandTotal }]
  }

  const isDeposit = body.order_type === 'advance_order' || body.status === 'pending_deposit'
  const totalPaid = round2(normalizedPayments.reduce((s, p) => s + p.amount, 0))

  // Server-side validation rules
  if (isDeposit) {
    if (totalPaid <= 0 || totalPaid > grandTotal) {
      res.status(400).json({ error: `Deposit payment (${totalPaid}) must be > 0 and <= grand total (${grandTotal})` })
      return
    }
  } else {
    if (totalPaid < grandTotal) {
      res.status(400).json({ error: `Payment sum (${totalPaid}) is less than grand total (${grandTotal})` })
      return
    }
  }

  // QR and Card payments cannot exceed grand total
  const nonCashTotal = round2(
    normalizedPayments
      .filter(p => p.mode === 'qr' || p.mode === 'card')
      .reduce((s, p) => s + p.amount, 0)
  )
  if (nonCashTotal > grandTotal) {
    res.status(400).json({ error: 'QR and Card payments cannot exceed grand total' })
    return
  }

  // Set payment_mode = 'split' when more than one mode is used; keep single mode otherwise
  const paymentMode = normalizedPayments.length > 1 ? 'split' : normalizedPayments[0].mode
  const changeGiven = totalPaid > grandTotal ? round2(totalPaid - grandTotal) : round2(toNumber(body.change_given, 0))

  // In split payment or normal non-deposit payments, ensure sum of payments minus change equals total
  if (!isDeposit) {
    const netPaid = round2(totalPaid - changeGiven)
    if (Math.abs(netPaid - grandTotal) > 0.05) {
      res.status(400).json({ error: `The sum of payments (${totalPaid}) minus change given (${changeGiven}) must equal total (${grandTotal})` })
      return
    }
  }

  // Save the order and payments in one single transaction
  try {
    const result = await sql.begin(async (tx) => {
      const rows = await tx`
        SELECT public.complete_pos_sale_with_inventory(
          p_customer_name => ${body.customer_name ?? 'Customer'},
          p_phone => ${body.phone ?? ''},
          p_address => ${body.address ?? ''},
          p_items => ${tx.json(items as unknown as JSONValue)},
          p_shipping => ${shipping},
          p_status => ${body.status ?? 'completed'},
          p_order_mode => ${body.order_mode ?? 'offline'},
          p_order_type => ${body.order_type ?? 'pos_sale'},
          p_delivery_charge => ${deliveryCharge},
          p_discount_amount => ${discountAmount},
          p_manual_discount_amount => ${manualDiscountAmount},
          p_manual_discount_type => ${body.manual_discount_type ?? 'flat'},
          p_manual_discount_value => ${body.manual_discount_value ?? 0},
          p_coupon_code => ${body.coupon_code ?? null},
          p_coupon_percentage => ${body.coupon_percentage ?? 0},
          p_payment_method => ${paymentMode},
          p_split_details => ${tx.json((body.split_details ?? {}) as JSONValue)},
          p_total_gst => ${totalGst},
          p_gst_enabled => ${Boolean(body.gst_enabled)},
          p_remarks => ${body.remarks ?? null},
          p_reference_number => ${body.reference_number ?? null},
          p_billing_date => ${body.billing_date ?? null},
          p_created_by => ${session.portalId}
        ) AS result
      `

      const orderRes = rows[0]?.result as { order_id: string; invoice_no: string; total: number } | undefined
      if (!orderRes) {
        throw new Error('Checkout did not return an order')
      }

      await tx`
        UPDATE public.orders
        SET payments = ${tx.json(normalizedPayments as unknown as JSONValue)},
            change_given = ${changeGiven},
            payment_mode = ${paymentMode},
            payment_method = ${paymentMode},
            delivery_charge = ${deliveryCharge},
            discount_amount = ${discountAmount},
            manual_discount_amount = ${manualDiscountAmount},
            total_gst = ${totalGst},
            gst_amount = ${totalGst},
            total = ${grandTotal}
        WHERE id = ${orderRes.order_id}
      `

      return {
        order_id: orderRes.order_id,
        invoice_no: orderRes.invoice_no,
        total: grandTotal,
        total_amount: grandTotal,
        subtotal,
        delivery_charge: deliveryCharge,
        discount_amount: discountAmount,
        manual_discount_amount: manualDiscountAmount,
        total_gst: totalGst,
        payments: normalizedPayments,
        change_given: changeGiven,
        payment_mode: paymentMode,
      }
    })

    res.status(200).json(result)
  } catch (err) {
    console.error('Checkout transaction error:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Checkout transaction failed' })
  }
}

export default methodRouter({ POST: checkout })
