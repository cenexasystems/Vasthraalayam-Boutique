import { toNumber, roundTo, formatCurrency } from './retail'

export interface InvoiceBreakdownInput {
  subtotal: number
  total?: number
  items?: Array<Record<string, unknown>>
  discountAmount?: number
  manualDiscountAmount?: number
  manualDiscountType?: string
  manualDiscountValue?: number
  couponCode?: string | null
  couponPercentage?: number
  totalGst?: number
  gstAmount?: number
  gstRate?: number
  deliveryCharge?: number
  shipping?: number
  roundOff?: number
  paymentMode?: string
  payments?: Array<{ mode: string; amount: number; phase?: string; paid_at?: string; notes?: string }>
  depositAmount?: number
  remainingBalance?: number
  advancePaid?: number
  balancePaid?: number
  balanceDue?: number
}

export interface TaxRateSummary {
  rate: number
  taxableValue: number
  cgst: number
  sgst: number
  totalTax: number
}

export interface BreakdownRow {
  key: string
  label: string
  amount: number
  prefix: string // '', '−', '+'
  type: 'subtotal' | 'discount' | 'taxable' | 'tax' | 'delivery' | 'roundoff' | 'total'
}

export interface InvoiceBreakdown {
  subtotal: number
  discountAmount: number
  discountLabel: string
  taxableAmount: number
  hasTax: boolean
  totalGst: number
  cgstAmount: number
  sgstAmount: number
  cgstLabel: string
  sgstLabel: string
  gstRate?: number
  deliveryCharge: number
  roundOff: number
  total: number
  isDepositInvoice: boolean
  advancePaid: number
  balancePaid: number
  balanceDue: number
  rows: BreakdownRow[]
  paymentDisplay: {
    isSplit: boolean
    singleModeLabel: string
    splitPayments: Array<{ mode: string; label: string; amount: number }>
    advancePayments: Array<{ mode: string; label: string; amount: number; paid_at?: string }>
    balancePayments: Array<{ mode: string; label: string; amount: number; paid_at?: string }>
    totalPaid: number
  }
}

export const formatPaymentModeName = (mode?: string): string => {
  if (!mode) return 'Cash'
  const lower = mode.trim().toLowerCase()
  if (lower === 'qr' || lower === 'upi') return 'UPI / QR'
  if (lower === 'cash') return 'Cash'
  if (lower === 'card') return 'Card'
  if (lower === 'online') return 'Online'
  return mode.charAt(0).toUpperCase() + mode.slice(1)
}

const formatDateShort = (dateStr?: string): string => {
  if (!dateStr) return ''
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
  } catch {
    return ''
  }
}

// Clean standard GST percentage rates in India (combined rates)
const STANDARD_CLEAN_RATES = [0.25, 3, 5, 6, 12, 18, 28]

export function computeInvoiceBreakdown(input: InvoiceBreakdownInput): InvoiceBreakdown {
  const safeSubtotal = roundTo(toNumber(input.subtotal, 0), 2)
  const couponDiscount = roundTo(toNumber(input.discountAmount, 0), 2)
  const manualDiscount = roundTo(toNumber(input.manualDiscountAmount, 0), 2)
  const totalDiscount = roundTo(couponDiscount + manualDiscount, 2)

  // Determine discount label
  let discountLabel = 'Discount'
  if (couponDiscount > 0 && manualDiscount > 0) {
    discountLabel = `Discount (Incl. ${input.couponCode || 'Coupon'})`
  } else if (couponDiscount > 0) {
    if (input.couponPercentage && input.couponPercentage > 0) {
      discountLabel = `Discount (${input.couponPercentage}%)`
    } else {
      discountLabel = input.couponCode ? `Coupon (${input.couponCode})` : 'Coupon Discount'
    }
  } else if (manualDiscount > 0) {
    if (input.manualDiscountType === '%' && input.manualDiscountValue && input.manualDiscountValue > 0) {
      discountLabel = `Discount (${input.manualDiscountValue}%)`
    } else if (safeSubtotal > 0) {
      const derivedPct = (manualDiscount / safeSubtotal) * 100
      if (Math.abs(derivedPct - Math.round(derivedPct)) < 0.02 && derivedPct >= 0.5) {
        discountLabel = `Discount (${Math.round(derivedPct)}%)`
      } else {
        discountLabel = 'Discount'
      }
    } else {
      discountLabel = 'Discount'
    }
  }

  const taxableAmount = Math.max(0, roundTo(safeSubtotal - totalDiscount, 2))
  const totalGst = roundTo(toNumber(input.totalGst ?? input.gstAmount, 0), 2)
  const hasTax = totalGst > 0

  let cgstAmount = 0
  let sgstAmount = 0
  let cgstLabel = 'CGST'
  let sgstLabel = 'SGST'
  let cleanGstRate: number | undefined = undefined

  if (hasTax) {
    // Split total GST 50/50 exactly so CGST + SGST === totalGst
    cgstAmount = roundTo(totalGst / 2, 2)
    sgstAmount = roundTo(totalGst - cgstAmount, 2)

    // Determine GST Rate percentage if known or clean
    const explicitRate = toNumber(input.gstRate, 0)
    if (explicitRate > 0) {
      cleanGstRate = explicitRate
    } else if (taxableAmount > 0) {
      const calculatedRate = (totalGst / taxableAmount) * 100
      const matched = STANDARD_CLEAN_RATES.find(r => Math.abs(calculatedRate - r) < 0.08)
      if (matched !== undefined) {
        cleanGstRate = matched
      }
    }

    if (cleanGstRate && cleanGstRate > 0) {
      const halfRate = cleanGstRate / 2
      const formattedRate = Number.isInteger(halfRate) ? String(halfRate) : halfRate.toFixed(1)
      cgstLabel = `CGST (${formattedRate}%)`
      sgstLabel = `SGST (${formattedRate}%)`
    } else {
      cgstLabel = 'CGST'
      sgstLabel = 'SGST'
    }
  }

  const deliveryCharge = roundTo(toNumber(input.deliveryCharge ?? input.shipping, 0), 2)
  let roundOff = roundTo(toNumber(input.roundOff, 0), 2)

  // Ensure Subtotal - Discount + CGST + SGST + Delivery + Round-off = TOTAL
  const netBeforeRound = roundTo(taxableAmount + totalGst + deliveryCharge, 2)
  let finalTotal = netBeforeRound + roundOff

  if (input.total !== undefined) {
    const storedTotal = roundTo(toNumber(input.total, 0), 2)
    if (storedTotal > 0) {
      const diff = roundTo(storedTotal - netBeforeRound, 2)
      if (Math.abs(diff) < 2.00) {
        roundOff = diff
      }
      finalTotal = storedTotal
    }
  }

  // Build the unified breakdown rows in strict specified order
  const rows: BreakdownRow[] = []

  // 1. Subtotal (always appears)
  rows.push({
    key: 'subtotal',
    label: 'Subtotal',
    amount: safeSubtotal,
    prefix: '',
    type: 'subtotal',
  })

  // 2. Discount: -Rs. X (if discount applied)
  if (totalDiscount > 0) {
    rows.push({
      key: 'discount',
      label: discountLabel,
      amount: totalDiscount,
      prefix: '−',
      type: 'discount',
    })
  }

  // 3. Taxable Amount: Rs. X (only if GST applies)
  if (hasTax) {
    rows.push({
      key: 'taxable',
      label: 'Taxable Amount',
      amount: taxableAmount,
      prefix: '',
      type: 'taxable',
    })
  }

  // 4. CGST: +Rs. X (show rate if known)
  if (cgstAmount > 0) {
    rows.push({
      key: 'cgst',
      label: cgstLabel,
      amount: cgstAmount,
      prefix: '+',
      type: 'tax',
    })
  }

  // 5. SGST: +Rs. X (show rate if known)
  if (sgstAmount > 0) {
    rows.push({
      key: 'sgst',
      label: sgstLabel,
      amount: sgstAmount,
      prefix: '+',
      type: 'tax',
    })
  }

  // 6. Delivery / Shipping: +Rs. X (if > 0)
  if (deliveryCharge > 0) {
    rows.push({
      key: 'delivery',
      label: 'Delivery',
      amount: deliveryCharge,
      prefix: '+',
      type: 'delivery',
    })
  }

  // 7. Round off: +/-Rs. X (if non-zero)
  if (roundOff !== 0) {
    rows.push({
      key: 'roundoff',
      label: 'Round off',
      amount: Math.abs(roundOff),
      prefix: roundOff > 0 ? '+' : '−',
      type: 'roundoff',
    })
  }

  // 9. TOTAL: Rs. X (always appears)
  rows.push({
    key: 'total',
    label: 'TOTAL',
    amount: finalTotal,
    prefix: '',
    type: 'total',
  })

  // Deposit invoice handling
  const isDepositInvoice = (input.depositAmount != null && input.depositAmount > 0) ||
    (input.remainingBalance != null) ||
    (input.advancePaid != null && input.advancePaid > 0)

  const advancePaid = roundTo(toNumber(input.depositAmount ?? input.advancePaid, 0), 2)
  const balanceDue = roundTo(toNumber(input.remainingBalance ?? input.balanceDue, 0), 2)
  const balancePaid = roundTo(toNumber(input.balancePaid, 0), 2)

  // Payments classification
  const rawPayments = Array.isArray(input.payments) ? input.payments : []
  const activePayments = rawPayments.filter(p => toNumber(p?.amount, 0) > 0)

  const advancePayments = activePayments
    .filter(p => p.phase === 'deposit' || p.phase === 'advance')
    .map(p => {
      const modeName = formatPaymentModeName(p.mode)
      const dateTxt = formatDateShort(p.paid_at)
      const label = dateTxt ? `Advance Paid (on ${dateTxt} via ${modeName})` : `Advance Paid (${modeName})`
      return {
        mode: String(p.mode || 'cash').toLowerCase(),
        label,
        amount: roundTo(toNumber(p.amount, 0), 2),
        paid_at: p.paid_at,
      }
    })

  const balancePayments = activePayments
    .filter(p => p.phase === 'remaining' || p.phase === 'balance')
    .map(p => {
      const modeName = formatPaymentModeName(p.mode)
      const dateTxt = formatDateShort(p.paid_at)
      const label = dateTxt ? `Balance Paid (on ${dateTxt} via ${modeName})` : `Balance Paid (${modeName})`
      return {
        mode: String(p.mode || 'cash').toLowerCase(),
        label,
        amount: roundTo(toNumber(p.amount, 0), 2),
        paid_at: p.paid_at,
      }
    })

  const splitPayments = activePayments.map(p => ({
    mode: String(p.mode || 'cash').toLowerCase(),
    label: formatPaymentModeName(p.mode),
    amount: roundTo(toNumber(p.amount, 0), 2),
  }))

  const totalPaid = activePayments.length > 0
    ? roundTo(activePayments.reduce((s, p) => s + toNumber(p.amount, 0), 0), 2)
    : (isDepositInvoice ? roundTo(advancePaid + balancePaid, 2) || finalTotal : finalTotal)

  const isSplit = (input.paymentMode?.toLowerCase() === 'split') ||
    (activePayments.length > 1 && !isDepositInvoice)

  const singleModeLabel = formatPaymentModeName(input.paymentMode)

  return {
    subtotal: safeSubtotal,
    discountAmount: totalDiscount,
    discountLabel,
    taxableAmount,
    hasTax,
    totalGst,
    cgstAmount,
    sgstAmount,
    cgstLabel,
    sgstLabel,
    gstRate: cleanGstRate,
    deliveryCharge,
    roundOff,
    total: finalTotal,
    isDepositInvoice,
    advancePaid,
    balancePaid,
    balanceDue,
    rows,
    paymentDisplay: {
      isSplit,
      singleModeLabel,
      splitPayments,
      advancePayments,
      balancePayments,
      totalPaid,
    },
  }
}
