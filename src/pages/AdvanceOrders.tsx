import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, CheckCircle2, Clock3, Download, Eye, FileText, MessageCircle, PackageCheck, Plus, Printer, RefreshCw, Search, X, Trash2 } from 'lucide-react'
import { neonApi } from '../lib/neonApi'
import { formatCurrency } from '../lib/retail'
import { invoicePdfFile } from '../lib/invoicePdf'
import { printThermalReceipt } from '../lib/thermalPrint'
import { buildAdvanceDepositWhatsAppMessage, buildProfessionalWhatsAppMessage, publicInvoiceUrl } from '../lib/whatsappMessage'
import { toWhatsAppUrl } from '../lib/phone'
import { advanceReceiptPdf, downloadFile, printAdvanceReceipt } from '../lib/advanceReceipt'
import { useAdminAuthStore, useProductStore } from '../store/store'
import {
  addAdvanceEvent, completeAdvanceOrder, createAdvanceOrder, getAdvanceOrderHistory, listAdvanceOrders, updateAdvanceStatus, deleteAdvanceOrder,
  type AdvanceOrder, type AdvancePayment, type AdvancePaymentMethod, type AdvanceStatus, type AdvanceTimeline,
} from '../services/advanceOrderService'
import { HardDeleteModal, type ImpactDetail } from '../components/common/HardDeleteModal'
import { SplitPaymentSelector } from '../components/SplitPaymentSelector'
import { type PaymentMode, type SplitPaymentValidationResult } from '../lib/splitPaymentUtils'
import { useScrollLock } from '../lib/scrollLock'

// Custom Malaysian Ringgit icon
const RMIcon = ({ size = 20, className = '' }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-label="Malaysian Ringgit">
    <rect x="2" y="2" width="20" height="20" rx="4" />
    <text x="12" y="16" textAnchor="middle" fontSize="9" fontWeight="bold" stroke="none" fill="currentColor" fontFamily="Arial, sans-serif">₹</text>
  </svg>
)

type DateFilter = 'all' | 'today' | 'week' | 'month' | 'year' | 'custom'
type StatusFilter = 'all' | 'pending' | 'ready' | 'completed' | 'cancelled'

const STATUS_LABELS: Record<AdvanceStatus, string> = {
  pending_deposit: 'Pending Deposit', ready_for_delivery: 'Ready for Delivery', waiting_final_payment: 'Waiting for Final Payment', completed: 'Completed', cancelled: 'Cancelled',
}
const STATUS_STYLES: Record<AdvanceStatus, string> = {
  pending_deposit: 'bg-amber-50 text-amber-700 border-amber-200', ready_for_delivery: 'bg-blue-50 text-blue-700 border-blue-200',
  waiting_final_payment: 'bg-violet-50 text-violet-700 border-violet-200', completed: 'bg-emerald-50 text-emerald-700 border-emerald-200', cancelled: 'bg-red-50 text-red-700 border-red-200',
}
const initialForm = { customerName: '', phone: '', address: '', productName: '', category: '', description: '', totalAmount: '', depositAmount: '', expectedDeliveryDate: '', status: 'pending_deposit' as AdvanceStatus, remarks: '', reference_number: '', paymentMethod: 'cash' as AdvancePaymentMethod }
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

/** Safe delivery date formatter — returns "Not set" for null/empty/invalid dates */
function safeDeliveryDate(value: string | null | undefined): string {
  if (!value || String(value).trim() === '') return 'Not set'
  // expected_delivery_date is stored as DATE (YYYY-MM-DD) or ISO string
  const dateStr = String(value).includes('T') ? value : `${value}T00:00:00`
  const d = new Date(dateStr as string)
  if (isNaN(d.getTime())) return 'Not set'
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

type AdvanceOrdersProps = {
  onOrderCompleted?: (order?: AdvanceOrder) => void
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-[#6B7280]">{label}</span>{children}</label> }
const inputClass = 'w-full rounded-xl border border-[#E5E7EB] bg-white px-3.5 py-2.5 text-sm text-[#273126] outline-none transition focus:border-[#7e22ce] focus:ring-2 focus:ring-violet-100'

export default function AdvanceOrders({ onOrderCompleted }: AdvanceOrdersProps = {}) {
  const role = useAdminAuthStore(state => state.role)
  const products = useProductStore(state => state.products)
  const [orders, setOrders] = useState<AdvanceOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState(initialForm)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [selected, setSelected] = useState<AdvanceOrder | null>(null)
  const [timeline, setTimeline] = useState<AdvanceTimeline[]>([])
  const [payments, setPayments] = useState<AdvancePayment[]>([])
  const [paymentOrder, setPaymentOrder] = useState<AdvanceOrder | null>(null)
  const [paymentForm, setPaymentForm] = useState({ method: 'cash' as AdvancePaymentMethod, remarks: '' })
  const [balanceMethod, setBalanceMethod] = useState<PaymentMode>('cash')
  const [balanceValidation, setBalanceValidation] = useState<SplitPaymentValidationResult>({
    isValid: true, totalPaid: 0, remaining: 0, changeGiven: 0, maxQrAllowed: 0, maxCardAllowed: 0, activePayments: []
  })
  const [depositMethod, setDepositMethod] = useState<PaymentMode>('cash')
  const [depositValidation, setDepositValidation] = useState<SplitPaymentValidationResult>({
    isValid: false, totalPaid: 0, remaining: 0, changeGiven: 0, maxQrAllowed: 0, maxCardAllowed: 0, activePayments: []
  })
  const [deleteModalConfig, setDeleteModalConfig] = useState<{
    isOpen: boolean
    title: string
    subtitle?: string
    entityType: 'advance_order'
    impactDetails: ImpactDetail[]
    requireTypeDelete: boolean
    warningText?: string
    onConfirm: () => Promise<{ backupId?: string | number } | void>
  } | null>(null)

  useScrollLock(Boolean(createOpen || paymentOrder || selected || deleteModalConfig?.isOpen))


  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setOrders(await listAdvanceOrders()) } catch (err) { setError(err instanceof Error ? err.message : 'Unable to load advance orders') } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const handleDeleteOrder = async (orderId: string, orderName: string) => {
    if (role === 'staff') {
      alert('Deleting an advance order requires an admin account.')
      return
    }

    const targetOrder = orders.find(o => o.id === orderId)
    const impactDetails: ImpactDetail[] = [
      { label: 'Deposit Ref', value: targetOrder?.deposit_id || orderId },
      { label: 'Customer', value: targetOrder?.customer_name || 'Customer' },
      { label: 'Deposit Paid', value: formatCurrency(targetOrder?.deposit_amount ?? 0), color: 'warning' },
      { label: 'Total Value', value: formatCurrency(targetOrder?.total_amount ?? 0), color: 'danger' },
      {
        label: 'Linked Completed Bill',
        value: targetOrder?.completed_order_id ? 'Final bill will also be permanently deleted' : 'None (No bill created)',
        color: targetOrder?.completed_order_id ? 'danger' : 'neutral',
      },
      { label: 'Payments & Timeline', value: 'All advance payments and timeline events purged' },
    ]

    setDeleteModalConfig({
      isOpen: true,
      title: `Permanently Delete Advance Order "${orderName}"`,
      subtitle: `Deposit Ref: ${targetOrder?.deposit_id || ''} • Customer: ${targetOrder?.customer_name || ''}`,
      entityType: 'advance_order',
      impactDetails,
      requireTypeDelete: true,
      warningText: 'This advance order, all recorded advance/balance payments, timeline logs, and any completed invoice created from it will be permanently deleted from Neon.',
      onConfirm: async () => {
        await deleteAdvanceOrder(orderId)
        setOrders(prev => prev.filter(o => o.id !== orderId))
        setNotice('Advance order permanently deleted')
        setTimeout(() => setNotice(''), 3000)
        await load()
      },
    })
  }


  // Close modals or drawer on Escape key
  useEffect(() => {
    if (!selected && !createOpen && !paymentOrder) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selected) setSelected(null)
        else if (paymentOrder) setPaymentOrder(null)
        else if (createOpen) setCreateOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selected, createOpen, paymentOrder])

  // Prevent background scroll when modal or drawer is open
  useScrollLock(Boolean(selected || createOpen || paymentOrder))

  const openDetails = async (order: AdvanceOrder) => {
    setSelected(order); setTimeline([]); setPayments([])
    try { const history = await getAdvanceOrderHistory(order.id); setTimeline(history.timeline); setPayments(history.payments) } catch (err) { setError(err instanceof Error ? err.message : 'Unable to load order details') }
  }

  const validOrders = useMemo(() => orders.filter(o => o.id && o.deposit_id && Number(o.total_amount) > 0), [orders])

  const analytics = useMemo(() => {
    const pendingDepositOrders = validOrders.filter(o => o.status === 'pending_deposit' || o.status === 'waiting_final_payment')
    const pendingDepositAmount = pendingDepositOrders.reduce((sum, o) => sum + (Number(o.deposit_amount) || 0), 0)
    const pendingBillsCount = pendingDepositOrders.length

    const balanceDueOrders = validOrders.filter(o => !['completed', 'cancelled'].includes(o.status) && (Number(o.remaining_balance) || 0) > 0)
    const neededToReceive = balanceDueOrders.reduce((sum, o) => sum + (Number(o.remaining_balance) || 0), 0)
    const neededBillsCount = balanceDueOrders.length

    const nonCancelledOrders = validOrders.filter(o => o.status !== 'cancelled')
    const totalValue = nonCancelledOrders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0)
    const totalOrdersCount = nonCancelledOrders.length

    const readyCount = validOrders.filter(o => o.status === 'ready_for_delivery').length
    const pendingCount = pendingDepositOrders.length

    return {
      pendingDepositAmount,
      pendingBillsCount,
      neededToReceive,
      neededBillsCount,
      totalValue,
      totalOrdersCount,
      readyCount,
      pendingCount,
    }
  }, [validOrders])

  const filtered = useMemo(() => validOrders.filter(order => {
    const query = search.trim().toLowerCase()
    const searchable = [order.deposit_id, order.customer_name, order.phone, order.product_name, STATUS_LABELS[order.status]].join(' ').toLowerCase()
    if (query && !searchable.includes(query)) return false
    if (statusFilter === 'pending' && !['pending_deposit', 'waiting_final_payment'].includes(order.status)) return false
    if (statusFilter === 'ready' && order.status !== 'ready_for_delivery') return false
    if (statusFilter === 'completed' && order.status !== 'completed') return false
    if (statusFilter === 'cancelled' && order.status !== 'cancelled') return false
    if (dateFilter !== 'all') {
      const created = new Date(order.created_at)
      const now = new Date()
      if (dateFilter === 'today' && dateKey(created) !== dateKey(now)) return false
      if (dateFilter === 'week') {
        // Calendar week: Monday 00:00:00 of the current week
        const dayOfWeek = now.getDay() // 0=Sun, 1=Mon...6=Sat
        const offsetToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
        const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetToMonday, 0, 0, 0, 0)
        if (created < weekStart) return false
      }
      if (dateFilter === 'month' && (created.getMonth() !== now.getMonth() || created.getFullYear() !== now.getFullYear())) return false
      if (dateFilter === 'year' && created.getFullYear() !== now.getFullYear()) return false
      if (dateFilter === 'custom') {
        if (customFrom) {
          const fromD = new Date(`${customFrom}T00:00:00`)
          if (created < fromD) return false
        }
        if (customTo) {
          const toD = new Date(`${customTo}T23:59:59`)
          if (created > toD) return false
        }
      }
    }
    return true
  }), [validOrders, search, statusFilter, dateFilter, customFrom, customTo])

  const create = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError(''); setNotice('')
    const total = Number(form.totalAmount)
    if (!Number.isFinite(total) || total <= 0) {
      setError('Total order amount must be greater than zero.')
      setSaving(false)
      return
    }
    if (!depositValidation.isValid) {
      setError(depositValidation.errorMessage || 'Enter a valid advance deposit amount.')
      setSaving(false)
      return
    }

    const deposit = depositValidation.totalPaid
    try {
      const effectiveMode: AdvancePaymentMethod = depositMethod === 'split'
        ? (depositValidation.activePayments.length > 1 ? 'split' : (depositValidation.activePayments[0]?.mode as AdvancePaymentMethod || 'cash'))
        : (depositMethod as AdvancePaymentMethod)

      const created = await createAdvanceOrder({
        ...form,
        totalAmount: total,
        depositAmount: deposit,
        paymentMethod: effectiveMode,
        payments: depositValidation.activePayments,
        referenceNumber: form.reference_number,
        createdByName: role || 'Staff',
        products: [{ name: form.productName, category: form.category, description: form.description, quantity: 1, base_price: total, line_total: total, unit: 'piece', unit_type: 'unit', source: 'advance_order' }]
      })
      setOrders(current => [created, ...current])
      setForm(initialForm)
      setCreateOpen(false)
      setNotice(`${created.deposit_id} created. Deposit is tracked separately and has not been added to revenue.`)

      // Redirect to WhatsApp with advance deposit receipt
      const advanceMsg = buildAdvanceDepositWhatsAppMessage({
        customerName: created.customer_name,
        depositId: created.deposit_id,
        productName: created.product_name,
        totalAmount: created.total_amount,
        depositAmount: created.deposit_amount,
        remainingBalance: created.remaining_balance,
        expectedDeliveryDate: created.expected_delivery_date,
        paymentMethod: effectiveMode,
      })
      window.open(toWhatsAppUrl(created.phone, advanceMsg), '_blank', 'noopener,noreferrer')
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to create advance order') } finally { setSaving(false) }
  }

  const changeStatus = async (order: AdvanceOrder, status: AdvanceStatus) => {
    if (order.status === 'cancelled') {
      setError('A cancelled order cannot be modified.')
      return
    }
    if (order.status === 'completed' || order.invoice_number || order.completed_order_id) {
      setError('This order is already completed and has an official invoice.')
      return
    }
    if (status === 'completed') { setPaymentOrder(order); return }
    try { const updated = await updateAdvanceStatus(order.id, status); setOrders(rows => rows.map(row => row.id === order.id ? updated : row)); if (selected?.id === order.id) void openDetails(updated) } catch (err) { setError(err instanceof Error ? err.message : 'Unable to update status') }
  }

  const receivePayment = async (event: FormEvent) => {
    event.preventDefault(); if (!paymentOrder) return
    if (!balanceValidation.isValid) {
      setError(balanceValidation.errorMessage || 'Please enter valid balance payment amounts')
      return
    }
    setSaving(true); setError('')
    try {
      const finalAmount = Math.max(0, paymentOrder.remaining_balance)
      const finalRemarks = paymentForm.remarks.trim()

      const effectiveMode: AdvancePaymentMethod = balanceMethod === 'split'
        ? (balanceValidation.activePayments.length > 1 ? 'split' : (balanceValidation.activePayments[0]?.mode as AdvancePaymentMethod || 'cash'))
        : (balanceMethod as AdvancePaymentMethod)

      const result = await completeAdvanceOrder(
        paymentOrder.id, 
        effectiveMode, 
        finalAmount,
        paymentOrder.coupon_code || null,
        paymentOrder.coupon_percentage || 0,
        0,
        finalRemarks,
        balanceValidation.activePayments,
        balanceValidation.changeGiven
      )
      const completed: AdvanceOrder = { 
        ...paymentOrder, 
        status: 'completed', 
        remaining_balance: 0, 
        completed_at: result.completed_at, 
        completed_order_id: result.order_id, 
        invoice_number: result.invoice_no, 
        final_payment_method: effectiveMode 
      }
      setOrders(rows => rows.map(row => row.id === completed.id ? completed : row))
      onOrderCompleted?.(completed)
      setPaymentOrder(null)
      setPaymentForm({ method: 'cash', remarks: '' })
      setNotice(`${result.invoice_no} generated once. The full ${formatCurrency(completed.total_amount)} is now recognized as revenue.`)

      // Redirect to WhatsApp with final invoice URL + Instagram + Feedback form
      whatsappInvoice(completed)
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to complete payment') } finally { setSaving(false) }
  }

  const getOrderBreakdownDetails = (order: AdvanceOrder) => {
    const subtotal = Number(order.subtotal ?? order.total_amount ?? 0)
    const discount = Number(order.discount_amount ?? 0)
    const manualDiscount = Number(order.manual_discount_amount ?? 0)
    const gst = Number(order.gst_amount ?? order.total_gst ?? 0)
    const total = Number(order.total_amount ?? 0)
    let delivery = Number(order.delivery_charge ?? 0)
    if (!delivery && total > 0 && subtotal > 0) {
      const computed = Math.round((total - (subtotal - (discount + manualDiscount) + gst)) * 100) / 100
      if (computed > 0) delivery = computed
    }
    return { subtotal, discount, manualDiscount, gst, total, delivery }
  }

  const productRows = (order: AdvanceOrder) => order.products.length ? order.products : [{ name: order.product_name, quantity: 1, base_price: order.total_amount, line_total: order.total_amount, unit: 'piece', unit_type: 'unit' }]
  const invoiceFile = (order: AdvanceOrder) => {
    const details = getOrderBreakdownDetails(order)
    return invoicePdfFile({
      invoiceNo: order.invoice_number || order.deposit_id,
      date: order.completed_at || new Date().toISOString(),
      customerName: order.customer_name,
      phone: order.phone,
      address: order.address,
      items: productRows(order),
      subtotal: details.subtotal,
      shipping: details.delivery,
      deliveryCharge: details.delivery,
      discountAmount: details.discount,
      manualDiscountAmount: details.manualDiscount,
      couponCode: order.coupon_code,
      couponPercentage: order.coupon_percentage,
      gstAmount: details.gst,
      totalGst: details.gst,
      gstRate: order.gst_rate,
      total: details.total,
      paymentMode: order.final_payment_method || 'Paid',
      payments: order.payments,
      depositAmount: order.deposit_amount,
      remainingBalance: order.remaining_balance,
      advancePaid: order.deposit_amount,
      balancePaid: order.status === 'completed' ? (order.total_amount - order.deposit_amount) : 0,
    })
  }
  const printFinal = (order: AdvanceOrder) => {
    const details = getOrderBreakdownDetails(order)
    return printThermalReceipt({
      invoiceNo: order.invoice_number || order.deposit_id,
      date: order.completed_at || new Date().toISOString(),
      customerName: order.customer_name,
      phone: order.phone,
      items: productRows(order).map(item => ({
        name: String(item.name || 'Product'),
        qty: Number(item.quantity || 1),
        unit: String(item.unit || 'piece'),
        price: Number(item.base_price || 0),
        unit_price: Number(item.unit_price ?? item.base_price ?? 0),
        gst_percent: Number(item.gst_percent || 0),
        gst_rate: Number(item.gst_rate || 0),
        gst_amount: Number(item.gst_amount || 0),
        taxable_amount: Number(item.taxable_amount || 0),
        cgst: Number(item.cgst || 0),
        sgst: Number(item.sgst || 0),
        line_total: Number(item.line_total || 0),
      })),
      subtotal: details.subtotal,
      shipping: details.delivery,
      deliveryCharge: details.delivery,
      discountAmount: details.discount,
      manualDiscountAmount: details.manualDiscount,
      couponCode: order.coupon_code,
      couponPercentage: order.coupon_percentage,
      gstAmount: details.gst,
      totalGst: details.gst,
      gstRate: order.gst_rate,
      total: details.total,
      paymentMode: order.final_payment_method || 'Paid',
      payments: order.payments,
      depositAmount: order.deposit_amount,
      remainingBalance: order.remaining_balance,
      advancePaid: order.deposit_amount,
      balancePaid: order.status === 'completed' ? (order.total_amount - order.deposit_amount) : 0,
    })
  }
  
  const whatsappDepositReceipt = (order: AdvanceOrder) => {
    const message = buildAdvanceDepositWhatsAppMessage({
      customerName: order.customer_name,
      depositId: order.deposit_id,
      productName: order.product_name,
      totalAmount: order.total_amount,
      depositAmount: order.deposit_amount,
      remainingBalance: order.remaining_balance,
      expectedDeliveryDate: order.expected_delivery_date,
    })
    window.open(toWhatsAppUrl(order.phone, message), '_blank', 'noopener,noreferrer')
  }

  const whatsappInvoice = (order: AdvanceOrder) => {
    const invNum = order.invoice_number || order.deposit_id
    const details = getOrderBreakdownDetails(order)
    const message = buildProfessionalWhatsAppMessage({
      customerName: order.customer_name,
      phone: order.phone,
      invoiceNumber: invNum,
      invoiceUrl: publicInvoiceUrl(invNum),
      items: productRows(order).map(item => ({
        name: String(item.name || 'Product'),
        qty: Number(item.quantity || 1),
        unit: String(item.unit || 'piece'),
        unitType: 'unit',
        rate: Number(item.base_price || 0),
        unit_price: Number(item.unit_price ?? item.base_price ?? 0),
        gst_percent: Number(item.gst_percent || 0),
        gst_rate: Number(item.gst_rate || 0),
        gst_amount: Number(item.gst_amount || 0),
        taxable_amount: Number(item.taxable_amount || 0),
        cgst: Number(item.cgst || 0),
        sgst: Number(item.sgst || 0),
        lineTotal: Number(item.line_total || 0),
      })),
      subtotal: details.subtotal,
      shipping: details.delivery,
      deliveryCharge: details.delivery,
      discountAmount: details.discount,
      manualDiscountAmount: details.manualDiscount,
      couponCode: order.coupon_code,
      couponPercentage: order.coupon_percentage,
      gstAmount: details.gst,
      totalGst: details.gst,
      gstRate: order.gst_rate,
      total: details.total,
      paymentMode: order.final_payment_method || 'Paid',
      payments: order.payments,
      depositAmount: order.deposit_amount,
      remainingBalance: order.remaining_balance,
      advancePaid: order.deposit_amount,
      balancePaid: order.status === 'completed' ? (order.total_amount - order.deposit_amount) : 0,
    })
    window.open(toWhatsAppUrl(order.phone, message), '_blank', 'noopener,noreferrer')
  }

  const addEvent = async (order: AdvanceOrder, eventType: string, label: string) => {
    try { await addAdvanceEvent(order.id, eventType, label); await openDetails(order); setNotice(`${label} added to ${order.deposit_id}.`) } catch (err) { setError(err instanceof Error ? err.message : 'Unable to add timeline event') }
  }

  const summaryCards = [
    {
      label: 'PENDING DEPOSIT AMOUNT RECEIVED',
      value: formatCurrency(analytics.pendingDepositAmount),
      subtext: `${analytics.pendingBillsCount} bills with pending deposits`,
      icon: <span className="font-bold text-xs">₹</span>,
      iconStyle: 'text-emerald-700 bg-emerald-50 border border-emerald-200',
    },
    {
      label: 'NEEDED TO RECEIVE (PENDING)',
      value: formatCurrency(analytics.neededToReceive),
      subtext: `${analytics.neededBillsCount} bills with Balance Due`,
      icon: <span className="font-bold text-xs">₹</span>,
      iconStyle: 'text-amber-700 bg-amber-50 border border-amber-200',
    },
    {
      label: 'TOTAL ADVANCE ORDERS VALUE',
      value: formatCurrency(analytics.totalValue),
      subtext: `${analytics.totalOrdersCount} Total Advance Orders`,
      icon: <FileText size={16} />,
      iconStyle: 'text-fuchsia-700 bg-fuchsia-50 border border-fuchsia-200',
    },
    {
      label: 'READY FOR DELIVERY',
      value: String(analytics.readyCount),
      subtext: 'Ready for customer pickup/delivery',
      icon: <PackageCheck size={16} />,
      iconStyle: 'text-blue-700 bg-blue-50 border border-blue-200',
    },
    {
      label: 'PENDING ORDERS',
      value: String(analytics.pendingCount),
      subtext: 'Awaiting balance or confirmation',
      icon: <Clock3 size={16} />,
      iconStyle: 'text-rose-700 bg-rose-50 border border-rose-200',
    },
  ]

  return <div className="space-y-5">
    {/* Page Header matching screenshot 4 */}
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <p className="text-xs font-black uppercase tracking-[.18em] text-emerald-600">Separate from sales</p>
        <h2 className="text-2xl font-black text-[#273126]">Advance Orders</h2>
        <p className="mt-1 text-xs text-[#6B7280]">Deposits are tracked separately. Full order value is recognized once final payment is completed.</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 text-xs font-bold shadow-xs transition cursor-pointer"
        >
          <Plus size={16} />
          <span>New Advance Order</span>
        </button>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-xl border border-gray-200 bg-white p-2.5 text-gray-600 hover:bg-gray-50 transition cursor-pointer"
          title="Refresh"
        >
          <RefreshCw size={16} />
        </button>
      </div>
    </div>

    {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}
    {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{notice}</div>}

    {/* 5 Summary Cards */}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {summaryCards.map((card, i) => (
        <div key={i} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[10px] font-black uppercase tracking-wider text-gray-500 leading-tight">
              {card.label}
            </p>
            <div className={`shrink-0 rounded-lg p-1.5 ${card.iconStyle}`}>
              {card.icon}
            </div>
          </div>
          <div className="mt-2">
            <p className="text-2xl font-black text-gray-900 tracking-tight">
              {card.value}
            </p>
            <p className="mt-1 text-xs text-gray-400 font-medium truncate">
              {card.subtext}
            </p>
          </div>
        </div>
      ))}
    </div>

    {/* Single Filter Card matching screenshot 4 */}
    <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 shadow-xs space-y-4">
      {/* Search and Status Filters */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-3 text-gray-400" size={17} />
          <input
            className="w-full rounded-xl border border-gray-200 bg-white pl-10 pr-4 py-2.5 text-xs font-medium text-gray-800 placeholder-gray-400 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search Deposit ID, customer, phone, product or status"
          />
        </div>
        <div className="flex flex-wrap gap-1.5 shrink-0">
          {(['all', 'pending', 'ready', 'completed', 'cancelled'] as StatusFilter[]).map(val => (
            <button
              key={val}
              type="button"
              onClick={() => setStatusFilter(val)}
              className={`rounded-lg px-3.5 py-2 text-xs font-bold capitalize transition cursor-pointer ${
                statusFilter === val
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {val === 'all' ? 'All' : (val === 'ready' ? 'Ready' : STATUS_LABELS[val as AdvanceStatus] || val)}
            </button>
          ))}
        </div>
      </div>

      {/* Date Filter & Range */}
      <div className="space-y-3 pt-3 border-t border-gray-100">
        <div>
          <p className="text-xs font-bold text-gray-700 mb-2">Filter by Date</p>
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'today', label: 'Today' },
              { key: 'week', label: 'This Week' },
              { key: 'month', label: 'This Month' },
              { key: 'year', label: 'This Year' },
              { key: 'all', label: 'All' },
              { key: 'custom', label: 'Custom' },
            ].map(item => (
              <button
                key={item.key}
                type="button"
                onClick={() => setDateFilter(item.key as DateFilter)}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition cursor-pointer ${
                  dateFilter === item.key
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-transparent'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Date Pickers */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1">
              From Date
            </label>
            <input
              type="date"
              className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs text-gray-800 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
              value={customFrom}
              onChange={e => {
                setCustomFrom(e.target.value)
                setDateFilter('custom')
              }}
            />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1">
              To Date
            </label>
            <input
              type="date"
              className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs text-gray-800 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
              value={customTo}
              onChange={e => {
                setCustomTo(e.target.value)
                setDateFilter('custom')
              }}
            />
          </div>
        </div>
      </div>
    </div>
    <div className="overflow-hidden rounded-2xl border border-[#ECE9E2] bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#F8F7F4] text-[10px] font-black uppercase tracking-wider text-[#737B72]">
            <tr>
              {['Deposit ID / Created','Customer','Product','Total / Deposit / Balance','Delivery','Status','Actions'].map(h => (
                <th key={h} className="px-4 py-3.5 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F0EEE9]">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-[#6B7280]">Loading advance orders...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-[#6B7280]">No advance orders match these filters.</td></tr>
            ) : (
              filtered.map(order => (
                <tr key={order.id} className="hover:bg-violet-50/30 transition-colors">
                  <td className="px-4 py-3.5 align-middle whitespace-nowrap">
                    <p className="font-black text-violet-700">{order.deposit_id}</p>
                    <p className="text-[11px] text-[#8B9389]">
                      {new Date(order.created_at).toLocaleDateString('en-IN')} • {new Date(order.created_at).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}
                    </p>
                  </td>
                  <td className="px-4 py-3.5 align-middle whitespace-nowrap">
                    <p className="font-bold text-[#273126]">{order.customer_name}</p>
                    <p className="text-xs text-[#727970]">{order.phone}</p>
                  </td>
                  <td className="max-w-[180px] px-4 py-3.5 align-middle">
                    <p className="truncate font-semibold text-[#273126]">{order.product_name}</p>
                    <p className="truncate text-xs text-[#858C83]">{order.category || 'Uncategorised'}</p>
                  </td>
                  <td className="px-4 py-3.5 text-xs align-middle whitespace-nowrap">
                    <p className="text-gray-700">Total: <b>{formatCurrency(order.total_amount)}</b></p>
                    <p className="text-violet-700">Paid: <b>{formatCurrency(order.deposit_amount)}</b></p>
                    <p className="text-red-600 font-bold">Balance: <b>{formatCurrency(order.remaining_balance)}</b></p>
                  </td>
                  <td className="px-4 py-3.5 align-middle whitespace-nowrap">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
                      <CalendarDays size={14} className="text-gray-400 shrink-0" />
                      <span>{safeDeliveryDate(order.expected_delivery_date)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 align-middle whitespace-nowrap">
                    <select
                      value={order.status}
                      disabled={order.status === 'completed' || order.status === 'cancelled' || !!order.invoice_number || !!order.completed_order_id}
                      onChange={e => void changeStatus(order, e.target.value as AdvanceStatus)}
                      className={`rounded-xl border px-2.5 py-1.5 text-xs font-black outline-none shadow-xs transition-colors cursor-pointer disabled:opacity-80 disabled:cursor-not-allowed ${STATUS_STYLES[order.status]}`}
                    >
                      <option value="pending_deposit">Pending Deposit</option>
                      <option value="waiting_final_payment">Waiting for Final Payment</option>
                      <option value="completed">Completed (receive payment)</option>
                      <option value="ready_for_delivery">Ready to Collect</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </td>
                  <td className="px-4 py-3.5 align-middle whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      {/* Receive Balance Button (strictly when no invoice exists, not completed, not cancelled, and pending/ready) */}
                      {!order.invoice_number &&
                        !order.completed_order_id &&
                        order.status !== 'completed' &&
                        order.status !== 'cancelled' &&
                        ['pending_deposit', 'waiting_final_payment', 'ready_for_delivery'].includes(order.status) && (
                        <button
                          type="button"
                          onClick={() => setPaymentOrder(order)}
                          className="flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1.5 text-xs font-black shadow-xs transition-all active:scale-95 cursor-pointer whitespace-nowrap"
                          title="Receive Remaining Balance"
                        >
                          <span>Receive Balance</span>
                        </button>
                      )}

                      {/* View Details Icon */}
                      <button
                        type="button"
                        onClick={() => void openDetails(order)}
                        className="w-8 h-8 rounded-lg bg-[#F4F2F6] hover:bg-violet-100 text-violet-700 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                        title="View Details"
                      >
                        <Eye size={15}/>
                      </button>

                      {/* Delete Icon */}
                      <button
                        type="button"
                        onClick={() => handleDeleteOrder(order.id, order.customer_name)}
                        className="w-8 h-8 rounded-lg bg-[#F4F2F6] hover:bg-red-100 text-red-600 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                        title="Delete Order"
                      >
                        <Trash2 size={15}/>
                      </button>

                      {/* Print Receipt / Invoice */}
                      <button
                        type="button"
                        onClick={() => order.status === 'completed' ? printFinal(order) : printAdvanceReceipt(order)}
                        className="w-8 h-8 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                        title={order.status === 'completed' ? "Print Final Receipt" : "Print Advance Receipt"}
                      >
                        <Printer size={15}/>
                      </button>

                      {/* Download PDF Receipt / Invoice */}
                      <button
                        type="button"
                        onClick={() => downloadFile(order.status === 'completed' ? invoiceFile(order) : advanceReceiptPdf(order))}
                        className="w-8 h-8 rounded-lg bg-violet-50 hover:bg-violet-100 text-violet-700 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                        title={order.status === 'completed' ? "Download PDF Invoice" : "Download PDF Receipt"}
                      >
                        <Download size={15}/>
                      </button>

                      {/* WhatsApp Share */}
                      <button
                        type="button"
                        onClick={() => order.status === 'completed' ? whatsappInvoice(order) : whatsappDepositReceipt(order)}
                        className="w-8 h-8 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                        title={order.status === 'completed' ? "Share Final Invoice via WhatsApp" : "Share Advance Receipt via WhatsApp"}
                      >
                        <MessageCircle size={15}/>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>

    {createOpen && createPortal(
      <div
        style={{
          paddingTop: 'max(16px, env(safe-area-inset-top))',
          paddingRight: 'max(16px, env(safe-area-inset-right))',
          paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
          paddingLeft: 'max(16px, env(safe-area-inset-left))',
        }}
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-xs overflow-y-auto overscroll-contain animate-in fade-in duration-150"
      >
        <div className="fixed inset-0" onClick={() => setCreateOpen(false)} />
        <div
          style={{ maxHeight: 'calc(100dvh - 32px)' }}
          className="relative z-10 w-full max-w-4xl rounded-3xl bg-white shadow-2xl border border-[#ead7b7] overflow-hidden flex flex-col my-auto"
        >
          <div className="shrink-0 px-5 py-3.5 sm:px-6 sm:py-4 border-b border-gray-100 flex items-center justify-between bg-[#FBFAF6]">
            <div>
              <h3 className="text-lg sm:text-xl font-black text-brand-black">Create Advance Order</h3>
              <p className="text-xs text-amber-700">Creates an advance receipt only - no revenue or final invoice.</p>
            </div>
            <button type="button" onClick={() => setCreateOpen(false)} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-700 transition cursor-pointer">
              <X size={18} />
            </button>
          </div>
          <form onSubmit={create} className="flex flex-col flex-1 overflow-hidden min-h-0">
            <div className="overflow-y-auto flex-1 p-4 sm:p-6 space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Customer Name *"><input required className={inputClass} value={form.customerName} onChange={e=>setForm({...form,customerName:e.target.value})}/></Field>
                <Field label="Phone Number *"><input required className={inputClass} value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></Field>
                <Field label="Address"><textarea className={inputClass} value={form.address} onChange={e=>setForm({...form,address:e.target.value})}/></Field>
                <Field label="Product Name *"><input required list="advance-products" className={inputClass} value={form.productName} onChange={e=>{const product=products.find(p=>p.name===e.target.value);setForm({...form,productName:e.target.value,category:product?.category||form.category})}}/><datalist id="advance-products">{products.map(p=><option key={p.id} value={p.name}/>)}</datalist></Field>
                <Field label="Category"><input className={inputClass} value={form.category} onChange={e=>setForm({...form,category:e.target.value})}/></Field>
                <Field label="Description"><textarea className={inputClass} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></Field>
                <div className="md:col-span-2">
                  <Field label="Total Order Amount *"><input required min="0.01" step="0.01" type="number" className={inputClass} value={form.totalAmount} onChange={e=>setForm({...form,totalAmount:e.target.value})}/></Field>
                </div>
                <div className="md:col-span-2">
                  <SplitPaymentSelector
                    type="deposit"
                    targetAmount={Number(form.totalAmount) || 0}
                    method={depositMethod}
                    onMethodChange={setDepositMethod}
                    onChange={setDepositValidation}
                    disabled={saving}
                    initialSingleAmount={form.depositAmount}
                  />
                </div>
                <Field label="Expected Delivery Date *"><input required type="date" className={inputClass} value={form.expectedDeliveryDate} onChange={e=>setForm({...form,expectedDeliveryDate:e.target.value})}/></Field>
                <Field label="Order Status"><select disabled className={inputClass} value="pending_deposit"><option value="pending_deposit">Pending Deposit</option></select></Field>
                <div className="md:col-span-2"><Field label="Reference Number"><input className={inputClass} value={form.reference_number} onChange={e=>setForm({...form,reference_number:e.target.value})} placeholder="e.g. PO-001, booking ref (optional)"/></Field></div>
                <div className="md:col-span-2"><Field label="Remarks"><textarea className={inputClass} value={form.remarks} onChange={e=>setForm({...form,remarks:e.target.value})} placeholder="e.g. special instructions, colour, size notes"/></Field></div>
              </div>
            </div>
            <div className="sticky bottom-0 z-20 shrink-0 bg-[#FBFAF6] px-4 py-3 sm:px-6 sm:py-3.5 border-t border-gray-200 flex items-center justify-end gap-2.5 sm:gap-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_12px_rgba(0,0,0,0.06)] sm:shadow-none">
              <button type="button" onClick={()=>setCreateOpen(false)} className="flex-1 sm:flex-initial min-h-[48px] sm:min-h-0 rounded-xl border border-gray-300 px-5 py-2.5 font-bold cursor-pointer hover:bg-gray-50 transition flex items-center justify-center">Cancel</button>
              <button disabled={saving || !depositValidation.isValid} className="flex-[1.5] sm:flex-initial min-h-[48px] sm:min-h-0 rounded-xl bg-[#7e22ce] px-5 py-2.5 font-black text-white shadow-md disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer hover:bg-[#6b1cb1] transition flex items-center justify-center">{saving?'Creating...':'Create & Save Advance Receipt'}</button>
            </div>
          </form>
        </div>
      </div>,
      document.body
    )}

    {paymentOrder && createPortal(
      <div
        style={{
          paddingTop: 'max(16px, env(safe-area-inset-top))',
          paddingRight: 'max(16px, env(safe-area-inset-right))',
          paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
          paddingLeft: 'max(16px, env(safe-area-inset-left))',
        }}
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-xs overflow-y-auto overscroll-contain animate-in fade-in duration-150"
      >
        <div className="fixed inset-0" onClick={()=>setPaymentOrder(null)} />
        <div
          style={{ maxHeight: 'calc(100dvh - 32px)' }}
          className="relative z-10 w-full max-w-md rounded-3xl bg-white shadow-2xl border border-[#ead7b7] overflow-hidden flex flex-col my-auto"
        >
          <div className="shrink-0 px-5 py-3.5 sm:px-6 sm:py-4 border-b border-gray-100 flex items-start justify-between bg-[#FBFAF6]">
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-emerald-600 font-mono">{paymentOrder.deposit_id}</p>
              <h3 className="text-lg sm:text-xl font-black text-[#273126]">Receive Remaining Payment</h3>
            </div>
            <button type="button" onClick={()=>setPaymentOrder(null)} className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-700 transition cursor-pointer">
              <X size={16}/>
            </button>
          </div>
          <form onSubmit={receivePayment} className="flex flex-col flex-1 overflow-hidden min-h-0">
            <div className="overflow-y-auto flex-1 p-4 sm:p-6 space-y-4">
              <div className="rounded-2xl bg-emerald-50 py-5 text-center">
                <p className="text-[11px] font-black uppercase tracking-widest text-emerald-600">Remaining Amount</p>
                <p className="mt-1 font-black text-emerald-800 text-4xl">{formatCurrency(paymentOrder.remaining_balance)}</p>
              </div>
              <div className="space-y-4">
                <SplitPaymentSelector
                  type="balance"
                  targetAmount={paymentOrder.remaining_balance}
                  method={balanceMethod}
                  onMethodChange={setBalanceMethod}
                  onChange={setBalanceValidation}
                  disabled={saving}
                />

                <Field label="Payment Notes">
                  <textarea className={inputClass} value={paymentForm.remarks} onChange={e=>setPaymentForm({...paymentForm,remarks:e.target.value})} placeholder="Notes about this payment (optional)"/>
                </Field>
                <p className="mt-2 rounded-xl bg-amber-50 p-3 text-[11px] font-semibold text-amber-800">Confirmation marks the order Completed, creates one official invoice, and recognizes the full {formatCurrency(paymentOrder.total_amount)} as revenue.</p>
              </div>
            </div>
            <div className="sticky bottom-0 z-20 shrink-0 bg-[#FBFAF6] px-4 py-3 sm:px-6 sm:py-3.5 border-t border-gray-200 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_12px_rgba(0,0,0,0.06)] sm:shadow-none">
              <button disabled={saving || !balanceValidation.isValid} className="w-full min-h-[48px] rounded-xl bg-emerald-600 py-3 font-black text-white shadow-lg shadow-emerald-600/30 transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer hover:bg-emerald-700 flex items-center justify-center">
                {saving?'Processing...':'Confirm Final Payment'}
              </button>
            </div>
          </form>
        </div>
      </div>,
      document.body
    )}

    {selected && createPortal(
      <div className="fixed inset-0 top-0 left-0 right-0 bottom-0 w-screen h-screen h-[100dvh] z-[9999] flex justify-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
        {/* Backdrop click dismiss */}
        <div className="absolute inset-0" onClick={() => setSelected(null)} />

        {/* Drawer Panel covering full view height */}
        <div className="relative z-10 h-screen h-[100dvh] w-full max-w-xl bg-white shadow-2xl flex flex-col border-l border-[#ead7b7] animate-in slide-in-from-right duration-200">
          {/* Sticky Drawer Header */}
          <div className="shrink-0 px-6 py-4 border-b border-gray-200 bg-brand-black text-white flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#1e2817] border border-[#7daa8f] flex items-center justify-center text-[#7daa8f] shrink-0">
                <FileText size={18} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-[#7daa8f] tracking-wider font-mono">{selected.deposit_id}</span>
                  <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border ${STATUS_STYLES[selected.status]}`}>
                    {STATUS_LABELS[selected.status]}
                  </span>
                </div>
                <h3 className="text-base font-black text-white tracking-wide">Order Details</h3>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer shrink-0"
              title="Close (Esc)"
            >
              <X size={16} />
            </button>
          </div>

          {/* Scrollable Drawer Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div className="grid grid-cols-2 gap-3">
              {[
                ['Customer', selected.customer_name],
                ['Phone', selected.phone],
                ['Address', selected.address || '-'],
                ['Product', selected.product_name],
                ['Category', selected.category || '-'],
                ['Total', formatCurrency(selected.total_amount)],
                ['Deposit Paid', formatCurrency(selected.deposit_amount)],
                ['Remaining Balance', formatCurrency(selected.remaining_balance)],
                ['Delivery Date', safeDeliveryDate(selected.expected_delivery_date)],
                ['Created Date', new Date(selected.created_at).toLocaleDateString('en-IN')],
                ['Created Time', new Date(selected.created_at).toLocaleTimeString('en-IN')],
                ['Created By', selected.created_by_name || '-'],
                ['Current Status', STATUS_LABELS[selected.status]],
                ['Invoice Number', selected.invoice_number || 'Not generated'],
                ['Reference No', selected.reference_number || '—'],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-[#F8F7F4] p-3 border border-gray-100">
                  <p className="text-[10px] font-black uppercase text-[#858C83]">{k}</p>
                  <p className="mt-1 break-words text-sm font-bold text-[#273126]">{v}</p>
                </div>
              ))}
            </div>

            {selected.remarks && (
              <div className="rounded-xl border border-violet-200 bg-violet-50 p-3.5">
                <p className="text-[10px] font-black uppercase text-violet-600">Remarks</p>
                <p className="mt-1 text-sm text-[#273126] font-medium">{selected.remarks}</p>
              </div>
            )}

            {selected.description && (
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3.5">
                <p className="text-[10px] font-black uppercase text-[#858C83]">Description</p>
                <p className="mt-1 text-sm text-gray-800">{selected.description}</p>
              </div>
            )}

            <div>
              <h4 className="text-sm font-black text-gray-900">Quick Timeline Updates</h4>
              <div className="mt-2 flex flex-wrap gap-2">
                {[
                  ['order_confirmed', 'Order Confirmed'],
                  ['order_packed', 'Order Packed'],
                  ['ready_for_delivery', 'Ready for Delivery'],
                  ['customer_contacted', 'Customer Contacted'],
                  ['delivered', 'Delivered'],
                ].map(([type, label]) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => void addEvent(selected, type, label)}
                    className="rounded-lg border border-violet-200 bg-violet-50 hover:bg-violet-100 px-3 py-2 text-xs font-black text-violet-700 transition cursor-pointer"
                  >
                    + {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-sm font-black text-gray-900">Payment History</h4>
              <div className="mt-2 space-y-2">
                {payments.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">No payments recorded yet.</p>
                ) : (
                  payments.map((payment) => (
                    <div key={payment.id} className="flex justify-between items-center rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-sm">
                      <span className="font-bold capitalize text-emerald-900">{payment.payment_type} — {payment.payment_method}</span>
                      <span className="font-black text-emerald-800">{formatCurrency(Number(payment.amount))}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div>
              <h4 className="text-sm font-black text-gray-900">Order Timeline</h4>
              <div className="mt-3 border-l-2 border-violet-200 pl-4 space-y-4">
                {timeline.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">No timeline events recorded.</p>
                ) : (
                  timeline.map((event) => (
                    <div key={event.id} className="relative pb-2 before:absolute before:-left-[21px] before:top-1.5 before:h-2.5 before:w-2.5 before:rounded-full before:bg-violet-600">
                      <p className="text-sm font-black text-gray-900">{event.label}</p>
                      <p className="text-xs text-[#81887F]">{new Date(event.created_at).toLocaleString('en-IN')}</p>
                      {event.remarks && <p className="mt-1 text-xs text-gray-600 bg-white/70 p-2 rounded-lg border border-gray-100">{event.remarks}</p>}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Sticky Drawer Footer */}
          <div className="sticky bottom-0 z-20 shrink-0 px-4 py-3 sm:px-6 sm:py-4 border-t border-gray-200 bg-[#FBFAF6] flex items-center justify-between gap-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_12px_rgba(0,0,0,0.06)] sm:shadow-none">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => downloadFile(selected.status === 'completed' ? invoiceFile(selected) : advanceReceiptPdf(selected))}
                className="inline-flex items-center justify-center min-h-[44px] sm:min-h-0 gap-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs font-bold text-gray-700 hover:bg-gray-100 cursor-pointer transition shadow-xs"
                title={selected.status === 'completed' ? 'Download PDF Invoice' : 'Download PDF Receipt'}
              >
                <Download size={14} /> PDF
              </button>
              <button
                type="button"
                onClick={() => selected.status === 'completed' ? whatsappInvoice(selected) : whatsappDepositReceipt(selected)}
                className="inline-flex items-center justify-center min-h-[44px] sm:min-h-0 gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold hover:bg-emerald-100 cursor-pointer transition shadow-xs"
                title="Share via WhatsApp"
              >
                <MessageCircle size={14} /> WhatsApp
              </button>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="min-h-[44px] sm:min-h-0 px-5 py-2 rounded-xl bg-brand-black text-white text-xs font-black hover:bg-gray-800 cursor-pointer transition flex items-center justify-center"
            >
              Close
            </button>
          </div>
        </div>
      </div>,
      document.body
    )}

    {deleteModalConfig && (
      <HardDeleteModal
        isOpen={deleteModalConfig.isOpen}
        onClose={() => setDeleteModalConfig(null)}
        onConfirm={deleteModalConfig.onConfirm}
        title={deleteModalConfig.title}
        subtitle={deleteModalConfig.subtitle}
        entityType={deleteModalConfig.entityType}
        impactDetails={deleteModalConfig.impactDetails}
        requireTypeDelete={deleteModalConfig.requireTypeDelete}
        warningText={deleteModalConfig.warningText}
      />
    )}
  </div>
}
