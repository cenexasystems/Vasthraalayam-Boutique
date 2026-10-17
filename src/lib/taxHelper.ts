import { roundTo } from './retail'

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
 * Calculates base price and GST amount from a GST-inclusive final price and GST percent.
 * Resolves to the nearest 2-decimal base price whose base + GST is closest to finalPrice.
 */
export function calculateGstFromFinal(
  finalPrice: number,
  percent: number
): TaxCalculationResult {
  const safeFinal = Math.max(0, roundTo(finalPrice, 2))
  const safePercent = Math.max(0, Math.min(100, roundTo(percent, 2)))
  if (safePercent <= 0) {
    return {
      basePrice: safeFinal,
      gstPercent: 0,
      gstAmount: 0,
      finalPrice: safeFinal,
    }
  }
  const b0 = calculateBaseFromInclusive(safeFinal, safePercent)
  let best = b0
  let bestDiff = Infinity
  for (const delta of [0, -0.01, 0.01, -0.02, 0.02]) {
    const cand = Math.max(0, roundTo(b0 + delta, 2))
    const diff = Math.abs(calculateGstFromPercent(cand, safePercent).finalPrice - safeFinal)
    if (diff < bestDiff - 1e-9) {
      best = cand
      bestDiff = diff
    }
  }
  const res = calculateGstFromPercent(best, safePercent)
  return {
    basePrice: best,
    gstPercent: safePercent,
    gstAmount: res.gstAmount,
    finalPrice: res.finalPrice,
  }
}

/**
 * Calculates GST amount and GST-inclusive final price from a base price and GST percent.
 */
export function calculateGstFromBase(
  basePrice: number,
  percent: number
): TaxCalculationResult {
  return calculateGstFromPercent(basePrice, percent)
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

export interface ItemTaxResolution {
  hasItemGst: boolean
  finalPrice: number
  basePrice: number
  gstRate: number
  gstAmount: number
}

/**
 * Resolves item-level GST components for a product or variant.
 * Handles:
 * 1. Variant MRP > price: finalPrice is MRP, basePrice is price, GST derived.
 * 2. Product with gstPercent > 0: basePrice is price, finalPrice = calculateGstFromPercent(price, gstPercent).finalPrice.
 * 3. Variant with explicit parent gstPercent: calculates finalPrice from variant price.
 * 4. Non-GST: finalPrice = basePrice, gstRate = 0, gstAmount = 0, hasItemGst = false.
 */
export function resolveItemTax(params: {
  price?: number | string | null
  gstPercent?: number | string | null
  mrp?: number | string | null
  variantPrice?: number | string | null
  variantMrp?: number | string | null
}): ItemTaxResolution {
  const vPrice = params.variantPrice != null && params.variantPrice !== '' ? Number(params.variantPrice) : NaN
  const pPrice = params.price != null && params.price !== '' ? Number(params.price) : 0
  const rawBase = !isNaN(vPrice) ? vPrice : pPrice
  const basePrice = Math.max(0, roundTo(rawBase, 2))

  const rawMrp = params.variantMrp != null && params.variantMrp !== ''
    ? Number(params.variantMrp)
    : (params.mrp != null && params.mrp !== '' ? Number(params.mrp) : NaN)
  const mrp = !isNaN(rawMrp) && rawMrp > 0 ? roundTo(rawMrp, 2) : 0

  const explicitRate = Math.max(0, Math.min(100, roundTo(Number(params.gstPercent || 0), 2)))

  // Case 1: mrp is higher than basePrice (typical for variant GST inclusive price)
  if (mrp > basePrice && basePrice > 0) {
    const diff = roundTo(mrp - basePrice, 2)
    let derivedRate = roundTo((diff / basePrice) * 100, 2)
    if (explicitRate > 0 && Math.abs(derivedRate - explicitRate) < 0.25) {
      derivedRate = explicitRate
    } else {
      // Snap to standard round percentages if within 0.15% (e.g. 5, 10, 12, 18, 28)
      const cleanRates = [0.25, 3, 5, 6, 10, 12, 18, 28]
      const snap = cleanRates.find((r) => Math.abs(derivedRate - r) < 0.15)
      if (snap !== undefined) {
        derivedRate = snap
      }
    }
    return {
      hasItemGst: derivedRate > 0,
      finalPrice: mrp,
      basePrice,
      gstRate: derivedRate,
      gstAmount: diff,
    }
  }

  // Case 2: explicit GST rate > 0
  if (explicitRate > 0 && basePrice > 0) {
    const res = calculateGstFromPercent(basePrice, explicitRate)
    return {
      hasItemGst: true,
      finalPrice: res.finalPrice,
      basePrice: res.basePrice,
      gstRate: explicitRate,
      gstAmount: res.gstAmount,
    }
  }

  // Case 3: Non-GST
  return {
    hasItemGst: false,
    finalPrice: basePrice,
    basePrice,
    gstRate: 0,
    gstAmount: 0,
  }
}

export interface TaxItemInput {
  id?: string | number
  name: string
  qty: number
  basePrice: number        // Price excluding GST
  gstPercent?: number      // Item-level GST % (0 or undefined if item has no GST)
  lineTotal?: number       // Optional pre-computed inclusive line total
  unitPrice?: number       // Inclusive unit price (final price)
  finalPrice?: number      // Explicit final price
  hasItemGst?: boolean     // Explicit item GST flag
}

export interface ProcessedTaxLine {
  id?: string | number
  name: string
  qty: number
  basePrice: number
  unitPrice: number        // Inclusive unit price
  finalPrice: number       // Inclusive final price
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
  gstAmount?: number        // Alias to totalTax
}

export interface BillTaxBreakdown {
  subtotal: number
  discountAmount: number
  taxableAmount: number
  itemTaxableAmount: number
  itemGstTotal: number
  totalGst: number
  billToggleGst: number
  billGstAmount: number    // Alias to billToggleGst
  billGstRate: number      // Bill-level GST rate
  deliveryCharge: number
  grandTotal: number
  lines: ProcessedTaxLine[]
  rateGroups: TaxRateGroup[]
  hasTax: boolean
  hasItemTax: boolean
  hasBillTax: boolean
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
    const hasItemGst = it.hasItemGst !== undefined ? Boolean(it.hasItemGst) : gstPct > 0

    // For GST items, unit price is inclusive; for non-GST items, unit price is base
    let unitPrice = base
    if (hasItemGst) {
      if (it.finalPrice !== undefined && it.finalPrice > 0) {
        unitPrice = roundTo(it.finalPrice, 2)
      } else if (it.unitPrice !== undefined && it.unitPrice > 0) {
        unitPrice = roundTo(it.unitPrice, 2)
      } else {
        unitPrice = roundTo(base * (1 + gstPct / 100), 2)
      }
    } else {
      if (it.unitPrice !== undefined && it.unitPrice > 0) {
        unitPrice = roundTo(it.unitPrice, 2)
      } else {
        unitPrice = base
      }
    }

    const lineTotal = it.lineTotal !== undefined && it.lineTotal > 0
      ? roundTo(it.lineTotal, 2)
      : roundTo(q * unitPrice, 2)

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
      finalPrice: l.unitPrice,
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
        gstAmount: 0,
      }
      existing.taxableValue = roundTo(existing.taxableValue + l.taxableValue, 2)
      existing.cgst = roundTo(existing.cgst + l.cgst, 2)
      existing.sgst = roundTo(existing.sgst + l.sgst, 2)
      existing.totalTax = roundTo(existing.totalTax + l.totalGst, 2)
      existing.gstAmount = existing.totalTax
      rateMap.set(l.gstRate, existing)
    }
  })

  let itemTaxableAmount = 0
  let itemGstTotal = 0
  processedLines.forEach((l) => {
    if (l.hasItemGst) {
      itemTaxableAmount = roundTo(itemTaxableAmount + l.taxableValue, 2)
      itemGstTotal = roundTo(itemGstTotal + l.totalGst, 2)
    }
  })

  const rateGroups = Array.from(rateMap.values()).sort((a, b) => a.rate - b.rate)
  const hasTax = totalGst > 0
  const hasItemTax = itemGstTotal > 0
  const hasBillTax = billToggleGst > 0

  // Grand Total:
  // Item-level GST is already inside lineTotal (and hence subtotal).
  // Bill-level GST on non-GST items is added to grand total.
  const discountedSubtotal = Math.max(0, roundTo(subtotal - discountTotal, 2))
  const grandTotal = Math.max(0, roundTo(discountedSubtotal + billToggleGst + delivery, 2))

  return {
    subtotal,
    discountAmount: discountTotal,
    taxableAmount: totalTaxable,
    itemTaxableAmount,
    itemGstTotal,
    totalGst,
    billToggleGst,
    billGstAmount: billToggleGst,
    billGstRate,
    deliveryCharge: delivery,
    grandTotal,
    lines: processedLines,
    rateGroups,
    hasTax,
    hasItemTax,
    hasBillTax,
  }
}
