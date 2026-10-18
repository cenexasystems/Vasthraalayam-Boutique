import { formatInvoiceNo, formatDepositId, toNumber } from './retail'
import { getPublicBaseUrl } from './brand'
import { getShopProfile } from './shopProfile'
import { computeInvoiceBreakdown } from './invoiceBreakdown'
import type { TaxRateGroup } from './taxHelper'

export type WhatsAppLineItem = {
  name: string
  qty: number
  unit: string
  unitType: 'unit' | 'weight' | 'volume' | 'bundle'
  rate: number
  lineTotal: number
  unit_price?: number
  unitPrice?: number
  base_price?: number
  basePrice?: number
  gst_rate?: number
  gstRate?: number
  gst_percent?: number
  gstPercent?: number
  gst_amount?: number
  gstAmount?: number
  taxable_amount?: number
  taxableAmount?: number
  cgst?: number
  sgst?: number
}

export type BuildWhatsAppMessageInput = {
  customerName?: string
  phone?: string
  invoiceNumber: string
  invoiceDate?: string
  invoiceUrl?: string
  paymentMode?: string
  payments?: Array<{ mode: string; amount: number; phase?: string; paid_at?: string; notes?: string }>
  changeGiven?: number
  depositAmount?: number
  remainingBalance?: number
  advancePaid?: number
  balancePaid?: number
  balanceDue?: number
  status?: string
  items?: WhatsAppLineItem[]
  subtotal?: number
  discountAmount?: number
  couponDiscount?: number
  manualDiscountAmount?: number
  manualDiscountType?: string
  manualDiscountValue?: number
  couponCode?: string | null
  couponPercentage?: number
  shipping?: number
  deliveryCharge?: number
  gstAmount?: number
  totalGst?: number
  gstRate?: number
  rateGroups?: TaxRateGroup[]
  roundOff?: number
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
  receiptUrl?: string
}

export const buildPublicInvoiceUrl = (invoiceNumber: string): string => {
  const formatted = formatInvoiceNo(invoiceNumber)
  const baseUrl = getPublicBaseUrl()
  // A trailing slash keeps WhatsApp from treating the numeric tail of invoice
  // numbers as a separate phone number and truncating the clickable URL.
  return `${baseUrl}/invoice/${encodeURIComponent(formatted)}/`
}

export const buildPublicDepositUrl = (depositId: string): string => {
  const formatted = formatDepositId(depositId)
  const baseUrl = getPublicBaseUrl()
  return `${baseUrl}/invoice/${encodeURIComponent(formatted)}/`
}

export const publicInvoiceUrl = buildPublicInvoiceUrl
export const publicDepositUrl = buildPublicDepositUrl

export const buildProfessionalWhatsAppMessage = (input: BuildWhatsAppMessageInput) => {
  const customerName = input.customerName?.trim() || 'Valued Customer'
  const shop = getShopProfile()
  const invoiceUrl = input.invoiceUrl || publicInvoiceUrl(input.invoiceNumber)
  const formattedNo = formatInvoiceNo(input.invoiceNumber)

  const breakdown = computeInvoiceBreakdown({
    subtotal: input.subtotal ?? 0,
    total: input.total,
    items: input.items as unknown as Array<Record<string, unknown>>,
    discountAmount: input.discountAmount ?? input.couponDiscount,
    manualDiscountAmount: input.manualDiscountAmount,
    manualDiscountType: input.manualDiscountType,
    manualDiscountValue: input.manualDiscountValue,
    couponCode: input.couponCode,
    couponPercentage: input.couponPercentage,
    totalGst: input.totalGst ?? input.gstAmount,
    gstRate: input.gstRate,
    rateGroups: input.rateGroups,
    deliveryCharge: input.deliveryCharge ?? input.shipping,
    shipping: input.shipping,
    roundOff: input.roundOff,
    paymentMode: input.paymentMode,
    payments: input.payments,
    depositAmount: input.depositAmount,
    remainingBalance: input.remainingBalance,
    advancePaid: input.advancePaid,
    balancePaid: input.balancePaid,
    balanceDue: input.balanceDue,
    status: input.status,
  })

  const itemsText = input.items && input.items.length > 0
    ? input.items.map(item => `• ${item.name} (x${item.qty}) - ₹ ${toNumber(item.lineTotal, 0).toFixed(2)}`).join('\n')
    : ''

  const breakdownLines = breakdown.rows.map(row => {
    if (row.type === 'total') return `*TOTAL: ₹ ${row.amount.toFixed(2)}*`
    const sign = row.prefix ? `${row.prefix}` : ''
    return `• ${row.label}: ${sign}₹ ${row.amount.toFixed(2)}`
  }).join('\n')

  let paymentSection = ''
  if (breakdown.isDepositInvoice) {
    const depositLines: string[] = []
    if (breakdown.paymentDisplay.advancePayments.length > 0) {
      breakdown.paymentDisplay.advancePayments.forEach(p => {
        depositLines.push(`• ${p.label}: ₹ ${p.amount.toFixed(2)}`)
      })
    } else {
      depositLines.push(`• Advance Paid: ₹ ${breakdown.advancePaid.toFixed(2)}`)
    }

    if (breakdown.paymentDisplay.balancePayments.length > 0) {
      breakdown.paymentDisplay.balancePayments.forEach(p => {
        depositLines.push(`• ${p.label}: ₹ ${p.amount.toFixed(2)}`)
      })
    } else if (breakdown.balancePaid > 0) {
      depositLines.push(`• Balance Paid: ₹ ${breakdown.balancePaid.toFixed(2)}`)
    }

    if (breakdown.showBalanceDue) {
      depositLines.push(`• Balance Due: ₹ ${breakdown.balanceDue.toFixed(2)}`)
    }
    depositLines.push(`--------------------------\n*Total Paid:* ₹ ${breakdown.paymentDisplay.totalPaid.toFixed(2)}`)
    paymentSection = `💳 *PAYMENT DETAILS:*\n${depositLines.join('\n')}`
  } else if (breakdown.paymentDisplay.isSplit) {
    const lines = [
      `Payment:`,
      ...breakdown.paymentDisplay.splitPayments.map(p => `  • ${p.label}: ₹ ${p.amount.toFixed(2)}`)
    ]
    const change = toNumber(input.changeGiven, 0)
    if (change > 0) {
      lines.push(`• Change Returned: -₹ ${change.toFixed(2)}`)
    }
    lines.push(`--------------------------\n*Total Paid:* ₹ ${breakdown.paymentDisplay.totalPaid.toFixed(2)}`)
    paymentSection = `💳 *PAYMENT DETAILS:*\n${lines.join('\n')}`
  } else {
    const lines = [`• Payment: ${breakdown.paymentDisplay.singleModeLabel}`]
    const change = toNumber(input.changeGiven, 0)
    if (change > 0) {
      lines.push(`• Change Returned: -₹ ${change.toFixed(2)}`)
    }
    lines.push(`--------------------------\n*Total Paid:* ₹ ${breakdown.total.toFixed(2)}`)
    paymentSection = `💳 *PAYMENT DETAILS:*\n${lines.join('\n')}`
  }

  return `✨ *${shop.name}* ✨
🛍️ *Official Purchase Invoice & Receipt* 🛍️

Dear ${customerName},

Thank you for shopping at ${shop.name}! We truly appreciate your patronage.

🧾 *INVOICE DETAILS*
📌 *Invoice No:* #${formattedNo}
${input.invoiceDate ? `📅 *Date:* ${new Date(input.invoiceDate).toLocaleDateString('en-IN')}\n` : ''}
${itemsText ? `📦 *ITEMS ORDERED:*\n${itemsText}\n\n` : ''}💰 *BILL BREAKDOWN:*\n${breakdownLines}\n\n${paymentSection ? `${paymentSection}\n\n` : ''}📄 *View & Download Digital Invoice / PDF:*
👉 ${invoiceUrl}

📞 *Shop Contact:* ${shop.phoneDisplay}${shop.secondaryPhoneDisplay ? ` / ${shop.secondaryPhoneDisplay}` : ''}
${shop.instagramUrl ? `📷 *Follow us on Instagram:* ${shop.instagramUrl}
` : ''}
Thank you, and visit us again! ✨`
}

export const buildAdvanceDepositWhatsAppMessage = (input: AdvanceDepositWhatsAppInput) => {
  const customerName = input.customerName?.trim() || 'Valued Customer'
  const shop = getShopProfile()
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

  return `✨ *Thank You for Your Advance Order with ${shop.name}!* ✨

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

📄 *View & Download Digital Deposit Receipt:*
👉 ${input.receiptUrl || buildPublicDepositUrl(input.depositId)}

📞 *Shop Contact:* ${shop.phoneDisplay}${shop.secondaryPhoneDisplay ? ` / ${shop.secondaryPhoneDisplay}` : ''}
${shop.instagram ? `📷 *Instagram:* @${shop.instagram}` : ''}`
}
