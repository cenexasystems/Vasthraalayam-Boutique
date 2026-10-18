import { getShopProfile } from './shopProfile'
import { getMonochromeThermalLogo } from './thermalLogo'
import { formatCurrency, formatInvoiceNo } from './retail'
import { computeInvoiceBreakdown } from './invoiceBreakdown'
import type { TaxRateGroup } from './taxHelper'

export interface ThermalReceiptData {
  invoiceNo: string
  date: string
  customerName?: string
  phone?: string
  items: Array<{
    name: string
    qty: number
    unit?: string
    price: number
    line_total?: number
  }>
  subtotal: number
  shipping: number
  deliveryCharge?: number
  couponDiscount?: number
  manualDiscount?: number
  discountAmount?: number
  manualDiscountAmount?: number
  manualDiscountType?: string
  manualDiscountValue?: number
  couponCode?: string | null
  couponPercentage?: number
  totalGst?: number
  gstAmount?: number
  gstRate?: number
  rateGroups?: TaxRateGroup[]
  roundOff?: number
  total: number
  paymentMode?: string
  payments?: Array<{ mode: string; amount: number; phase?: string; paid_at?: string; notes?: string }>
  changeGiven?: number
  depositAmount?: number
  remainingBalance?: number
  advancePaid?: number
  balancePaid?: number
  balanceDue?: number
  status?: string
  storeName?: string
  storePhone?: string
  storeAddress?: string
  storeEmail?: string
}

export async function printThermalReceipt(data: ThermalReceiptData) {
  try {
    const shop = getShopProfile()
    // A logo uploaded in Settings is printed as-is (greyscale); the built-in logo uses the tuned 1-bit conversion
    const thermalLogo = shop.hasCustomLogo ? shop.logo : await getMonochromeThermalLogo()
    // Create an isolated print iframe protected from third-party extension observers
    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;'
    iframe.setAttribute('aria-hidden', 'true')
    iframe.setAttribute('tabindex', '-1')
    iframe.setAttribute('data-gramm', 'false')
    iframe.setAttribute('data-gramm_editor', 'false')
    iframe.setAttribute('data-enable-grammarly', 'false')
    iframe.setAttribute('spellcheck', 'false')
    document.body.appendChild(iframe)

    const doc = iframe.contentWindow?.document
    if (!doc) {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
      return
    }

    const dateStr = (() => {
      try { return new Date(data.date).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }
      catch { return new Date().toLocaleString('en-IN') }
    })()

    const formatCustomerPhone = (phone?: string): string => {
      if (!phone) return ''
      const trimmed = phone.trim()
      const digits = trimmed.replace(/\D/g, '')
      if (digits.length === 12 && digits.startsWith('91')) {
        return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`
      }
      if (digits.length === 10) {
        return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`
      }
      return trimmed
    }

    const breakdown = computeInvoiceBreakdown({
      subtotal: data.subtotal,
      total: data.total,
      items: data.items as unknown as Array<Record<string, unknown>>,
      discountAmount: data.discountAmount ?? data.couponDiscount,
      manualDiscountAmount: data.manualDiscountAmount ?? data.manualDiscount,
      manualDiscountType: data.manualDiscountType,
      manualDiscountValue: data.manualDiscountValue,
      couponCode: data.couponCode,
      couponPercentage: data.couponPercentage,
      totalGst: data.totalGst ?? data.gstAmount,
      gstRate: data.gstRate,
    rateGroups: data.rateGroups,
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

    const html = `
      <!DOCTYPE html>
      <html lang="en" data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false" spellcheck="false">
        <head>
          <meta charset="UTF-8">
          <meta name="grammarly" content="off">
          <meta name="robots" content="noindex,nofollow">
          <title>Receipt - ${data.invoiceNo}</title>
        <style>
          @page {
            margin: 0;
            size: 80mm auto;
          }
          body {
            font-family: 'Courier New', Courier, monospace, Arial, sans-serif;
            font-size: 12px;
            color: #000;
            margin: 0 auto;
            padding: 3mm 4mm;
            width: 100%;
            max-width: 80mm;
            box-sizing: border-box;
            word-wrap: break-word;
            overflow-wrap: break-word;
          }
          .text-center { text-align: center; word-break: break-word; }
          .text-right { text-align: right; }
          .text-left { text-align: left; }
          .font-bold { font-weight: bold; }
          .mb-1 { margin-bottom: 4px; }
          .mb-2 { margin-bottom: 8px; }
          .mt-1 { margin-top: 4px; }
          .mt-2 { margin-top: 8px; }
          .border-bottom { border-bottom: 1px dashed #000; padding-bottom: 4px; margin-bottom: 4px; }
          .border-top { border-top: 1px dashed #000; padding-top: 4px; margin-top: 4px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { padding: 2px 0; vertical-align: top; }
          .item-name { font-size: 11px; padding-right: 4px; }
        </style>
      </head>
      <body>
        <div class="text-center mb-2">
          ${thermalLogo ? `<img src="${thermalLogo}" style="width: 32mm; max-width: 40%; height: auto; object-fit: contain; margin: 0 auto 5px auto; display: block;${shop.hasCustomLogo ? ' filter: grayscale(1) contrast(1.2);' : ''}" alt="Shop Logo" onerror="this.style.display='none'" />` : ''}
          <div class="font-bold" style="font-size: 15px; letter-spacing: 1px; line-height: 1.25; text-transform: uppercase; word-break: break-word;">${data.storeName || shop.name}</div>
          <div style="font-size: 10px; margin-top: 3px; line-height: 1.35; word-break: break-word;">${data.storeAddress || shop.address}</div>
          <div class="mt-1" style="font-size: 10px;">Ph: ${data.storePhone || shop.phoneDisplay}${shop.secondaryPhoneDisplay ? ` / ${shop.secondaryPhoneDisplay}` : ''}</div>
          ${(data.storeEmail || shop.email) ? `<div style="font-size: 10px; margin-top: 1px;">${data.storeEmail || shop.email}</div>` : ''}
        </div>

        <div class="border-bottom border-top" style="font-size: 11px;">
          <div>Inv: #${formatInvoiceNo(data.invoiceNo)}</div>
          <div>Date: ${dateStr}</div>
          ${data.customerName ? `<div>Name: ${data.customerName}</div>` : ''}
          ${data.phone ? `<div>Tel: ${formatCustomerPhone(data.phone)}</div>` : ''}
        </div>

        <table class="border-bottom" style="width: 100%; table-layout: fixed; border-collapse: collapse;">
          <thead>
            <tr style="font-size: 10px; border-bottom: 1px dashed #000;">
              <th style="width: 50%; text-align: left; padding: 4px 0;">Item Name</th>
              <th style="width: 18%; text-align: center; padding: 4px 0;">Qty</th>
              <th style="width: 32%; text-align: right; padding: 4px 0;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${data.items.map(item => {
              const lineTotal = item.line_total ?? (item.qty * item.price)
              const unit = item.unit && item.unit !== 'unit' && item.unit !== 'piece' ? item.unit : ''
              const effectivePrice = (item as any).final_price ?? (item as any).finalPrice ?? (item as any).unit_price ?? item.price
              const rateDisplay = `${formatCurrency(effectivePrice)}${unit ? `/${unit}` : ''}`
              return `
                <tr>
                  <td style="text-align: left; padding: 3px 2px 3px 0; vertical-align: top; word-break: break-word;">
                    <div style="font-size: 11px; font-weight: bold; line-height: 1.25;">${item.name}</div>
                    <div style="font-size: 9px; color: #444; margin-top: 1px;">@ ${rateDisplay}</div>
                  </td>
                  <td style="text-align: center; vertical-align: top; padding: 3px 0; font-size: 11px;">
                    ${item.qty}
                  </td>
                  <td style="text-align: right; vertical-align: top; padding: 3px 0; font-size: 11px; font-weight: bold;">
                    ${formatCurrency(lineTotal)}
                  </td>
                </tr>
              `
            }).join('')}
          </tbody>
        </table>

        <div class="border-bottom" style="font-size: 12px;">
          <table style="width: 100%;">
            ${breakdown.rows.map(row => {
              if (row.type === 'total') {
                return `
                  <tr class="font-bold" style="font-size: 14px; border-top: 1px dashed #000;">
                    <td class="text-left" style="padding-top: 5px;">TOTAL</td>
                    <td class="text-right" style="padding-top: 5px;">${formatCurrency(row.amount)}</td>
                  </tr>
                `
              }
              const sign = row.prefix ? `${row.prefix}` : ''
              return `
                <tr>
                  <td class="text-left">${row.label}</td>
                  <td class="text-right">${sign}${formatCurrency(row.amount)}</td>
                </tr>
              `
            }).join('')}
          </table>
        </div>

        <div class="border-bottom" style="font-size: 11px; padding-top: 4px;">
          <div class="font-bold" style="font-size: 10px; margin-bottom: 2px;">PAYMENT DETAILS:</div>
          <table style="width: 100%;">
            ${breakdown.isDepositInvoice ? `
              ${breakdown.paymentDisplay.advancePayments.length > 0 ? breakdown.paymentDisplay.advancePayments.map(p => `
                <tr>
                  <td class="text-left">${p.label}</td>
                  <td class="text-right font-bold">${formatCurrency(p.amount)}</td>
                </tr>
              `).join('') : `
                <tr>
                  <td class="text-left">Advance Paid</td>
                  <td class="text-right font-bold">${formatCurrency(breakdown.advancePaid)}</td>
                </tr>
              `}
              ${breakdown.paymentDisplay.balancePayments.length > 0 ? breakdown.paymentDisplay.balancePayments.map(p => `
                <tr>
                  <td class="text-left">${p.label}</td>
                  <td class="text-right font-bold">${formatCurrency(p.amount)}</td>
                </tr>
              `).join('') : (breakdown.balancePaid > 0 ? `
                <tr>
                  <td class="text-left">Balance Paid</td>
                  <td class="text-right font-bold">${formatCurrency(breakdown.balancePaid)}</td>
                </tr>
              ` : '')}
              ${breakdown.showBalanceDue ? `
                <tr class="font-bold">
                  <td class="text-left">Balance Due</td>
                  <td class="text-right">${formatCurrency(breakdown.balanceDue)}</td>
                </tr>
              ` : ''}
              <tr class="font-bold" style="border-top: 1px dashed #888;">
                <td class="text-left" style="padding-top: 3px;">Total Paid</td>
                <td class="text-right" style="padding-top: 3px;">${formatCurrency(breakdown.paymentDisplay.totalPaid)}</td>
              </tr>
            ` : breakdown.paymentDisplay.isSplit ? `
              <tr>
                <td colspan="2" class="text-left font-bold" style="padding-bottom: 2px;">Payment:</td>
              </tr>
              ${breakdown.paymentDisplay.splitPayments.map(p => `
                <tr>
                  <td class="text-left" style="padding-left: 6px;">${p.label}</td>
                  <td class="text-right">${formatCurrency(p.amount)}</td>
                </tr>
              `).join('')}
              ${(data.changeGiven || 0) > 0 ? `
                <tr>
                  <td class="text-left" style="padding-left: 6px; color: #444;">Change Returned</td>
                  <td class="text-right">-${formatCurrency(data.changeGiven || 0)}</td>
                </tr>
              ` : ''}
              <tr class="font-bold" style="border-top: 1px dashed #888;">
                <td class="text-left" style="padding-top: 3px;">Total Paid</td>
                <td class="text-right" style="padding-top: 3px;">${formatCurrency(breakdown.paymentDisplay.totalPaid)}</td>
              </tr>
            ` : `
              <tr>
                <td class="text-left">Payment Mode:</td>
                <td class="text-right">${breakdown.paymentDisplay.singleModeLabel}</td>
              </tr>
              ${(data.changeGiven || 0) > 0 ? `
                <tr>
                  <td class="text-left" style="color: #444;">Change Returned</td>
                  <td class="text-right">-${formatCurrency(data.changeGiven || 0)}</td>
                </tr>
              ` : ''}
              <tr class="font-bold" style="border-top: 1px dashed #888;">
                <td class="text-left" style="padding-top: 3px;">Total Paid</td>
                <td class="text-right" style="padding-top: 3px;">${formatCurrency(breakdown.total)}</td>
              </tr>
            `}
          </table>
        </div>

        <div class="text-center mt-2" style="font-size: 11px;">
          <div class="font-bold">Thank you for shopping at ${data.storeName || shop.name}!</div>
        </div>
      </body>
    </html>
  `

    doc.open()
    doc.write(html)
    doc.close()

    const cleanup = () => {
      try {
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe)
        }
      } catch {}
    }

    // Wait for resources to load, then print safely
    setTimeout(() => {
      try {
        if (iframe.contentWindow) {
          iframe.contentWindow.onbeforeunload = null
          iframe.contentWindow.onunload = null
          iframe.contentWindow.onafterprint = cleanup
          iframe.contentWindow.focus()
          iframe.contentWindow.print()
        }
      } catch (printErr) {
        console.warn('[thermalPrint] Print execution error:', printErr)
      } finally {
        setTimeout(cleanup, 2000)
      }
    }, 250)
  } catch (err) {
    console.warn('[thermalPrint] Failed to print receipt:', err)
  }
}
