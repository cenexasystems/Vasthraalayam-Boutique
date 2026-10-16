import { toNumber, roundTo } from './retail'
import { splitGst5050, type TaxRateGroup } from './taxHelper'

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
  rateGroups?: TaxRateGroup[]
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
  status?: string
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
  type: 'subtotal' | 'discount' | 'coupon' | 'taxable' | 'tax' | 'delivery' | 'roundoff' | 'total'
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
  rateGroups?: TaxRateGroup[]
  deliveryCharge: number
  roundOff: number
  total: number
  isDepositInvoice: boolean
  advancePaid: number
  balancePaid: number
  balanceDue: number
  showBalanceDue: boolean
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

  let taxableAmount = Math.max(0, roundTo(safeSubtotal - totalDiscount, 2))
  let totalGst = roundTo(toNumber(input.totalGst ?? input.gstAmount, 0), 2)
  let cgstAmount = 0
  let sgstAmount = 0
  let cgstLabel = 'CGST'
  let sgstLabel = 'SGST'
  let cleanGstRate: number | undefined = undefined

  // ── Rate Groups Detection & Resolution ──
  let rateGroups: TaxRateGroup[] = []
  if (Array.isArray(input.rateGroups) && input.rateGroups.length > 0) {
    rateGroups = input.rateGroups
  } else if (Array.isArray(input.items) && input.items.length > 0) {
    const rawItems = input.items
    const hasAnyItemTax = rawItems.some(it => {
      const r = toNumber(it.gst_rate ?? it.gstRate ?? it.gst_percent ?? it.gstPercent, 0)
      const a = toNumber(it.gst_amount ?? it.gstAmount, 0)
      return r > 0 || a > 0
    })

    if (hasAnyItemTax) {
      const rateMap = new Map<number, TaxRateGroup>()
      let allocatedDisc = 0
      rawItems.forEach((it, idx) => {
        const lineTot = toNumber(it.line_total ?? it.lineTotal, 0)
        let lineDisc = 0
        if (safeSubtotal > 0 && totalDiscount > 0) {
          if (idx === rawItems.length - 1) {
            lineDisc = roundTo(totalDiscount - allocatedDisc, 2)
          } else {
            lineDisc = roundTo((lineTot / safeSubtotal) * totalDiscount, 2)
            allocatedDisc += lineDisc
          }
        }
        const discLineTot = Math.max(0, roundTo(lineTot - lineDisc, 2))
        const rate = toNumber(it.gst_rate ?? it.gstRate ?? it.gst_percent ?? it.gstPercent, 0)
        if (rate > 0) {
          let lineTaxable = toNumber(it.taxable_amount ?? it.taxableAmount, 0)
          let lineTax = toNumber(it.gst_amount ?? it.gstAmount, 0)
          if (!lineTaxable) {
            lineTaxable = roundTo(discLineTot / (1 + rate / 100), 2)
          }
          if (!lineTax) {
            lineTax = roundTo(discLineTot - lineTaxable, 2)
          }
          const { cgst, sgst } = splitGst5050(lineTax)
          const existing = rateMap.get(rate) || {
            rate,
            halfRate: roundTo(rate / 2, 2),
            taxableValue: 0,
            cgst: 0,
            sgst: 0,
            totalTax: 0,
          }
          existing.taxableValue = roundTo(existing.taxableValue + lineTaxable, 2)
          existing.cgst = roundTo(existing.cgst + cgst, 2)
          existing.sgst = roundTo(existing.sgst + sgst, 2)
          existing.totalTax = roundTo(existing.totalTax + lineTax, 2)
          rateMap.set(rate, existing)
        }
      })
      rateGroups = Array.from(rateMap.values()).sort((a, b) => a.rate - b.rate)
    }
  }

  if (rateGroups.length > 0) {
    totalGst = roundTo(rateGroups.reduce((sum, g) => sum + g.totalTax, 0), 2)
    taxableAmount = roundTo(rateGroups.reduce((sum, g) => sum + g.taxableValue, 0), 2)
    cgstAmount = roundTo(rateGroups.reduce((sum, g) => sum + g.cgst, 0), 2)
    sgstAmount = roundTo(rateGroups.reduce((sum, g) => sum + g.sgst, 0), 2)
    if (rateGroups.length === 1) {
      const halfRate = rateGroups[0].halfRate
      const formattedRate = Number.isInteger(halfRate) ? String(halfRate) : halfRate.toFixed(1)
      cgstLabel = `CGST (${formattedRate}%)`
      sgstLabel = `SGST (${formattedRate}%)`
      cleanGstRate = rateGroups[0].rate
    }
  }

  const hasTax = totalGst > 0

  if (hasTax && rateGroups.length === 0) {
    // Legacy / single bill-level toggle calculation
    cgstAmount = roundTo(totalGst / 2, 2)
    sgstAmount = roundTo(totalGst - cgstAmount, 2)

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

  // 2. Discount: -Rs. X (if manual/other discount applied)
  if (manualDiscount > 0) {
    let manLabel = 'Discount'
    if (input.manualDiscountType === '%' && input.manualDiscountValue && input.manualDiscountValue > 0) {
      manLabel = `Discount (${input.manualDiscountValue}%)`
    }
    rows.push({
      key: 'discount',
      label: manLabel,
      amount: manualDiscount,
      prefix: '-',
      type: 'discount',
    })
  }

  // 2b. Coupon: -Rs. X (if coupon applied)
  if (couponDiscount > 0) {
    const cCode = input.couponCode ? String(input.couponCode).trim() : ''
    const couponLabel = cCode ? `Coupon (${cCode})` : 'Coupon Discount'
    rows.push({
      key: 'coupon',
      label: couponLabel,
      amount: couponDiscount,
      prefix: '-',
      type: 'coupon',
    })
  }

  // 3 & 4 & 5. Tax Summary rows (only if GST applies)
  if (hasTax) {
    if (rateGroups.length > 1) {
      // Multi-rate grouped breakdown
      rateGroups.forEach((rg) => {
        const fullRateStr = Number.isInteger(rg.rate) ? String(rg.rate) : rg.rate.toFixed(1)
        const halfRateStr = Number.isInteger(rg.halfRate) ? String(rg.halfRate) : rg.halfRate.toFixed(1)
        rows.push({
          key: `taxable_${rg.rate}`,
          label: `Taxable Amount @ ${fullRateStr}%`,
          amount: rg.taxableValue,
          prefix: '',
          type: 'taxable',
        })
        rows.push({
          key: `cgst_${rg.rate}`,
          label: `CGST (${halfRateStr}%)`,
          amount: rg.cgst,
          prefix: '+',
          type: 'tax',
        })
        rows.push({
          key: `sgst_${rg.rate}`,
          label: `SGST (${halfRateStr}%)`,
          amount: rg.sgst,
          prefix: '+',
          type: 'tax',
        })
      })
    } else if (rateGroups.length === 1) {
      // Single rate from items
      rows.push({
        key: 'taxable',
        label: 'Taxable Amount',
        amount: rateGroups[0].taxableValue,
        prefix: '',
        type: 'taxable',
      })
      rows.push({
        key: 'cgst',
        label: cgstLabel,
        amount: rateGroups[0].cgst,
        prefix: '+',
        type: 'tax',
      })
      rows.push({
        key: 'sgst',
        label: sgstLabel,
        amount: rateGroups[0].sgst,
        prefix: '+',
        type: 'tax',
      })
    } else {
      // Single/legacy rate fallback
      rows.push({
        key: 'taxable',
        label: 'Taxable Amount',
        amount: taxableAmount,
        prefix: '',
        type: 'taxable',
      })
      if (cgstAmount > 0) {
        rows.push({
          key: 'cgst',
          label: cgstLabel,
          amount: cgstAmount,
          prefix: '+',
          type: 'tax',
        })
      }
      if (sgstAmount > 0) {
        rows.push({
          key: 'sgst',
          label: sgstLabel,
          amount: sgstAmount,
          prefix: '+',
          type: 'tax',
        })
      }
    }
  }

  // 6. Delivery / Shipping: +Rs. X (if > 0)
  if (deliveryCharge > 0) {
    rows.push({
      key: 'delivery',
      label: 'Delivery Charge',
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
      prefix: roundOff > 0 ? '+' : '-',
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
  let balancePaid = roundTo(toNumber(input.balancePaid, 0), 2)

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

  if (balancePaid <= 0 && balancePayments.length > 0) {
    balancePaid = roundTo(balancePayments.reduce((s, p) => s + p.amount, 0), 2)
  } else if (balancePaid <= 0 && String(input.status || '').toLowerCase() === 'completed' && isDepositInvoice && finalTotal > advancePaid) {
    balancePaid = roundTo(finalTotal - advancePaid, 2)
  }

  const splitPayments = activePayments.map(p => ({
    mode: String(p.mode || 'cash').toLowerCase(),
    label: formatPaymentModeName(p.mode),
    amount: roundTo(toNumber(p.amount, 0), 2),
  }))

  const totalPaid = activePayments.length > 0
    ? roundTo(activePayments.reduce((s, p) => s + toNumber(p.amount, 0), 0), 2)
    : (isDepositInvoice ? roundTo(advancePaid + balancePaid, 2) || finalTotal : finalTotal)

  const isCompletedInvoice = String(input.status || '').toLowerCase() === 'completed' ||
    balancePaid > 0 ||
    balancePayments.length > 0 ||
    (isDepositInvoice && totalPaid >= finalTotal && totalPaid > 0)

  const rawBalanceDue = roundTo(toNumber(input.remainingBalance ?? input.balanceDue, Math.max(0, finalTotal - totalPaid)), 2)
  const balanceDue = isCompletedInvoice ? 0 : rawBalanceDue
  const showBalanceDue = !isCompletedInvoice && isDepositInvoice && balanceDue > 0

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
    rateGroups,
    deliveryCharge,
    roundOff,
    total: finalTotal,
    isDepositInvoice,
    advancePaid,
    balancePaid,
    balanceDue,
    showBalanceDue,
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
