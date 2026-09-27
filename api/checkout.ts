import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { JSONValue } from 'postgres'
import { sql } from './_lib/db'
import { requireAuth } from './_lib/guard'
import { methodRouter } from './_lib/handler'

type IncomingItem = Record<string, unknown>

/**
 * Manual/unregistered items may carry a product_id that was never created in
 * this database (the "Unregistered" ad-hoc product flow still runs against
 * the old Supabase project for now). complete_pos_sale_with_inventory()
 * already skips stock lookups for is_manual items, but order_items.product_id
 * has a real foreign key here — so we drop any id we can't vouch for instead
 * of risking an FK failure, or worse, an accidental match against an
 * unrelated product that happens to share the same numeric id.
 */
function sanitizeItems(items: IncomingItem[]): IncomingItem[] {
  return items.map((item) => {
    const isManual = Boolean(item.is_manual) || item.source === 'manual' || item.category === 'Unregistered'
    if (!isManual) return item
    return { ...item, product_id: null, variant_id: null }
  })
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

  // complete_pos_sale_with_inventory() RETURNS JSONB (a single object), not a
  // table — "SELECT *" would give one unnamed column holding the whole blob,
  // not order_id/invoice_no/total as separate columns. Alias it and let
  // postgres.js deserialize the jsonb value into a JS object.
  const rows = await sql`
    SELECT public.complete_pos_sale_with_inventory(
      p_customer_name => ${body.customer_name ?? 'Customer'},
      p_phone => ${body.phone ?? ''},
      p_address => ${body.address ?? ''},
      p_items => ${sql.json(items as unknown as JSONValue)},
      p_shipping => ${body.shipping ?? 0},
      p_status => ${body.status ?? 'completed'},
      p_order_mode => ${body.order_mode ?? 'offline'},
      p_order_type => ${body.order_type ?? 'pos_sale'},
      p_delivery_charge => ${body.delivery_charge ?? 0},
      p_discount_amount => ${body.discount_amount ?? 0},
      p_manual_discount_amount => ${body.manual_discount_amount ?? 0},
      p_manual_discount_type => ${body.manual_discount_type ?? 'flat'},
      p_manual_discount_value => ${body.manual_discount_value ?? 0},
      p_coupon_code => ${body.coupon_code ?? null},
      p_coupon_percentage => ${body.coupon_percentage ?? 0},
      p_payment_method => ${body.payment_method ?? 'cash'},
      p_split_details => ${sql.json((body.split_details ?? {}) as JSONValue)},
      p_total_gst => ${body.total_gst ?? 0},
      p_gst_enabled => ${Boolean(body.gst_enabled)},
      p_remarks => ${body.remarks ?? null},
      p_reference_number => ${body.reference_number ?? null},
      p_billing_date => ${body.billing_date ?? null},
      p_created_by => ${session.portalId}
    ) AS result
  `

  const result = rows[0]?.result as { order_id: string; invoice_no: string; total: number } | undefined
  if (!result) {
    res.status(500).json({ error: 'Checkout did not return an order' })
    return
  }

  res.status(200).json({
    order_id: result.order_id,
    invoice_no: result.invoice_no,
    total: result.total,
  })
}

export default methodRouter({ POST: checkout })
