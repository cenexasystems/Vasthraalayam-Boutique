import { roundTo, toNumber } from './retail'

export interface TaxCalculationResult {
  basePrice: number
  gstPercent: number
  gstAmount: number
  finalPrice: number
}

/**
 * Calculates item-level GST components given a base price and a GST percent.
 */
export function calculateGstFromPercent(basePrice: number, percent: number): TaxCalculationResult {
  const safeBase = Math.max(0, roundTo(basePrice, 2))
  const safePercent = Math.max(0, Math.min(100, roundTo(percent, 2)))
  const gstAmount = roundTo(safeBase * (safePercent / 100), 2)
  const finalPrice = roundTo(safeBase + gstAmount, 2)
  return {
    basePrice: safeBase,
    gstPercent: safePercent,
    gstAmount,
    finalPrice,
  }
}

/**
 * Reverse calculation: given a GST-inclusive price and a rate, returns the
 * GST-exclusive base price (e.g. 840 @ 5% -> 800).
 */
export function calculateBaseFromInclusive(inclusivePrice: number, percent: number): number {
  const safeInclusive = Math.max(0, roundTo(inclusivePrice, 2))
  const safePercent = Math.max(0, Math.min(100, roundTo(percent, 2)))
  return roundTo(safeInclusive / (1 + safePercent / 100), 2)
}

/**
 * Calculates GST percent and final price given a base price and a typed GST amount.
 */
export function calculateGstFromAmount(basePrice: number, gstAmount: number): TaxCalculationResult {
  const safeBase = Math.max(0, roundTo(basePrice, 2))
  const safeAmount = Math.max(0, roundTo(gstAmount, 2))
  let gstPercent = 0
  if (safeBase > 0) {
    gstPercent = roundTo((safeAmount / safeBase) * 100, 2)
    gstPercent = Math.max(0, Math.min(100, gstPercent))
  }
  const finalPrice = roundTo(safeBase + safeAmount, 2)
  return {
    basePrice: safeBase,
    gstPercent,
    gstAmount: safeAmount,
    finalPrice,
  }
}

/**
 * Computes the CGST / SGST 50/50 split with exact paise reconciliation.
 * Any remainder is allocated to SGST.
 */
export function splitGst5050(totalGst: number): { cgst: number; sgst: number } {
  const safeTotal = roundTo(totalGst, 2)
  const totalPaise = Math.round(safeTotal * 100)
  const cgstPaise = Math.floor(totalPaise / 2)
  const sgstPaise = totalPaise - cgstPaise
  const cgst = roundTo(cgstPaise / 100, 2)
  const sgst = roundTo(sgstPaise / 100, 2)
  return { cgst, sgst }
}

export interface TaxItemInput {
  id?: string | number
  name: string
  qty: number
  basePrice: number        // Price excluding GST
  gstPercent?: number      // Item-level GST % (0 or undefined if item has no GST)
  lineTotal?: number       // Optional pre-computed inclusive line total
}

export interface ProcessedTaxLine {
  id?: string | number
  name: string
  qty: number
  basePrice: number
  unitPrice: number        // Inclusive unit price
  lineTotal: number        // Inclusive line total
  discountShare: number
  discountedTotal: number
  taxableValue: number
  gstRate: number
  totalGst: number
  cgst: number
  sgst: number
  hasItemGst: boolean
  isBillGst: boolean
}

export interface TaxRateGroup {
  rate: number             // e.g. 5, 10, 18
  halfRate: number         // e.g. 2.5, 5, 9
  taxableValue: number
  cgst: number
  sgst: number
  totalTax: number
}

export interface BillTaxBreakdown {
  subtotal: number
  discountAmount: number
  taxableAmount: number
  totalGst: number
  billToggleGst: number
  deliveryCharge: number
  grandTotal: number
  lines: ProcessedTaxLine[]
  rateGroups: TaxRateGroup[]
  hasTax: boolean
}

/**
 * Calculates complete bill totals and item-level / bill-level GST breakdown.
 *
 * Rules:
 * 1. Items with item-level GST use their GST-inclusive price for line totals.
 * 2. Discounts/coupons reduce lines proportionally.
 * 3. An item with item-level GST is NEVER taxed again by the bill-level toggle.
 * 4. The bill-level toggle applies ONLY to items that have no item-level GST.
 * 5. CGST + SGST + Taxable === Line Total / Grand Total exactly to the paisa.
 */
export function computeBillTaxBreakdown(params: {
  items: TaxItemInput[]
  discountAmount?: number
  deliveryCharge?: number
  billGstEnabled?: boolean
  billGstRate?: number     // e.g. 18 for 18%
  billGstFlatAmount?: number
}): BillTaxBreakdown {
  const discountTotal = Math.max(0, roundTo(params.discountAmount ?? 0, 2))
  const delivery = Math.max(0, roundTo(params.deliveryCharge ?? 0, 2))
  const billGstEnabled = Boolean(params.billGstEnabled)
  const billGstRate = Math.max(0, roundTo(params.billGstRate ?? 0, 2))

  // 1. Initial line gross totals
  const rawLines = params.items.map((it) => {
    const q = Math.max(1, Math.round(it.qty || 1))
    const base = Math.max(0, roundTo(it.basePrice, 2))
    const gstPct = Math.max(0, roundTo(it.gstPercent ?? 0, 2))
    const hasItemGst = gstPct > 0

    // For GST items, unit price is inclusive; for non-GST items, unit price is base
    const unitPrice = hasItemGst
      ? roundTo(base * (1 + gstPct / 100), 2)
      : base
    const lineTotal = roundTo(q * unitPrice, 2)

    return {
      ...it,
      qty: q,
      basePrice: base,
      gstPercent: gstPct,
      hasItemGst,
      unitPrice,
      lineTotal,
    }
  })

  const subtotal = roundTo(
    rawLines.reduce((sum, l) => sum + l.lineTotal, 0),
    2
  )

  // 2. Apportion discount across lines proportionally
  let allocatedDiscount = 0
  const processedLines: ProcessedTaxLine[] = rawLines.map((l, index) => {
    let lineDisc = 0
    if (subtotal > 0 && discountTotal > 0) {
      if (index === rawLines.length - 1) {
        lineDisc = roundTo(discountTotal - allocatedDiscount, 2)
      } else {
        lineDisc = roundTo((l.lineTotal / subtotal) * discountTotal, 2)
        allocatedDiscount += lineDisc
      }
    }
    const discountedTotal = Math.max(0, roundTo(l.lineTotal - lineDisc, 2))

    let taxableValue = 0
    let lineGst = 0
    let effectiveRate = 0
    let isBillGst = false

    if (l.hasItemGst) {
      effectiveRate = l.gstPercent
      taxableValue = roundTo(discountedTotal / (1 + effectiveRate / 100), 2)
      lineGst = roundTo(discountedTotal - taxableValue, 2)
    } else {
      taxableValue = discountedTotal
      if (billGstEnabled && billGstRate > 0) {
        effectiveRate = billGstRate
        lineGst = roundTo(taxableValue * (billGstRate / 100), 2)
        isBillGst = true
      }
    }

    const { cgst, sgst } = splitGst5050(lineGst)

    return {
      id: l.id,
      name: l.name,
      qty: l.qty,
      basePrice: l.basePrice,
      unitPrice: l.unitPrice,
      lineTotal: l.lineTotal,
      discountShare: lineDisc,
      discountedTotal,
      taxableValue,
      gstRate: effectiveRate,
      totalGst: lineGst,
      cgst,
      sgst,
      hasItemGst: l.hasItemGst,
      isBillGst,
    }
  })

  // 3. Rate-grouped summaries
  const rateMap = new Map<number, TaxRateGroup>()
  let totalTaxable = 0
  let totalGst = 0
  let billToggleGst = 0

  processedLines.forEach((l) => {
    totalTaxable = roundTo(totalTaxable + l.taxableValue, 2)
    totalGst = roundTo(totalGst + l.totalGst, 2)
    if (l.isBillGst) {
      billToggleGst = roundTo(billToggleGst + l.totalGst, 2)
    }

    if (l.gstRate > 0 && l.totalGst > 0) {
      const existing = rateMap.get(l.gstRate) || {
        rate: l.gstRate,
        halfRate: roundTo(l.gstRate / 2, 2),
        taxableValue: 0,
        cgst: 0,
        sgst: 0,
        totalTax: 0,
      }
      existing.taxableValue = roundTo(existing.taxableValue + l.taxableValue, 2)
      existing.cgst = roundTo(existing.cgst + l.cgst, 2)
      existing.sgst = roundTo(existing.sgst + l.sgst, 2)
      existing.totalTax = roundTo(existing.totalTax + l.totalGst, 2)
      rateMap.set(l.gstRate, existing)
    }
  })

  const rateGroups = Array.from(rateMap.values()).sort((a, b) => a.rate - b.rate)
  const hasTax = totalGst > 0

  // Grand Total:
  // Item-level GST is already inside lineTotal (and hence subtotal).
  // Bill-level GST on non-GST items is added to grand total.
  const discountedSubtotal = Math.max(0, roundTo(subtotal - discountTotal, 2))
  const grandTotal = Math.max(0, roundTo(discountedSubtotal + billToggleGst + delivery, 2))

  return {
    subtotal,
    discountAmount: discountTotal,
    taxableAmount: totalTaxable,
    totalGst,
    billToggleGst,
    deliveryCharge: delivery,
    grandTotal,
    lines: processedLines,
    rateGroups,
    hasTax,
  }
}
