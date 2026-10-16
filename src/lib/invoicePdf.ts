import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'
import { BRAND_ADDRESS, BRAND_EN, BRAND_PHONE_DISPLAY } from './brand'
import { formatCurrency, formatQuantityDisplay, normalizeStructuredOrderItem, formatInvoiceNo, toNumber } from './retail'
import { LOGO_BASE64 } from './logoBase64'
import { getInvoiceTheme } from './invoiceTheme'
import { computeInvoiceBreakdown } from './invoiceBreakdown'

export type InvoicePdfData = {
  invoiceNo: string
  date: string
  customerName: string
  phone: string
  address: string
  items: Array<Record<string, unknown>>
  subtotal: number
  shipping: number
  deliveryCharge?: number
  total: number
  discountAmount?: number
  manualDiscountAmount?: number
  manualDiscountType?: string
  manualDiscountValue?: number
  gstAmount?: number
  totalGst?: number
  gstRate?: number
  couponCode?: string | null
  couponPercentage?: number
  roundOff?: number
  paymentMode?: string
  payments?: Array<{ mode: string; amount: number; phase?: string; paid_at?: string; notes?: string }>
  changeGiven?: number
  primaryColor?: string
  depositAmount?: number
  remainingBalance?: number
  advancePaid?: number
  balancePaid?: number
  balanceDue?: number
  status?: string
}

// jsPDF's built-in Helvetica font does not include the ₹ Unicode glyph (U+20B9).
// In ISO-8859-1 (WinAnsiEncoding), \u20B9 maps to character code 185 (0xB9), which renders
// as the superscript 1 (¹) glyph. Replacing with "Rs. " ensures clean and proper PDF formatting.
const money = (value: unknown): string => {
  const formatted = formatCurrency(toNumber(value, 0)).replace(/\s+/g, ' ')
  return formatted.replace(/^[₹\u20b9]\s*/, 'Rs. ')
}

/** Creates a compact A4 invoice that can be attached as a file to WhatsApp. */
export function createInvoicePdf(data: InvoicePdfData): Blob {
  const formattedNo = formatInvoiceNo(data.invoiceNo)
  const theme = getInvoiceTheme(data.primaryColor)
  const primaryColor = theme.primary
  const accentColor = theme.accent
  const contrastColor = theme.contrast
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = 210
  const left = 16
  const right = 194
  const ink = '#18202a'
  const muted = '#68717c'
  let y = 16

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(muted)
  doc.text('TAX INVOICE', left, y)
  doc.text(`Invoice: #${formattedNo}`, right, y, { align: 'right' })
  y += 7
  doc.setDrawColor('#d8dce0')
  doc.line(left, y, right, y)
  y += 8

  // ── HEADER (Left: Logo + Name + Address + Phone | Right: Only Date) ──
  const headerStartY = y
  const logoWidth = 20
  const logoHeight = 20
  const leftContentX = left + logoWidth + 4 // 16 + 20 + 4 = 40mm
  const rightBlockWidth = 62 // ~35% of 178mm printable width
  const leftBlockMaxWidth = (right - left) - rightBlockWidth - 6 // 178 - 62 - 6 = 110mm
  const textMaxWidth = leftBlockMaxWidth - logoWidth - 4 // 110 - 24 = 86mm

  try {
    doc.addImage(LOGO_BASE64, 'PNG', left, y, logoWidth, logoHeight)
  } catch {
    doc.setTextColor(primaryColor)
    doc.setFontSize(16)
    doc.text(BRAND_EN, left, y + 10)
  }

  // Business Name (wrapped if long)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(primaryColor)
  const brandLines = doc.splitTextToSize(BRAND_EN, textMaxWidth) as string[]
  doc.text(brandLines, leftContentX, y + 4.5)
  let currentLeftY = y + 4.5 + brandLines.length * 5

  // Address (wrapped)
  doc.setFontSize(8)
  doc.setTextColor(muted)
  doc.setFont('helvetica', 'normal')
  const addressLines = doc.splitTextToSize(BRAND_ADDRESS, textMaxWidth) as string[]
  doc.text(addressLines, leftContentX, currentLeftY)
  currentLeftY += addressLines.length * 3.6

  // Phone
  doc.text(`Phone: ${BRAND_PHONE_DISPLAY}`, leftContentX, currentLeftY + 1)
  currentLeftY += 5

  // Right block: ONLY Date (Right-aligned, white-space nowrap, max-width ~35%, no payment text)
  const dateFormatted = new Date(data.date).toLocaleDateString('en-IN')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(muted)
  doc.text(`Date: ${dateFormatted}`, right, headerStartY + 4.5, { align: 'right' })

  // Spacing before Bill To box
  y = Math.max(headerStartY + logoHeight + 4, currentLeftY + 4)

  const customerName = String(data.customerName || 'Walk-in Customer').trim()
  const customerPhone = String(data.phone || '—').trim()
  const customerAddress = String(data.address || '').trim()
  const customerNameLines = doc.splitTextToSize(customerName, 165) as string[]
  const customerAddressLines = customerAddress
    ? doc.splitTextToSize(`Address: ${customerAddress}`, 165) as string[]
    : []
  const customerBoxHeight = 19 + customerNameLines.length * 4 + customerAddressLines.length * 4

  doc.setFillColor('#FBFAF6')
  doc.roundedRect(left, y, right - left, customerBoxHeight, 2, 2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(muted)
  doc.text('BILL TO', left + 5, y + 7)
  doc.setFontSize(10)
  doc.setTextColor(ink)
  doc.text(customerNameLines, left + 5, y + 13)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(muted)
  const phoneY = y + 13 + customerNameLines.length * 4 + 2
  doc.text(`Mobile Number: ${customerPhone}`, left + 5, phoneY)
  if (customerAddressLines.length > 0) {
    doc.text(customerAddressLines, left + 5, phoneY + 5)
  }
  y += customerBoxHeight + 9

  doc.setFillColor(primaryColor)
  doc.rect(left, y, right - left, 9, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor('#ffffff')
  doc.text('#', left + 4, y + 6)
  doc.text('ITEM DESCRIPTION', left + 14, y + 6)
  doc.text('QTY', 140, y + 6, { align: 'right' })
  doc.text('RATE', 166, y + 6, { align: 'right' })
  doc.text('AMOUNT', right - 4, y + 6, { align: 'right' })
  y += 14

  data.items.forEach((raw, index) => {
    const item = normalizeStructuredOrderItem(raw)
    if (y > 260) { doc.addPage(); y = 20 }
    const name = item.name || 'Item'
    const nameLines = doc.splitTextToSize(name, 105) as string[]
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(ink)
    doc.text(String(index + 1), left + 4, y)
    doc.text(nameLines, left + 14, y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(muted)
    doc.text(`${formatQuantityDisplay(item.quantity, item.unit, item.unit_type)}`, 140, y, { align: 'right' })
    doc.text(money(item.base_price), 166, y, { align: 'right' })
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(ink)
    doc.text(money(item.line_total), right - 4, y, { align: 'right' })
    y += Math.max(10, nameLines.length * 4 + 4)
    doc.setDrawColor('#e8eaed')
    doc.line(left, y - 3, right, y - 3)
  })

  y = Math.max(y + 6, 150)

  const breakdown = computeInvoiceBreakdown({
    subtotal: data.subtotal,
    total: data.total,
    items: data.items as unknown as Array<Record<string, unknown>>,
    discountAmount: data.discountAmount,
    manualDiscountAmount: data.manualDiscountAmount,
    manualDiscountType: data.manualDiscountType,
    manualDiscountValue: data.manualDiscountValue,
    couponCode: data.couponCode,
    couponPercentage: data.couponPercentage,
    totalGst: data.totalGst ?? data.gstAmount,
    gstRate: data.gstRate,
    deliveryCharge: data.deliveryCharge ?? data.shipping,
    shipping: data.shipping,
    roundOff: data.roundOff,
    paymentMode: data.paymentMode,
    payments: data.payments,
    depositAmount: data.depositAmount,
    remainingBalance: data.remainingBalance,
    advancePaid: data.advancePaid,
    balancePaid: data.balancePaid,
    balanceDue: data.balanceDue,
    status: data.status,
  })

  doc.setFontSize(9)
  breakdown.rows.forEach(row => {
    if (row.type === 'total') return

    const color = (row.type === 'discount' || row.type === 'coupon') ? primaryColor : ink
    const sign = row.prefix ? `${row.prefix.replace(/[\u2212\u2013\u2014]/g, '-')}` : ''
    const valText = `${sign}${money(row.amount)}`

    doc.setFont('helvetica', row.type === 'taxable' ? 'bold' : 'normal')
    doc.setTextColor(color)
    doc.text(row.label, 143, y, { align: 'right' })
    doc.text(valText, right - 4, y, { align: 'right' })
    y += 6.5
  })

  doc.setDrawColor(primaryColor)
  doc.setLineWidth(0.7)
  doc.line(118, y - 2, right, y - 2)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(primaryColor)
  doc.text('TOTAL', 143, y + 6, { align: 'right' })
  doc.text(money(breakdown.total), right - 4, y + 6, { align: 'right' })
  y += 12

  // ── PAYMENT DETAILS SECTION (under TOTAL) ─────────────────────────
  doc.setDrawColor('#e5e7eb')
  doc.setLineWidth(0.3)
  doc.line(118, y - 2, right, y - 2)
  y += 3

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(primaryColor)
  doc.text('PAYMENT DETAILS', 120, y)
  y += 5

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(ink)

  if (breakdown.isDepositInvoice) {
    if (breakdown.paymentDisplay.advancePayments.length > 0) {
      breakdown.paymentDisplay.advancePayments.forEach(p => {
        doc.setFontSize(7.5)
        doc.text(p.label, 120, y)
        doc.setFontSize(8)
        doc.text(money(p.amount), right - 4, y, { align: 'right' })
        y += 4.5
      })
    } else {
      doc.text('Advance Paid', 120, y)
      doc.text(money(breakdown.advancePaid), right - 4, y, { align: 'right' })
      y += 4.5
    }

    if (breakdown.paymentDisplay.balancePayments.length > 0) {
      breakdown.paymentDisplay.balancePayments.forEach(p => {
        doc.setFontSize(7.5)
        doc.text(p.label, 120, y)
        doc.setFontSize(8)
        doc.text(money(p.amount), right - 4, y, { align: 'right' })
        y += 4.5
      })
    } else if (breakdown.balancePaid > 0) {
      doc.text('Balance Paid', 120, y)
      doc.text(money(breakdown.balancePaid), right - 4, y, { align: 'right' })
      y += 4.5
    }

    if (breakdown.showBalanceDue) {
      doc.setTextColor(primaryColor)
      doc.setFont('helvetica', 'bold')
      doc.text('Balance Due', 120, y)
      doc.text(money(breakdown.balanceDue), right - 4, y, { align: 'right' })
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(ink)
      y += 4.5
    }

    doc.setDrawColor('#e5e7eb')
    doc.setLineWidth(0.2)
    doc.line(118, y, right, y)
    y += 3.5

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(primaryColor)
    doc.text('Total Paid', 120, y)
    doc.text(money(breakdown.paymentDisplay.totalPaid), right - 4, y, { align: 'right' })
    y += 5
  } else if (breakdown.paymentDisplay.isSplit) {
    doc.text('Payment:', 120, y)
    y += 4
    breakdown.paymentDisplay.splitPayments.forEach(p => {
      doc.text(`  ${p.label}`, 120, y)
      doc.text(money(p.amount), right - 4, y, { align: 'right' })
      y += 4.5
    })

    const change = toNumber(data.changeGiven, 0)
    if (change > 0) {
      doc.setTextColor(muted)
      doc.text('Change Returned', 120, y)
      doc.text(`-${money(change)}`, right - 4, y, { align: 'right' })
      y += 4.5
      doc.setTextColor(ink)
    }

    doc.setDrawColor('#e5e7eb')
    doc.setLineWidth(0.2)
    doc.line(118, y, right, y)
    y += 3.5

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(primaryColor)
    doc.text('Total Paid', 120, y)
    doc.text(money(breakdown.paymentDisplay.totalPaid), right - 4, y, { align: 'right' })
    y += 5
  } else {
    // Single payment bill
    doc.text('Payment:', 120, y)
    doc.text(breakdown.paymentDisplay.singleModeLabel, right - 4, y, { align: 'right' })
    y += 4.5

    const change = toNumber(data.changeGiven, 0)
    if (change > 0) {
      doc.setTextColor(muted)
      doc.text('Change Returned', 120, y)
      doc.text(`-${money(change)}`, right - 4, y, { align: 'right' })
      y += 4.5
      doc.setTextColor(ink)
    }

    doc.setDrawColor('#e5e7eb')
    doc.setLineWidth(0.2)
    doc.line(118, y, right, y)
    y += 3.5

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(primaryColor)
    doc.text('Total Paid', 120, y)
    doc.text(money(breakdown.total), right - 4, y, { align: 'right' })
    y += 5
  }

  if (y > 265) {
    doc.addPage()
    y = 20
  }

  y = 275
  doc.setDrawColor('#d8dce0')
  doc.setLineWidth(0.2)
  doc.line(left, y, right, y)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(primaryColor)
  doc.text('THANK YOU FOR SHOPPING WITH US', pageWidth / 2, y + 8, { align: 'center' })
  return doc.output('blob')
}

export function invoicePdfFile(data: InvoicePdfData): File {
  return new File([createInvoicePdf(data)], `Invoice-${formatInvoiceNo(data.invoiceNo)}.pdf`, { type: 'application/pdf' })
}

/** Captures the rendered invoice so the downloaded PDF matches the visible view and anchors footer to the bottom. */
export async function invoicePdfFileFromElement(
  element: HTMLElement,
  invoiceNo: string,
): Promise<File> {
  const formattedNo = formatInvoiceNo(invoiceNo)
  const invoiceRoot = (element.querySelector('#invoice-print-root') as HTMLElement) || element
  const canonicalWidth = 680
  const targetMinHeight = Math.round(canonicalWidth * (297 / 210)) // 962px (exact A4 ratio)

  try {
    const canvas = await html2canvas(invoiceRoot, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      logging: false,
      windowWidth: 1024,
      onclone: (_clonedDoc, clonedElement) => {
        const clonedInvoice =
          clonedElement.id === 'invoice-print-root'
            ? clonedElement
            : (clonedElement.querySelector('#invoice-print-root') as HTMLElement) || clonedElement
        clonedInvoice.style.width = `${canonicalWidth}px`
        clonedInvoice.style.minWidth = `${canonicalWidth}px`
        clonedInvoice.style.maxWidth = `${canonicalWidth}px`
        clonedInvoice.style.minHeight = `${targetMinHeight}px`
        clonedInvoice.style.boxSizing = 'border-box'
        clonedInvoice.style.margin = '0 auto'
      },
    })

    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
    const pageWidth = 210
    const pageHeight = 297
    const imageHeight = (canvas.height * pageWidth) / canvas.width
    const image = canvas.toDataURL('image/png')

    if (imageHeight <= pageHeight + 5) {
      doc.addImage(image, 'PNG', 0, 0, pageWidth, pageHeight, undefined, 'FAST')
    } else {
      let offset = 0
      let page = 0
      while (offset < imageHeight) {
        if (page > 0) doc.addPage()
        doc.addImage(image, 'PNG', 0, -offset, pageWidth, imageHeight, undefined, 'FAST')
        offset += pageHeight
        page += 1
      }
    }

    return new File([doc.output('blob')], `Invoice-${formattedNo}.pdf`, { type: 'application/pdf' })
  } catch (error) {
    console.error('Failed to generate invoice PDF from element:', error)
    throw error
  }
}
