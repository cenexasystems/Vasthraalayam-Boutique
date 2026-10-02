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

  const paymentDisplay = (() => {
    if (input.payments && input.payments.length > 0) {
      return input.payments
        .map(p => `${p.mode === 'qr' ? 'QR' : p.mode.charAt(0).toUpperCase() + p.mode.slice(1)} ₹${toNumber(p.amount, 0).toFixed(2)}`)
        .join(', ')
    }
    return input.paymentMode || ''
  })()

  return `✨ *${BRAND_EN}* ✨
🛍️ *Official Purchase Invoice & Receipt* 🛍️

Dear ${customerName},

Thank you for shopping at ${BRAND_EN}! We truly appreciate your patronage.

🧾 *INVOICE DETAILS*
📌 *Invoice No:* #${formattedNo}
${input.invoiceDate ? `📅 *Date:* ${new Date(input.invoiceDate).toLocaleDateString('en-IN')}\n` : ''}${paymentDisplay ? `💳 *Payment Mode:* ${paymentDisplay}\n` : ''}${safeTotal > 0 ? `💰 *Total Amount:* ₹ ${safeTotal.toFixed(2)}\n` : ''}
${itemsText ? `📦 *ITEMS ORDERED:*\n${itemsText}\n\n` : ''}📄 *View & Download Digital Invoice / PDF:*
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
