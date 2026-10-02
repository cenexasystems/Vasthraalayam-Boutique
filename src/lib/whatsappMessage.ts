import { formatInvoiceNo, toNumber, computeOrderTotal } from './retail'
import { BRAND_EN, BRAND_INSTAGRAM, BRAND_INSTAGRAM_URL, BRAND_PRIMARY_PHONE_DISPLAY, BRAND_PRODUCTION_DOMAIN } from './brand'

export type WhatsAppLineItem = {
  name: string
  qty: number
  unit: string
  unitType: 'unit' | 'weight' | 'volume' | 'bundle'
  rate: number
  lineTotal: number
}

export type BuildWhatsAppMessageInput = {
  customerName?: string
  phone?: string
  invoiceNumber: string
  invoiceDate?: string
  invoiceUrl?: string
  paymentMode?: string
  payments?: Array<{ mode: string; amount: number }>
  changeGiven?: number
  depositAmount?: number
  remainingBalance?: number
  advancePaid?: number
  balancePaid?: number
  balanceDue?: number
  items?: WhatsAppLineItem[]
  subtotal?: number
  couponDiscount?: number
  manualDiscountAmount?: number
  shipping?: number
  gstAmount?: number
  total?: number
}

export type AdvanceDepositWhatsAppInput = {
  customerName?: string
  depositId: string
  productName: string
  totalAmount: number
  depositAmount: number
  remainingBalance: number
  expectedDeliveryDate: string
  paymentMethod?: string
}

export const publicInvoiceUrl = (invoiceNumber: string) => {
  const formatted = formatInvoiceNo(invoiceNumber)
  const envUrl = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, '')
  const origin =
    envUrl ||
    (typeof window !== 'undefined' && window.location?.origin && !window.location.origin.includes('localhost')
      ? window.location.origin
      : BRAND_PRODUCTION_DOMAIN)
  return `${origin}/invoice/${encodeURIComponent(formatted)}`
}

export const buildProfessionalWhatsAppMessage = (input: BuildWhatsAppMessageInput) => {
  const customerName = input.customerName?.trim() || 'Valued Customer'
  const invoiceUrl = input.invoiceUrl || publicInvoiceUrl(input.invoiceNumber)
  const formattedNo = formatInvoiceNo(input.invoiceNumber)
  const safeTotal = computeOrderTotal({
    total: input.total,
    subtotal: input.subtotal,
    delivery_charge: input.shipping,
    total_gst: input.gstAmount,
    discount_amount: input.couponDiscount,
    manual_discount_amount: input.manualDiscountAmount,
  })

  const itemsText = input.items && input.items.length > 0
    ? input.items.map(item => `• ${item.name} (x${item.qty}) - ₹ ${toNumber(item.lineTotal, 0).toFixed(2)}`).join('\n')
    : ''

  const formatMode = (m?: string): string => {
    if (!m) return 'Cash'
    const lower = m.trim().toLowerCase()
    if (lower === 'qr' || lower === 'upi') return 'QR / UPI'
    if (lower === 'cash') return 'Cash'
    if (lower === 'card') return 'Card'
    return m.charAt(0).toUpperCase() + m.slice(1)
  }

  const activePayments = (input.payments || []).filter(p => toNumber(p.amount, 0) > 0)
  const isDeposit = (input.depositAmount != null && input.depositAmount > 0) || (input.remainingBalance != null)

  let paymentSection = ''
  if (isDeposit) {
    const advPaid = toNumber(input.depositAmount ?? input.advancePaid, 0)
    const balPaid = toNumber(input.balancePaid, 0)
    const remBal = toNumber(input.remainingBalance ?? input.balanceDue, 0)
    const depositTotalPaid = advPaid + balPaid

    const depositLines = [
      `• Advance Paid: ₹ ${advPaid.toFixed(2)}`,
    ]
    if (balPaid > 0) {
      depositLines.push(`• Balance Paid: ₹ ${balPaid.toFixed(2)}`)
    }
    if (remBal > 0) {
      depositLines.push(`• Balance Due: ₹ ${remBal.toFixed(2)}`)
    }
    if (input.paymentMode) {
      depositLines.push(`• Payment Mode: ${formatMode(input.paymentMode)}`)
    }
    if (depositTotalPaid > 0) {
      depositLines.push(`--------------------------\n*Total Paid:* ₹ ${depositTotalPaid.toFixed(2)}`)
    }
    paymentSection = `💳 *PAYMENT DETAILS:*\n${depositLines.join('\n')}`
  } else if (activePayments.length > 0) {
    const totalPaid = activePayments.reduce((s, p) => s + toNumber(p.amount, 0), 0)
    const cashPaid = activePayments.filter(p => p.mode.toLowerCase() === 'cash').reduce((s, p) => s + toNumber(p.amount, 0), 0)
    const lines = activePayments.map(p => `• ${formatMode(p.mode)}: ₹ ${toNumber(p.amount, 0).toFixed(2)}`)
    const change = toNumber(input.changeGiven, 0)
    if (change > 0) {
      lines.push(`• Change Returned: -₹ ${change.toFixed(2)}`)
      if (cashPaid > 0) {
        lines.push(`• Net Cash: ₹ ${Math.max(0, cashPaid - change).toFixed(2)}`)
      }
    }
    lines.push(`--------------------------\n*Total Paid:* ₹ ${totalPaid.toFixed(2)}`)
    paymentSection = `💳 *PAYMENT DETAILS:*\n${lines.join('\n')}`
  } else {
    paymentSection = `💳 *PAYMENT DETAILS:*\n• Payment Mode: ${formatMode(input.paymentMode)}\n--------------------------\n*Total Paid:* ₹ ${safeTotal.toFixed(2)}`
  }

  return `✨ *${BRAND_EN}* ✨
🛍️ *Official Purchase Invoice & Receipt* 🛍️

Dear ${customerName},

Thank you for shopping at ${BRAND_EN}! We truly appreciate your patronage.

🧾 *INVOICE DETAILS*
📌 *Invoice No:* #${formattedNo}
${input.invoiceDate ? `📅 *Date:* ${new Date(input.invoiceDate).toLocaleDateString('en-IN')}\n` : ''}
${itemsText ? `📦 *ITEMS ORDERED:*\n${itemsText}\n\n` : ''}${safeTotal > 0 ? `💰 *Total Amount:* ₹ ${safeTotal.toFixed(2)}\n\n` : ''}${paymentSection ? `${paymentSection}\n\n` : ''}📄 *View & Download Digital Invoice / PDF:*
👉 ${invoiceUrl}

📞 *Shop Contact:* ${BRAND_PRIMARY_PHONE_DISPLAY}
📷 *Follow us on Instagram:* ${BRAND_INSTAGRAM_URL}

Thank you, and visit us again! ✨`
}

export const buildAdvanceDepositWhatsAppMessage = (input: AdvanceDepositWhatsAppInput) => {
  const customerName = input.customerName?.trim() || 'Valued Customer'
  const deliveryDateFormatted = input.expectedDeliveryDate
    ? (() => {
        try {
          return new Date(`${input.expectedDeliveryDate}T00:00:00`).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })
        } catch {
          return input.expectedDeliveryDate
        }
      })()
    : '-'

  return `✨ *Thank You for Your Advance Order with ${BRAND_EN}!* ✨

Dear ${customerName},

We have successfully received your initial advance payment!

🧾 *Advance Order Details* 👇
📦 Deposit ID: #${input.depositId}
👔 Product: ${input.productName}
💵 Total Order Amount: ₹${toNumber(input.totalAmount, 0).toFixed(2)}
💰 Advance Paid: ₹${toNumber(input.depositAmount, 0).toFixed(2)}${input.paymentMethod ? ` (${input.paymentMethod.toLowerCase() === 'upi' ? 'QR' : input.paymentMethod.toUpperCase()})` : ''}
🔴 Balance to Pay on Delivery: ₹${toNumber(input.remainingBalance, 0).toFixed(2)}
📅 Expected Delivery Date: ${deliveryDateFormatted}

Your garments are being prepared with utmost care. We will have everything ready on or before ${deliveryDateFormatted}!

📞 *Shop Contact:* ${BRAND_PRIMARY_PHONE_DISPLAY}
📷 *Instagram:* @${BRAND_INSTAGRAM}`
}
