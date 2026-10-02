export const toNumber = (value: unknown, fallback = 0): number => {
  if (value === null || value === undefined) return fallback
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback
  }
  const cleaned = String(value)
    .replace(/[₹\u20b9]|Rs\.?|INR/gi, '')
    .replace(/,/g, '')
    .trim()
  if (!cleaned) return fallback
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : fallback
}

export const roundTo = (value: unknown, places = 2): number => {
  const num = toNumber(value, 0)
  const factor = 10 ** places
  return Math.round((num + Number.EPSILON) * factor) / factor
}

export const computeOrderTotal = (order: {
  total?: unknown
  total_amount?: unknown
  grand_total?: unknown
  subtotal?: unknown
  delivery_charge?: unknown
  shipping?: unknown
  total_gst?: unknown
  gst_amount?: unknown
  discount_amount?: unknown
  manual_discount_amount?: unknown
  coupon_discount?: unknown
}): number => {
  const savedTotal = toNumber(order.total ?? order.total_amount ?? order.grand_total, -1)
  if (savedTotal > 0) return roundTo(savedTotal, 2)

  const subtotal = toNumber(order.subtotal, 0)
  const delivery = toNumber(order.delivery_charge ?? order.shipping, 0)
  const gst = toNumber(order.total_gst ?? order.gst_amount, 0)
  const discount = toNumber(order.discount_amount ?? order.coupon_discount, 0)
  const manualDiscount = toNumber(order.manual_discount_amount, 0)
  return Math.max(0, roundTo(subtotal + delivery + gst - discount - manualDiscount, 2))
}
