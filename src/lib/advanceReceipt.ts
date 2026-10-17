import { jsPDF } from 'jspdf'
import { BRAND_ADDRESS, BRAND_EMAIL, BRAND_EN, BRAND_PHONE_DISPLAY, BRAND_PRIMARY_PHONE_DISPLAY, BRAND_INSTAGRAM } from './brand'
import { LOGO_BASE64 } from './logoBase64'
import { getMonochromeThermalLogo } from './thermalLogo'
import { formatCurrency, toNumber, roundTo } from './retail'
import { getInvoiceTheme } from './invoiceTheme'
import { computeInvoiceBreakdown, formatPaymentModeName } from './invoiceBreakdown'
import type { AdvanceOrder } from '../services/advanceOrderService'

const esc = (value: string) => String(value || '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char] || char))

// jsPDF's built-in Helvetica font does not include the ₹ Unicode glyph (U+20B9).
// In ISO-8859-1 (WinAnsiEncoding), \u20B9 maps to character code 185 (0xB9), which renders
// as the superscript 1 (¹) glyph. Replacing with "Rs. " ensures clean and proper PDF formatting.
const pdfMoney = (value: number): string => {
  const formatted = formatCurrency(value)
  return formatted.replace(/^[₹\u20b9]\s*/, 'Rs. ')
}

function getOrderBreakdown(order: AdvanceOrder) {
  const disc = toNumber(order.discount_amount, 0)
  const manDisc = toNumber(order.manual_discount_amount, 0)
  const totalDisc = disc + manDisc
  const sub = toNumber(order.subtotal ?? order.total_amount, 0)
  const gst = toNumber(order.total_gst ?? order.gst_amount, 0)
  const tot = toNumber(order.total_amount, 0)
  const delivery = toNumber(order.delivery_charge, Math.max(0, roundTo(tot - (sub - totalDisc), 2)))

  return computeInvoiceBreakdown({
    subtotal: sub,
    total: tot,
    items: (order.products || []) as unknown as Array<Record<string, unknown>>,
    discountAmount: disc,
    manualDiscountAmount: manDisc,
    couponCode: order.coupon_code,
    couponPercentage: order.coupon_percentage,
    totalGst: gst,
    gstRate: order.gst_rate,
    deliveryCharge: delivery,
    depositAmount: order.deposit_amount,
    remainingBalance: order.remaining_balance,
    advancePaid: order.deposit_amount,
    balanceDue: order.remaining_balance,
    balancePaid: order.status === 'completed' ? Math.max(0, roundTo(tot - order.deposit_amount, 2)) : 0,
    paymentMode: order.advance_payment_method || order.final_payment_method || 'Cash',
    payments: order.payments,
  })
}

export function advanceReceiptPdf(order: AdvanceOrder) {
  const theme = getInvoiceTheme()
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  doc.setFillColor(theme.primary)
  doc.rect(0, 0, 210, 5, 'F')
  try { doc.addImage(LOGO_BASE64, 'PNG', 16, 9, 16, 16) } catch (_err) { /* ignore missing logo */ }
  doc.setTextColor(theme.primary)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text(BRAND_EN.toUpperCase(), 38, 20)
  doc.setTextColor('#6b7280')
  doc.setFontSize(8)
  doc.text('ADVANCE RECEIPT - NOT A TAX INVOICE', 38, 26)

  doc.setFont('helvetica', 'normal')
  doc.text(BRAND_ADDRESS, 194, 20, { align: 'right', maxWidth: 76 })
  doc.text(BRAND_PRIMARY_PHONE_DISPLAY, 194, 30, { align: 'right' })
  doc.setDrawColor(theme.primary)
  doc.line(16, 38, 194, 38)
  doc.setTextColor('#111827')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(order.deposit_id, 16, 48)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor('#6b7280')
  doc.text(`Created: ${new Date(order.created_at).toLocaleString('en-IN')}`, 194, 48, { align: 'right' })

  const deliveryStr = (() => {
    try {
      const dt = order.expected_delivery_date
      if (!dt) return 'Not set'
      return new Date(String(dt).includes('T') ? dt : `${dt}T00:00:00`).toLocaleDateString('en-IN')
    } catch { return 'Not set' }
  })()

  const rows = [
    ['Customer', order.customer_name],
    ['Phone', order.phone],
    ['Address', order.address || '-'],
    ['Product', order.product_name],
    ['Category', order.category || '-'],
    ['Expected delivery', deliveryStr],
  ]
  let y = 58
  rows.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold')
    doc.setTextColor('#6b7280')
    doc.text(label.toUpperCase(), 16, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor('#111827')
    doc.text(String(value), 64, y, { maxWidth: 126 })
    y += 8
  })

  // Shared Breakdown
  const breakdown = getOrderBreakdown(order)
  y += 4

  // Estimate box height
  const breakdownLinesCount = breakdown.rows.length + 3 // deposit paid, balance due, total paid
  const boxHeight = Math.max(48, breakdownLinesCount * 7.5 + 8)

  doc.setFillColor('#FBFAF6')
  doc.roundedRect(16, y, 178, boxHeight, 3, 3, 'F')
  doc.setDrawColor('#ead7b7')
  doc.roundedRect(16, y, 178, boxHeight, 3, 3, 'S')

  let currentY = y + 7
  breakdown.rows.forEach(r => {
    const isTotal = r.type === 'total'
    doc.setFont('helvetica', isTotal ? 'bold' : 'normal')
    doc.setFontSize(isTotal ? 10 : 8.5)
    doc.setTextColor(isTotal ? theme.primary : (r.type === 'discount' || r.type === 'coupon' ? theme.primary : '#374151'))
    doc.text(r.label, 22, currentY)
    const sign = (r.prefix || '').replace(/[\u2212\u2013\u2014]/g, '-')
    doc.text(`${sign}${pdfMoney(r.amount)}`, 188, currentY, { align: 'right' })
    currentY += 6.5
  })

  // Separator inside box
  doc.setDrawColor('#e5e7eb')
  doc.line(22, currentY, 188, currentY)
  currentY += 6

  // Deposit Paid
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(theme.primary)
  doc.text('Deposit Paid', 22, currentY)
  doc.text(pdfMoney(breakdown.advancePaid), 188, currentY, { align: 'right' })
  currentY += 6.5

  // Balance Due
  doc.setFont('helvetica', 'bold')
  doc.setTextColor('#b45309')
  doc.text('Balance Due', 22, currentY)
  doc.text(pdfMoney(breakdown.balanceDue), 188, currentY, { align: 'right' })
  currentY += 6.5

  // Warning text
  doc.setFont('helvetica', 'bold')
  doc.setTextColor('#b45309')
  doc.setFontSize(8.5)
  doc.text('This receipt records an advance payment only. It is not a final invoice.', 105, y + boxHeight + 10, { align: 'center' })

  return new File([doc.output('blob')], `Advance-Receipt-${order.deposit_id}.pdf`, { type: 'application/pdf' })
}

export async function printAdvanceReceipt(order: AdvanceOrder) {
  try {
    const thermalLogo = await getMonochromeThermalLogo()
    const frame = document.createElement('iframe')
    frame.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0;visibility:hidden;'
    frame.setAttribute('aria-hidden', 'true')
    frame.setAttribute('tabindex', '-1')
    frame.setAttribute('data-gramm', 'false')
    frame.setAttribute('data-gramm_editor', 'false')
    frame.setAttribute('data-enable-grammarly', 'false')
    frame.setAttribute('spellcheck', 'false')
    document.body.appendChild(frame)

    const doc = frame.contentWindow?.document
    if (!doc) {
      if (frame.parentNode) frame.parentNode.removeChild(frame)
      return
    }

    const breakdown = getOrderBreakdown(order)
    const paymentLabel = order.final_payment_method
      ? (order.final_payment_method === 'upi' ? 'UPI / QR' : order.final_payment_method.toUpperCase())
      : (order.advance_payment_method ? formatPaymentModeName(order.advance_payment_method) : 'Cash')

    const deliveryStr = (() => {
      try {
        const dt = order.expected_delivery_date
        if (!dt) return 'Not set'
        return new Date(String(dt).includes('T') ? dt : `${dt}T00:00:00`).toLocaleDateString('en-IN')
      } catch { return 'Not set' }
    })()

    const html = `<!doctype html><html lang="en" data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false" spellcheck="false"><head><title>Advance Receipt ${esc(order.deposit_id)}</title>
<meta charset="utf-8">
<meta name="grammarly" content="off">
<meta name="robots" content="noindex,nofollow">
<style>
  @page { size: 80mm auto; margin: 0; }
  @media print { @page { size: 80mm auto; margin: 0; } }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Courier New', Courier, monospace, Arial, sans-serif;
    font-size: 12px;
    width: 100%;
    max-width: 80mm;
    margin: 0 auto;
    padding: 3mm 4mm;
    color: #000;
    box-sizing: border-box;
    word-wrap: break-word;
    overflow-wrap: break-word;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .c { text-align: center; word-break: break-word; }
  .shop-title {
    font-size: 15px;
    font-weight: bold;
    letter-spacing: 1px;
    line-height: 1.25;
    text-transform: uppercase;
    word-break: break-word;
    margin: 4px 0 2px 0;
  }
  .shop-meta {
    font-size: 10px;
    color: #222;
    line-height: 1.35;
    word-break: break-word;
  }
  .r { display: flex; justify-content: space-between; gap: 4px; margin: 4px 0; word-break: break-word; }
  .r span:first-child { flex-shrink: 0; max-width: 60%; }
  .r span:last-child { text-align: right; flex: 1; font-variant-numeric: tabular-nums; }
  .line { border-top: 1px dashed #000; margin: 6px 0; }
  .big { font-size: 14px; font-weight: bold; letter-spacing: 0.5px; }
  .bold { font-weight: bold; }
  .warn { font-size: 9px; font-weight: bold; margin-top: 8px; text-align: center; }
  .label { font-size: 10px; color: #444; }
  .balance-row { font-size: 13px; font-weight: bold; }
</style>
</head><body>
<div class="c" style="margin-bottom: 4px;">
  ${thermalLogo ? `<img src="${thermalLogo}" style="width: 32mm; max-width: 40%; height: auto; object-fit: contain; margin: 0 auto 5px auto; display: block;" alt="VASTHRAALAYAM Logo" onerror="this.style.display='none'" />` : ''}
  <div class="shop-title">${esc(BRAND_EN)}</div>
  <div class="shop-meta" style="margin-top: 2px;">${esc(BRAND_ADDRESS)}</div>
  <div class="shop-meta" style="margin-top: 1px;">Ph: ${esc(BRAND_PHONE_DISPLAY)}</div>
  ${BRAND_EMAIL ? `<div class="shop-meta" style="margin-top: 1px;">${esc(BRAND_EMAIL)}</div>` : ''}
</div>
<div class="line"></div>
<div class="c big">ADVANCE RECEIPT</div>
<div class="c" style="font-size:10px;color:#555;">Not a final tax invoice</div>
<div class="line"></div>
<div><span class="bold">${esc(order.deposit_id)}</span></div>
<div style="font-size:10px;color:#555;">${new Date(order.created_at).toLocaleString('en-IN')}</div>
<div class="line"></div>
<div class="r"><span class="label">Customer</span><span class="bold">${esc(order.customer_name)}</span></div>
<div class="r"><span class="label">Phone</span><span>${esc(order.phone)}</span></div>
${order.address ? `<div class="r"><span class="label">Address</span><span>${esc(order.address)}</span></div>` : ''}
<div class="r"><span class="label">Product</span><span>${esc(order.product_name)}</span></div>
${order.category ? `<div class="r"><span class="label">Category</span><span>${esc(order.category)}</span></div>` : ''}
<div class="r"><span class="label">Expected Delivery</span><span>${esc(deliveryStr)}</span></div>
<div class="r"><span class="label">Payment Mode</span><span>${esc(paymentLabel)}</span></div>
<div class="line"></div>

<div class="bold" style="font-size: 10px; text-transform: uppercase; margin-bottom: 4px; color: #444;">Order Breakdown:</div>
${breakdown.rows.map(row => {
  if (row.type === 'total') {
    return `
      <div class="r bold" style="font-size: 13px; border-top: 1px dashed #555; padding-top: 4px; margin-top: 4px;">
        <span>TOTAL ORDER VALUE</span>
        <span>${esc(formatCurrency(row.amount))}</span>
      </div>
    `
  }
  const sign = row.prefix || ''
  return `
    <div class="r">
      <span class="label" style="color: #222;">${esc(row.label)}</span>
      <span>${sign}${esc(formatCurrency(row.amount))}</span>
    </div>
  `
}).join('')}

<div class="line"></div>
<div class="r bold"><span>Deposit Paid</span><span>${esc(formatCurrency(breakdown.advancePaid))}</span></div>
${breakdown.balancePaid > 0 ? `<div class="r bold"><span>Balance Paid</span><span>${esc(formatCurrency(breakdown.balancePaid))}</span></div>` : ''}
<div class="r balance-row"><span>Balance Due</span><span>${esc(formatCurrency(breakdown.balanceDue))}</span></div>
<div class="line"></div>
<div class="warn">ADVANCE PAYMENT ONLY &mdash; NOT A FINAL INVOICE</div>
</body></html>`

    doc.open()
    doc.write(html)
    doc.close()

    const cleanup = () => {
      try {
        if (frame.parentNode) {
          frame.parentNode.removeChild(frame)
        }
      } catch {}
    }

    setTimeout(() => {
      try {
        if (frame.contentWindow) {
          frame.contentWindow.onbeforeunload = null
          frame.contentWindow.onunload = null
          frame.contentWindow.onafterprint = cleanup
          frame.contentWindow.focus()
          frame.contentWindow.print()
        }
      } catch (err) {
        console.warn('[advanceReceipt] Print error:', err)
      } finally {
        setTimeout(cleanup, 2000)
      }
    }, 300)
  } catch (err) {
    console.warn('[advanceReceipt] Failed to print advance receipt:', err)
  }
}

export function downloadFile(file: File) {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 500)
}
