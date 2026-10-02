import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { neonApi } from '../lib/neonApi'
import { Invoice } from '../components/Invoice'
import { Printer, ArrowLeft, MessageCircle } from 'lucide-react'
import { printThermalReceipt } from '../lib/thermalPrint'
import { invoicePdfFile, invoicePdfFileFromElement } from '../lib/invoicePdf'
import { uploadInvoicePdf } from '../lib/storage'
import { normalizeStructuredOrderItem, toNumber, computeOrderTotal, roundTo } from '../lib/retail'
import { buildProfessionalWhatsAppMessage } from '../lib/whatsappMessage'
import { toWhatsAppUrl } from '../lib/phone'
import { applyInvoiceTheme } from '../lib/invoiceTheme'

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

  const downloadPdf = async () => {
    if (!invoiceElementRef.current || downloadingPdf) return

    // iOS detection: Safari on iOS requires window.open to be called synchronously inside user gesture
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

    let pdfWindow: Window | null = null
    if (isIOS) {
      pdfWindow = window.open('about:blank', '_blank')
      if (pdfWindow) {
        try {
          pdfWindow.document.title = `Invoice #${invoice.invoice_no}`
          pdfWindow.document.body.innerHTML = `
            <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#FBFAF6;color:#111;">
              <div style="text-align:center;padding:20px;">
                <div style="width:36px;height:36px;border:3px solid #ead7b7;border-top-color:var(--brand-black);border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 16px auto;"></div>
                <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
                <h3 style="margin:0 0 6px 0;font-size:17px;font-weight:700;">Generating PDF Invoice...</h3>
                <p style="margin:0;font-size:13px;color:#666;">Please wait a moment</p>
              </div>
            </div>
          `
        } catch { /* ignore cross-origin */ }
      }
    }

    setDownloadingPdf(true)
    try {
      const file = await invoicePdfFileFromElement(invoiceElementRef.current, invoice.invoice_no)
      const url = URL.createObjectURL(file)

      if (isIOS) {
        if (pdfWindow && !pdfWindow.closed) {
          pdfWindow.location.href = url
        } else {
          window.location.href = url
        }
      } else {
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
      if (pdfWindow && !pdfWindow.closed) {
        pdfWindow.close()
      }
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
        name: item.name || item.product_name,
        qty: item.qty || item.quantity,
        unit: item.unit,
        price: item.price || item.base_price || 0,
        line_total: item.line_total
      })),
      subtotal,
      shipping: deliveryCharge,
      couponDiscount: discountAmount,
      totalGst,
      total: orderTotal,
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
            gstAmount={totalGst}
            couponCode={invoice.coupon_code}
            total={orderTotal}
            status={invoice.status}
            paymentMode={invoice.payment_mode || invoice.payment_method}
            payments={invoice.payments}
            changeGiven={toNumber(invoice.change_given, 0)}
          />
        </div>
      </div>
    </div>
  )
}
