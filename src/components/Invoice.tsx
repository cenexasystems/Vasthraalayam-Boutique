import React from 'react'
import { BRAND_ADDRESS, BRAND_EN, BRAND_INSTAGRAM, BRAND_PRIMARY_PHONE_DISPLAY, BRAND_ICON } from '../lib/brand'
import { formatCurrency, formatQuantityDisplay, normalizeStructuredOrderItem, formatInvoiceNo, toNumber, computeOrderTotal } from '../lib/retail'

export interface InvoiceItem {
  id: string | number
  name: string
  nameTa?: string
  qty: number
  quantity?: number
  unit?: string
  unit_type?: 'unit' | 'piece' | 'weight' | 'volume' | 'bundle'
  base_quantity?: number
  base_price?: number
  price: number
  offerPrice?: number | null
  line_total?: number
  lineTotal?: number
}

export interface InvoiceProps {
  invoiceNo: string
  date: string
  customerName?: string
  phone?: string
  address?: string
  items: InvoiceItem[]
  subtotal: number
  shipping?: number
  deliveryCharge?: number
  discountAmount?: number
  manualDiscountAmount?: number
  gstAmount?: number
  couponCode?: string
  total: number
  status?: string
  userId?: string
  paymentMode?: string
  payments?: Array<{ mode: string; amount: number; phase?: string; paid_at?: string; notes?: string }>
  changeGiven?: number
  depositAmount?: number
  remainingBalance?: number
  advancePaid?: number
  balancePaid?: number
  balanceDue?: number
  onPrintReceipt?: () => void
}

const formatPaymentMode = (m?: string): string => {
  if (!m) return 'Cash'
  const lower = m.trim().toLowerCase()
  if (lower === 'qr' || lower === 'upi') return 'QR / UPI'
  if (lower === 'cash') return 'Cash'
  if (lower === 'card') return 'Card'
  return m.charAt(0).toUpperCase() + m.slice(1)
}

export const Invoice: React.FC<InvoiceProps> = ({
  invoiceNo,
  date,
  customerName,
  phone,
  address,
  items,
  subtotal,
  shipping = 0,
  deliveryCharge = 0,
  discountAmount = 0,
  manualDiscountAmount = 0,
  gstAmount = 0,
  couponCode,
  total,
  status = 'completed',
  userId,
  paymentMode,
  payments,
  changeGiven,
  depositAmount,
  remainingBalance,
  advancePaid,
  balancePaid,
  balanceDue,
}) => {
  const formattedInvoiceNo = formatInvoiceNo(invoiceNo)
  const dateStr = (() => {
    try { return new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) }
    catch { return new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) }
  })()

  const statusColor = status === 'completed' ? 'var(--invoice-primary, #1F3A2E)' : status === 'cancelled' ? '#dc2626' : '#d97706'
  const safeSubtotal = toNumber(subtotal, 0)
  const safeShipping = toNumber(shipping, 0)
  const safeDeliveryCharge = toNumber(deliveryCharge, 0)
  const effectiveDelivery = safeDeliveryCharge || safeShipping
  const safeDiscountAmount = toNumber(discountAmount, 0)
  const safeManualDiscountAmount = toNumber(manualDiscountAmount, 0)
  const safeGstAmount = toNumber(gstAmount, 0)
  const safeTotal = computeOrderTotal({
    total,
    subtotal: safeSubtotal,
    delivery_charge: effectiveDelivery,
    total_gst: safeGstAmount,
    discount_amount: safeDiscountAmount,
    manual_discount_amount: safeManualDiscountAmount,
  })

  const activePayments = (payments || []).filter(p => toNumber(p.amount, 0) > 0)
  const isDepositInvoice = (depositAmount != null && depositAmount > 0) || (remainingBalance != null)
  const effectiveAdvancePaid = toNumber(depositAmount ?? advancePaid, 0)
  const effectiveBalanceDue = toNumber(remainingBalance ?? balanceDue, 0)
  const effectiveBalancePaid = toNumber(balancePaid, 0)
  const safeChangeGiven = toNumber(changeGiven, 0)
  const totalPaidAmount = activePayments.reduce((sum, p) => sum + toNumber(p.amount, 0), 0)
  const cashAmount = activePayments.filter(p => p.mode.toLowerCase() === 'cash').reduce((sum, p) => sum + toNumber(p.amount, 0), 0)

  return (
    <div
      id="invoice-print-root"
      className="w-full max-w-[680px] mx-auto bg-white text-[#111111] box-border flex flex-col p-4 sm:p-8 print:p-0 print:max-w-full overflow-hidden border border-[#ead7b7]/40 shadow-xl rounded-3xl print:min-h-[290mm]"
      style={{
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
        WebkitPrintColorAdjust: 'exact',
        printColorAdjust: 'exact',
      }}
    >
      {/* ── HEADER ────────────────────────────────────────────────── */}
      <div
        className="invoice-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
          borderBottom: '1px solid #ead7b7',
          paddingBottom: 16,
          marginBottom: 16,
        }}
      >
        {/* Left block (logo, business name, address, phone) with min-width: 0 taking remaining space */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, minWidth: 0, flex: 1 }}>
          <div style={{ width: 56, height: 56, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src={BRAND_ICON} alt={BRAND_EN} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <div style={{ minWidth: 0, flex: 1, wordBreak: 'break-word' }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--invoice-primary, #1F3A2E)', letterSpacing: 1.5, textTransform: 'uppercase', lineHeight: 1.2 }}>
              {BRAND_EN}
            </div>
            <div style={{ fontSize: 11, color: '#4b5563', marginTop: 4, fontWeight: 500, lineHeight: 1.4 }}>
              {BRAND_ADDRESS}
            </div>
            <div style={{ fontSize: 11, color: '#4b5563', marginTop: 4, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span>📞 {BRAND_PRIMARY_PHONE_DISPLAY}</span>
              <span>📷 @{BRAND_INSTAGRAM}</span>
            </div>
          </div>
        </div>

        {/* Header right block: only Date and Invoice no. Right-aligned, max-width ~35%, white-space: nowrap for the date */}
        <div
          style={{
            maxWidth: '35%',
            minWidth: 'fit-content',
            textAlign: 'right',
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 800, color: '#888', textTransform: 'uppercase', letterSpacing: 0.8 }}>
            TAX INVOICE
          </div>
          <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--invoice-primary, #1F3A2E)', marginTop: 2 }}>
            #{formattedInvoiceNo}
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#4b5563', marginTop: 3 }}>
            Date: {dateStr}
          </div>
        </div>
      </div>

      {/* ── META ROW (Properly partitioned bill details) ─────────── */}
      <div className="invoice-meta grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div style={{ minWidth: 0, padding: '12px 14px', borderRadius: 12, background: '#FBFAF6', border: '1px solid #ead7b7' }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Bill Details</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#666', textTransform: 'uppercase' }}>Invoice No</span>
            <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--brand-black)' }}>#{formattedInvoiceNo}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#666', textTransform: 'uppercase' }}>Date</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>{dateStr}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#666', textTransform: 'uppercase' }}>Status</span>
            <span
              style={{
                display: 'inline-block', padding: '2px 8px', borderRadius: 99,
                background: statusColor + '18', color: statusColor,
                fontSize: 9, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase', border: `1px solid ${statusColor}40`
              }}
            >
              {status}
            </span>
          </div>
          {userId && (
            <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px dashed #e5e7eb', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 9, fontWeight: 800, color: '#888', textTransform: 'uppercase' }}>User ID</span>
              <span style={{ fontSize: 10, fontWeight: 600, color: '#555' }}>{userId}</span>
            </div>
          )}
        </div>

        <div style={{ minWidth: 0, padding: '12px 14px', borderRadius: 12, background: '#FBFAF6', border: '1px solid #ead7b7', overflowWrap: 'anywhere' }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Customer Information</div>
          <div style={{ fontSize: 9, fontWeight: 800, color: '#888', textTransform: 'uppercase', letterSpacing: 0.7, marginTop: 4 }}>Customer Name</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--brand-black)', lineHeight: 1.35, wordBreak: 'break-word' }}>{customerName || 'Walk-in Customer'}</div>
          <div style={{ fontSize: 9, fontWeight: 800, color: '#888', textTransform: 'uppercase', letterSpacing: 0.7, marginTop: 6 }}>Mobile Number</div>
          <div style={{ fontSize: 12, color: '#555', lineHeight: 1.4, wordBreak: 'break-word' }}>{phone || '—'}</div>
          {address && <div style={{ fontSize: 11, color: '#777', marginTop: 4, lineHeight: 1.4, wordBreak: 'break-word' }}>{address}</div>}
        </div>
      </div>

      {/* ── DIVIDER ──────────────────────────────────────────────── */}
      <div style={{ borderTop: '1px dashed #d0d0d0', marginBottom: 20 }} />

      {/* ── ITEMS TABLE ──────────────────────────────────────────── */}
      <div className="w-full overflow-x-auto">
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 320 }}>
          <thead>
            <tr style={{ background: 'var(--invoice-primary, #1F3A2E)', borderRadius: 8 }}>
              <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 800, color: 'var(--invoice-primary-contrast, #FFFFFF)', textTransform: 'uppercase', letterSpacing: 0.8, width: 28 }}>#</th>
              <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 800, color: 'var(--invoice-primary-contrast, #FFFFFF)', textTransform: 'uppercase', letterSpacing: 0.8 }}>Item / SKU</th>
              <th style={{ padding: '8px 10px', textAlign: 'center', fontSize: 10, fontWeight: 800, color: 'var(--invoice-primary-contrast, #FFFFFF)', textTransform: 'uppercase', letterSpacing: 0.8, width: 45 }}>Qty</th>
              <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: 10, fontWeight: 800, color: 'var(--invoice-primary-contrast, #FFFFFF)', textTransform: 'uppercase', letterSpacing: 0.8, width: 75 }}>Rate</th>
              <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: 10, fontWeight: 800, color: 'var(--invoice-primary-contrast, #FFFFFF)', textTransform: 'uppercase', letterSpacing: 0.8, width: 85 }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const normalized = normalizeStructuredOrderItem(item as unknown as Record<string, unknown>)
              const displayName = normalized.tamil_name || item.nameTa || normalized.name
              return (
                <tr key={idx} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '10px 8px', fontSize: 11, color: '#999', verticalAlign: 'top' }}>{idx + 1}</td>
                  <td style={{ padding: '10px 8px', verticalAlign: 'top' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand-black)' }}>{normalized.name}</div>
                    {displayName && displayName !== normalized.name && <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>{displayName}</div>}
                    {item.offerPrice && item.price !== item.offerPrice && (
                      <div style={{ fontSize: 10, color: '#aaa', textDecoration: 'line-through', marginTop: 2 }}>MRP ₹{item.price}</div>
                    )}
                    <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>
                      {normalized.unit} · {formatCurrency(normalized.base_price)}
                    </div>
                  </td>
                  <td style={{ padding: '10px 8px', fontSize: 12, fontWeight: 600, textAlign: 'center', verticalAlign: 'top' }}>{formatQuantityDisplay(normalized.quantity, normalized.unit, normalized.unit_type)}</td>
                  <td style={{ padding: '10px 8px', fontSize: 12, fontWeight: 600, textAlign: 'right', verticalAlign: 'top', color: '#555', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(normalized.base_price)}</td>
                  <td style={{ padding: '10px 8px', fontSize: 13, fontWeight: 800, textAlign: 'right', verticalAlign: 'top', color: 'var(--brand-black)', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(normalized.line_total)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── TOTALS ───────────────────────────────────────────────── */}
      <div className="invoice-totals" style={{ marginTop: 24, borderTop: '2px solid var(--invoice-primary, #1F3A2E)', paddingTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ minWidth: 240, width: '100%', maxWidth: 300 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: '#666' }}>Subtotal</span>
              <span style={{ fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(safeSubtotal)}</span>
            </div>
            {safeDiscountAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--invoice-primary, #1F3A2E)' }}>
                  Coupon{couponCode ? ` (${couponCode})` : ''}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--invoice-primary, #1F3A2E)', fontVariantNumeric: 'tabular-nums' }}>−{formatCurrency(safeDiscountAmount)}</span>
              </div>
            )}
            {safeManualDiscountAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--invoice-primary, #1F3A2E)' }}>Manual Discount</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--invoice-primary, #1F3A2E)', fontVariantNumeric: 'tabular-nums' }}>−{formatCurrency(safeManualDiscountAmount)}</span>
              </div>
            )}
            {safeGstAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: '#666' }}>GST</span>
                <span style={{ fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>+{formatCurrency(safeGstAmount)}</span>
              </div>
            )}
            {effectiveDelivery > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: '#666' }}>Delivery</span>
                <span style={{ fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(effectiveDelivery)}</span>
              </div>
            )}
            <div
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                borderTop: '2px solid var(--invoice-primary, #1F3A2E)', paddingTop: 10, marginTop: 4,
              }}
            >
              <span style={{ fontSize: 15, fontWeight: 900, color: 'var(--invoice-primary, #1F3A2E)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Total</span>
              <span style={{ fontSize: 20, fontWeight: 900, color: 'var(--invoice-primary, #1F3A2E)', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(safeTotal)}</span>
            </div>
            {/* ── PAYMENT DETAILS BLOCK (under TOTAL row) ─────────── */}
            <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 12, paddingTop: 10 }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  color: 'var(--invoice-primary, #1F3A2E)',
                  textTransform: 'uppercase',
                  letterSpacing: 0.8,
                  marginBottom: 6,
                  textAlign: 'left',
                }}
              >
                PAYMENT DETAILS
              </div>

              {isDepositInvoice ? (
                <div>
                  {(() => {
                    const advancePayments = activePayments.filter(p => p.phase === 'deposit' || p.phase === 'advance')
                    const balancePayments = activePayments.filter(p => p.phase === 'remaining' || p.phase === 'balance')

                    if (advancePayments.length > 0 || balancePayments.length > 0) {
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {advancePayments.length > 0 && (
                            <div>
                              <div style={{ fontSize: 9, fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', marginBottom: 2 }}>
                                Advance Paid {advancePayments[0]?.paid_at ? `(${new Date(advancePayments[0].paid_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })})` : ''}
                              </div>
                              {advancePayments.map((p, idx) => (
                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#4b5563', paddingLeft: 6, marginBottom: 2 }}>
                                  <span>{formatPaymentMode(p.mode)}</span>
                                  <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(p.amount)}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {balancePayments.length > 0 && (
                            <div>
                              <div style={{ fontSize: 9, fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', marginBottom: 2 }}>
                                Balance Paid {balancePayments[0]?.paid_at ? `(${new Date(balancePayments[0].paid_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })})` : ''}
                              </div>
                              {balancePayments.map((p, idx) => (
                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#4b5563', paddingLeft: 6, marginBottom: 2 }}>
                                  <span>{formatPaymentMode(p.mode)}</span>
                                  <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(p.amount)}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {effectiveBalanceDue > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--invoice-primary, #1F3A2E)', fontWeight: 700, marginTop: 2 }}>
                              <span>Balance Due</span>
                              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(effectiveBalanceDue)}</span>
                            </div>
                          )}

                          <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 4, paddingTop: 6, display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 800, color: 'var(--invoice-primary, #1F3A2E)' }}>
                            <span>Total Paid</span>
                            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(effectiveAdvancePaid + effectiveBalancePaid || totalPaidAmount)}</span>
                          </div>
                        </div>
                      )
                    }

                    return (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#4b5563', marginBottom: 3 }}>
                          <span>Advance Paid</span>
                          <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(effectiveAdvancePaid)}</span>
                        </div>
                        {effectiveBalancePaid > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#4b5563', marginBottom: 3 }}>
                            <span>Balance Paid</span>
                            <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(effectiveBalancePaid)}</span>
                          </div>
                        )}
                        {effectiveBalanceDue > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--invoice-primary, #1F3A2E)', fontWeight: 700, marginBottom: 3 }}>
                            <span>Balance Due</span>
                            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(effectiveBalanceDue)}</span>
                          </div>
                        )}
                        {paymentMode && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                            <span>Payment Mode:</span>
                            <span style={{ fontWeight: 600 }}>{formatPaymentMode(paymentMode)}</span>
                          </div>
                        )}
                        {(effectiveAdvancePaid + effectiveBalancePaid > 0) && (
                          <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 6, paddingTop: 6, display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 800, color: 'var(--invoice-primary, #1F3A2E)' }}>
                            <span>Total Paid</span>
                            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(effectiveAdvancePaid + effectiveBalancePaid)}</span>
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              ) : activePayments.length > 0 ? (
                <div>
                  {activePayments.map((p, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#4b5563', marginBottom: 3 }}>
                      <span>{formatPaymentMode(p.mode)}</span>
                      <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(p.amount)}</span>
                    </div>
                  ))}

                  {safeChangeGiven > 0 && (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6b7280', marginBottom: 3 }}>
                        <span>Change Returned</span>
                        <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>−{formatCurrency(safeChangeGiven)}</span>
                      </div>
                      {cashAmount > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#4b5563', marginBottom: 3 }}>
                          <span>Net Cash</span>
                          <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(Math.max(0, cashAmount - safeChangeGiven))}</span>
                        </div>
                      )}
                    </>
                  )}

                  <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 6, paddingTop: 6, display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 800, color: 'var(--invoice-primary, #1F3A2E)' }}>
                    <span>Total Paid</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(totalPaidAmount)}</span>
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#4b5563', marginBottom: 3 }}>
                    <span>Payment Mode:</span>
                    <span style={{ fontWeight: 600 }}>{formatPaymentMode(paymentMode)}</span>
                  </div>
                  <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 6, paddingTop: 6, display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 800, color: 'var(--invoice-primary, #1F3A2E)' }}>
                    <span>Total Paid</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(safeTotal)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── FOOTER ───────────────────────────────────────────────── */}
      <div
        className="invoice-footer mt-auto"
        style={{
          marginTop: 'auto',
          paddingTop: 16,
          paddingBottom: 4,
          borderTop: '1px dashed #d0d0d0',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--invoice-primary, #1F3A2E)', letterSpacing: 0.5 }}>
          Thank you for shopping at VASTHRAALAYAM BOUTIQUE!
        </div>
        <div style={{ fontSize: 10, color: '#666', marginTop: 3, fontWeight: 500 }}>
          Follow us on Instagram: @{BRAND_INSTAGRAM}
        </div>
      </div>
    </div>
  )
}
