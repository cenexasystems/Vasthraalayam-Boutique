import React from 'react'
import { BRAND_ADDRESS, BRAND_EN, BRAND_INSTAGRAM, BRAND_PRIMARY_PHONE_DISPLAY, BRAND_ICON } from '../lib/brand'
import { formatCurrency, formatQuantityDisplay, normalizeStructuredOrderItem, formatInvoiceNo, toNumber } from '../lib/retail'
import { computeInvoiceBreakdown, formatPaymentModeName } from '../lib/invoiceBreakdown'

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
  manualDiscountType?: string
  manualDiscountValue?: number
  gstAmount?: number
  totalGst?: number
  gstRate?: number
  couponCode?: string
  couponPercentage?: number
  roundOff?: number
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
  manualDiscountType,
  manualDiscountValue,
  gstAmount = 0,
  totalGst,
  gstRate,
  couponCode,
  couponPercentage,
  roundOff,
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
  const safeChangeGiven = toNumber(changeGiven, 0)

  const breakdown = computeInvoiceBreakdown({
    subtotal,
    total,
    items: items as unknown as Array<Record<string, unknown>>,
    discountAmount,
    manualDiscountAmount,
    manualDiscountType,
    manualDiscountValue,
    couponCode,
    couponPercentage,
    totalGst: totalGst ?? gstAmount,
    gstRate,
    deliveryCharge,
    shipping,
    roundOff,
    paymentMode,
    payments,
    depositAmount,
    remainingBalance,
    advancePaid,
    balancePaid,
    balanceDue,
  })

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
          <div style={{ minWidth: 260, width: '100%', maxWidth: 320 }}>
            {breakdown.rows.map(row => {
              if (row.type === 'total') {
                return (
                  <div
                    key={row.key}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      borderTop: '2px solid var(--invoice-primary, #1F3A2E)',
                      paddingTop: 10,
                      marginTop: 6,
                    }}
                  >
                    <span style={{ fontSize: 15, fontWeight: 900, color: 'var(--invoice-primary, #1F3A2E)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      TOTAL
                    </span>
                    <span style={{ fontSize: 20, fontWeight: 900, color: 'var(--invoice-primary, #1F3A2E)', fontVariantNumeric: 'tabular-nums' }}>
                      {formatCurrency(row.amount)}
                    </span>
                  </div>
                )
              }

              const isDiscount = row.type === 'discount' || row.type === 'coupon'
              const color = isDiscount ? 'var(--invoice-primary, #1F3A2E)' : '#555'
              const valColor = isDiscount ? 'var(--invoice-primary, #1F3A2E)' : '#111'
              const sign = row.prefix ? `${row.prefix}` : ''

              return (
                <div key={row.key} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color, fontWeight: row.type === 'taxable' ? 600 : 500 }}>
                    {row.label}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: valColor, fontVariantNumeric: 'tabular-nums' }}>
                    {sign}{formatCurrency(row.amount)}
                  </span>
                </div>
              )
            })}

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

              {breakdown.isDepositInvoice ? (
                <div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {breakdown.paymentDisplay.advancePayments.length > 0 ? (
                      breakdown.paymentDisplay.advancePayments.map((p, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#4b5563' }}>
                          <span>{p.label}</span>
                          <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(p.amount)}</span>
                        </div>
                      ))
                    ) : (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#4b5563' }}>
                        <span>Advance Paid</span>
                        <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(breakdown.advancePaid)}</span>
                      </div>
                    )}

                    {breakdown.paymentDisplay.balancePayments.length > 0 ? (
                      breakdown.paymentDisplay.balancePayments.map((p, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#4b5563' }}>
                          <span>{p.label}</span>
                          <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(p.amount)}</span>
                        </div>
                      ))
                    ) : breakdown.balancePaid > 0 ? (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#4b5563' }}>
                        <span>Balance Paid</span>
                        <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(breakdown.balancePaid)}</span>
                      </div>
                    ) : null}

                    {breakdown.balanceDue > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--invoice-primary, #1F3A2E)', fontWeight: 700 }}>
                        <span>Balance Due</span>
                        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(breakdown.balanceDue)}</span>
                      </div>
                    )}

                    <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 4, paddingTop: 6, display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 800, color: 'var(--invoice-primary, #1F3A2E)' }}>
                      <span>Total Paid</span>
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(breakdown.paymentDisplay.totalPaid)}</span>
                    </div>
                  </div>
                </div>
              ) : breakdown.paymentDisplay.isSplit ? (
                <div>
                  <div style={{ fontSize: 11, color: '#4b5563', fontWeight: 600, marginBottom: 4 }}>Payment:</div>
                  <div style={{ paddingLeft: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {breakdown.paymentDisplay.splitPayments.map((p, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#4b5563' }}>
                        <span>{p.label}:</span>
                        <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(p.amount)}</span>
                      </div>
                    ))}
                  </div>

                  {safeChangeGiven > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                      <span>Change Returned</span>
                      <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>−{formatCurrency(safeChangeGiven)}</span>
                    </div>
                  )}

                  <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 6, paddingTop: 6, display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 800, color: 'var(--invoice-primary, #1F3A2E)' }}>
                    <span>Total Paid</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(breakdown.paymentDisplay.totalPaid)}</span>
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#4b5563', marginBottom: 3 }}>
                    <span>Payment:</span>
                    <span style={{ fontWeight: 600 }}>{breakdown.paymentDisplay.singleModeLabel}</span>
                  </div>
                  {safeChangeGiven > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6b7280', marginBottom: 3 }}>
                      <span>Change Returned</span>
                      <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>−{formatCurrency(safeChangeGiven)}</span>
                    </div>
                  )}
                  <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 6, paddingTop: 6, display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 800, color: 'var(--invoice-primary, #1F3A2E)' }}>
                    <span>Total Paid</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(breakdown.total)}</span>
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
