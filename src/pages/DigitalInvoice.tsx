import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { neonApi } from '../lib/neonApi'
import { Invoice } from '../components/Invoice'
import { Printer, ArrowLeft, MessageCircle, AlertCircle, X, ExternalLink } from 'lucide-react'
import { printThermalReceipt } from '../lib/thermalPrint'
import { invoicePdfFile, invoicePdfFileFromElement } from '../lib/invoicePdf'
import { uploadInvoicePdf } from '../lib/storage'
import { normalizeStructuredOrderItem, toNumber, computeOrderTotal, roundTo } from '../lib/retail'
import { buildProfessionalWhatsAppMessage } from '../lib/whatsappMessage'
import { toWhatsAppUrl } from '../lib/phone'
import { applyInvoiceTheme } from '../lib/invoiceTheme'
import { BRAND_EN } from '../lib/brand'


export default function DigitalInvoice() {
  const { id } = useParams()
  const navigate = useNavigate()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [invoice, setInvoice] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const invoiceElementRef = useRef<HTMLDivElement>(null)

  const handleBack = () => {
    const currentPath = window.location.pathname
    const hasInternalHistory =
      (window.history.state && typeof window.history.state.idx === 'number' && window.history.state.idx > 0) ||
      (Boolean(document.referrer) && document.referrer.startsWith(window.location.origin))

    if (hasInternalHistory && window.history.length > 1) {
      navigate(-1)
      // Fallback in case navigate(-1) had no effect
      setTimeout(() => {
        if (window.location.pathname === currentPath) {
          navigate('/dashboard')
        }
      }, 200)
    } else {
      navigate('/dashboard')
    }
  }

  useEffect(() => {
    async function loadInvoice() {
      try {
        const rawId = decodeURIComponent(id || '').trim()
        if (!rawId) {
          throw new Error('Invoice not found')
        }

        const { data, error: apiErr } = await neonApi.get<Record<string, unknown>>(
          `/orders/public/${encodeURIComponent(rawId)}`
        )
        if (apiErr || !data) {
          throw apiErr || new Error('Invoice not found')
        }

        setInvoice(data)
        applyInvoiceTheme((data as Record<string, unknown>)?.invoice_primary_color as string)
      } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.message)
        } else {
          setError('Invoice not found')
        }
      } finally {
        setLoading(false)
      }
    }
    if (id) loadInvoice()
  }, [id])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f9faf6] flex items-center justify-center">
        <span className="w-8 h-8 border-4 border-sand border-t-sageDark rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen bg-[#f9faf6] flex flex-col items-center justify-center text-center p-6">
        <h1 className="text-2xl font-bold text-sageDark mb-2">Invoice Not Found</h1>
        <p className="text-gray-500 mb-6">The requested invoice could not be found.</p>
        <button
          onClick={handleBack}
          className="inline-flex items-center gap-2 px-6 py-2 bg-sage text-white rounded-full font-bold hover:bg-sageDark transition cursor-pointer"
        >
          <ArrowLeft size={16} /> Back
        </button>
      </div>
    )
  }

  const invoiceItems = (Array.isArray(invoice.items) ? invoice.items : [])
    .map((item: Record<string, unknown>) => normalizeStructuredOrderItem(item))
  const itemsSubtotal = invoiceItems.reduce((sum: number, item: ReturnType<typeof normalizeStructuredOrderItem>) => sum + item.line_total, 0)
  const subtotal = roundTo(toNumber(invoice.subtotal, itemsSubtotal), 2)
  const deliveryCharge = toNumber(invoice.delivery_charge ?? invoice.shipping, 0)
  const discountAmount = toNumber(invoice.discount_amount, 0)
  const manualDiscountAmount = toNumber(invoice.manual_discount_amount, 0)
  const totalGst = toNumber(invoice.total_gst ?? invoice.gst_amount, 0)
  const orderTotal = computeOrderTotal({
    total: invoice.total ?? invoice.total_amount ?? invoice.grand_total,
    subtotal,
    delivery_charge: deliveryCharge,
    total_gst: totalGst,
    discount_amount: discountAmount,
    manual_discount_amount: manualDiscountAmount,
  })

  const [pdfToast, setPdfToast] = useState<{ message: string; type: 'error' | 'success' } | null>(null)
  const [fallbackPdfUrl, setFallbackPdfUrl] = useState<string | null>(null)

  const downloadPdf = async () => {
    if (!invoiceElementRef.current || downloadingPdf) return

    setDownloadingPdf(true)
    setPdfToast(null)
    setFallbackPdfUrl(null)

    const isMobile =
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

    try {
      const file = await invoicePdfFileFromElement(invoiceElementRef.current, invoice.invoice_no)
      const url = URL.createObjectURL(file)

      // Path A: iOS / Android with Web Share file support
      if (isMobile && typeof navigator.share === 'function') {
        const canShare = typeof navigator.canShare === 'function' ? navigator.canShare({ files: [file] }) : true
        if (canShare) {
          try {
            await navigator.share({
              files: [file],
              title: `Invoice #${invoice.invoice_no}`,
              text: `Invoice #${invoice.invoice_no} from ${BRAND_EN}`,
            })
            setDownloadingPdf(false)
            setTimeout(() => URL.revokeObjectURL(url), 60000)
            return
          } catch (shareErr: unknown) {
            if (shareErr instanceof Error && shareErr.name === 'AbortError') {
              // User dismissed the native share sheet
              setDownloadingPdf(false)
              setTimeout(() => URL.revokeObjectURL(url), 60000)
              return
            }
            console.warn('Web Share failed, attempting mobile fallback URL:', shareErr)
          }
        }
      }

      // Path B: Mobile fallback (open blob URL directly and provide visible tap-to-open link)
      if (isMobile) {
        setFallbackPdfUrl(url)
        window.location.href = url
      } else {
        // Path C: Desktop — trigger instant standard download
        const link = document.createElement('a')
        link.href = url
        link.download = file.name
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      }

      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (err) {
      console.error('Failed to download invoice PDF:', err)
      setPdfToast({ message: 'Unable to generate PDF invoice. Please try again.', type: 'error' })
    } finally {
      setDownloadingPdf(false)
    }
  }


  const shareViaWhatsApp = () => {
    // Synchronously prepare message to guarantee execution within user click gesture
    const items = invoiceItems.map((item: ReturnType<typeof normalizeStructuredOrderItem>) => ({
      name: item.name,
      qty: item.quantity,
      unit: item.unit,
      unitType: item.unit_type,
      rate: item.base_price,
      lineTotal: item.line_total,
    }))
    const message = buildProfessionalWhatsAppMessage({
      customerName: invoice.customer_name,
      phone: invoice.phone,
      invoiceNumber: invoice.invoice_no,
      invoiceDate: invoice.created_at,
      items,
      subtotal,
      couponDiscount: discountAmount,
      manualDiscountAmount,
      shipping: deliveryCharge,
      gstAmount: totalGst,
      total: orderTotal,
      paymentMode: invoice.payment_mode || invoice.payment_method,
      payments: invoice.payments,
    })

    const invoiceUrl = window.location.href
    const pdfUrl = invoice.pdf_url || invoice.invoice_pdf_url
    const linkSection = pdfUrl
      ? `\n\n📄 View Invoice: ${invoiceUrl}\n📥 Download PDF: ${pdfUrl}`
      : `\n\n📄 View Invoice: ${invoiceUrl}`

    const whatsappMessage = `${message}${linkSection}`
    const waUrl = toWhatsAppUrl(invoice.phone, whatsappMessage)

    // Open WhatsApp synchronously in user click gesture to avoid iOS Safari popup blocking
    const isMobile =
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

    if (isMobile) {
      window.location.href = waUrl
    } else {
      window.open(waUrl, '_blank', 'noopener,noreferrer')
    }

    // Proactively upload invoice PDF in background if needed
    if (!pdfUrl && invoiceElementRef.current) {
      void (async () => {
        try {
          const file = await invoicePdfFileFromElement(invoiceElementRef.current!, invoice.invoice_no)
          await uploadInvoicePdf(file, invoice.invoice_no)
        } catch { /* best-effort background upload */ }
      })()
    }
  }

  const printReceipt = () => {
    printThermalReceipt({
      invoiceNo: invoice.invoice_no,
      date: invoice.created_at,
      customerName: invoice.customer_name,
      phone: invoice.phone,
      items: (invoice.items || []).map((item: Record<string, unknown>) => ({
        name: String(item.name || item.product_name || 'Item'),
        qty: Number(item.qty || item.quantity || 1),
        unit: String(item.unit || ''),
        price: Number(item.price || item.base_price || 0),
        line_total: Number(item.line_total || 0),
      })),
      subtotal,
      shipping: deliveryCharge,
      deliveryCharge,
      couponDiscount: discountAmount,
      manualDiscount: manualDiscountAmount,
      couponCode: invoice.coupon_code,
      totalGst,
      gstRate: invoice.gst_rate,
      total: orderTotal,
      paymentMode: invoice.payment_mode || invoice.payment_method,
      payments: invoice.payments,
      changeGiven: toNumber(invoice.change_given, 0),
      depositAmount: invoice.deposit_amount,
      remainingBalance: invoice.remaining_balance,
      advancePaid: invoice.advance_paid,
      balancePaid: invoice.balance_paid,
      balanceDue: invoice.balance_due,
    })
  }

  return (
    <div className="digital-invoice-page bg-[#f9faf6] font-sans print:bg-white print:overflow-visible print:m-0 print:p-0">
      {/* Top action bar — uses position fixed so it always works on iOS regardless of scroll context */}
      <div className="bg-[#f9faf6]/95 backdrop-blur-sm p-4 fixed top-0 left-0 right-0 z-50 print:hidden flex items-center justify-between safe-area-inset-top" style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
        <button onClick={handleBack} className="flex items-center gap-2 text-brand-black hover:text-[var(--invoice-primary,#1F3A2E)] font-semibold text-sm transition-colors bg-white border border-[#ead7b7] px-4 py-2 rounded-full shadow-sm cursor-pointer active:scale-95">
          <ArrowLeft size={16} /> Back
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={downloadPdf}
            disabled={downloadingPdf}
            className="flex items-center gap-2 bg-brand-black text-brand-onDark border border-[var(--invoice-primary,#1F3A2E)] px-4 py-2 rounded-full font-bold text-sm shadow-md hover:bg-[#1e2817] transition-colors cursor-pointer active:scale-95 disabled:opacity-70"
          >
            <Printer size={16} /> {downloadingPdf ? 'Generating...' : <><span className="hidden sm:inline">PDF Invoice</span><span className="sm:hidden">PDF</span></>}
          </button>
          <button
            onClick={shareViaWhatsApp}
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-full font-bold text-sm shadow-md hover:bg-emerald-700 transition-colors cursor-pointer active:scale-95"
          >
            <MessageCircle size={16} /> WhatsApp
          </button>
        </div>
      </div>

      {/* Notification Toast or Mobile PDF fallback link */}
      {pdfToast && (
        <div className="fixed top-16 left-4 right-4 max-w-md mx-auto z-50 p-3 rounded-xl bg-red-600 text-white font-bold text-xs shadow-lg flex items-center justify-between animate-in fade-in slide-in-from-top duration-200">
          <div className="flex items-center gap-2">
            <AlertCircle size={15} className="shrink-0" />
            <span>{pdfToast.message}</span>
          </div>
          <button onClick={() => setPdfToast(null)} className="p-1 hover:bg-white/20 rounded-lg cursor-pointer">
            <X size={14} />
          </button>
        </div>
      )}

      {fallbackPdfUrl && (
        <div className="fixed top-16 left-4 right-4 max-w-md mx-auto z-50 p-3 rounded-xl bg-brand-black text-white font-bold text-xs shadow-lg flex items-center justify-between border border-[#7daa8f] animate-in fade-in slide-in-from-top duration-200">
          <a
            href={fallbackPdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-white hover:text-[#7daa8f] underline"
          >
            <ExternalLink size={15} className="text-[#7daa8f] shrink-0" />
            <span>Tap here to open the PDF</span>
          </a>
          <button onClick={() => setFallbackPdfUrl(null)} className="p-1 hover:bg-white/20 rounded-lg cursor-pointer">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Spacer to push content below fixed bar */}
      <div className="h-16 print:hidden" style={{ height: 'max(64px, calc(64px + env(safe-area-inset-top)))' }} />


      <div className="max-w-3xl mx-auto pb-12 print:mt-0 print:mb-0 print:p-0 print:max-w-full px-2 sm:px-0">
        <div ref={invoiceElementRef} className="bg-white shadow-xl rounded-2xl print:shadow-none print:rounded-none border border-sand/20 print:border-none print:m-0 print:p-0">
          <Invoice
            invoiceNo={invoice.invoice_no}
            date={invoice.created_at}
            customerName={invoice.customer_name}
            phone={invoice.phone}
            address={invoice.address}
            items={invoice.items || []}
            subtotal={subtotal}
            shipping={deliveryCharge}
            deliveryCharge={deliveryCharge}
            discountAmount={discountAmount}
            manualDiscountAmount={manualDiscountAmount}
            manualDiscountType={invoice.manual_discount_type}
            manualDiscountValue={invoice.manual_discount_value}
            gstAmount={totalGst}
            totalGst={totalGst}
            gstRate={invoice.gst_rate}
            couponCode={invoice.coupon_code}
            couponPercentage={invoice.coupon_percentage}
            roundOff={invoice.round_off}
            total={orderTotal}
            status={invoice.status}
            paymentMode={invoice.payment_mode || invoice.payment_method}
            payments={invoice.payments}
            changeGiven={toNumber(invoice.change_given, 0)}
            depositAmount={invoice.deposit_amount}
            remainingBalance={invoice.remaining_balance}
            advancePaid={invoice.advance_paid}
            balancePaid={invoice.balance_paid}
            balanceDue={invoice.balance_due}
          />
        </div>
      </div>
    </div>
  )
}
