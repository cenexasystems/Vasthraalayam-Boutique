/**
 * Advance Order Service — Neon-backed (Phase 2 migration)
 *
 * All CRUD now routes to /api/advance-orders (Neon) instead of Supabase RPCs.
 * localStorage is kept as a read-only cache/offline fallback — it is never
 * the source of truth once Neon is available.
 */
import { neonApi } from '../lib/neonApi'
import { getCurrentBusinessId } from '../lib/barcode'

export type AdvanceStatus = 'pending_deposit' | 'ready_for_delivery' | 'waiting_final_payment' | 'completed' | 'cancelled'
export type AdvancePaymentMethod = 'cash' | 'upi' | 'qr' | 'card' | 'split'

export type AdvanceOrder = {
  id: string
  deposit_id: string
  customer_name: string
  phone: string
  address: string
  product_name: string
  products: Array<Record<string, unknown>>
  category: string
  description: string
  total_amount: number
  deposit_amount: number
  remaining_balance: number
  expected_delivery_date: string
  status: AdvanceStatus
  remarks: string
  reference_number: string
  created_by_name: string
  created_at: string
  updated_at: string
  completed_at: string | null
  completed_order_id: string | null
  invoice_number: string | null
  final_payment_method: string | null
  advance_payment_method?: string | null
  subtotal?: number
  discount_amount?: number
  manual_discount_amount?: number
  manual_discount_type?: string
  manual_discount_value?: number
  delivery_charge?: number
  shipping?: number
  coupon_code?: string | null
  coupon_percentage?: number
  total_gst?: number
  gst_amount?: number
  gst_rate?: number
  gst_enabled?: boolean
  payments?: Array<{ mode: string; amount: number; phase?: string; paid_at?: string; notes?: string }>
}

export type AdvanceTimeline = {
  id: number
  advance_order_id: string
  event_type: string
  label: string
  remarks: string
  created_at: string
}
export type AdvancePayment = {
  id: string
  advance_order_id: string
  payment_type: 'deposit' | 'remaining'
  amount: number
  payment_method: string
  remarks: string
  received_at: string
}

// ─── Local cache helpers (offline resilience only) ────────────────────────────
const STORAGE_ORDERS_KEY = 'vasthraalayam_boutique_advance_orders_v1'
const STORAGE_TIMELINE_KEY = 'vasthraalayam_boutique_advance_timeline_v1'
const STORAGE_PAYMENTS_KEY = 'vasthraalayam_boutique_advance_payments_v1'

export const isValidOrder = (o: unknown): o is AdvanceOrder => {
  if (!o || typeof o !== 'object') return false
  const order = o as AdvanceOrder
  return Boolean(
    order.id &&
    String(order.id).trim() !== '' &&
    order.deposit_id &&
    String(order.deposit_id).trim() !== '' &&
    Number(order.total_amount) > 0
  )
}

const loadLocalOrders = (): AdvanceOrder[] => {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_ORDERS_KEY) || '[]')
    if (!Array.isArray(raw)) return []
    return raw.filter(isValidOrder)
  } catch { return [] }
}
const saveLocalOrders = (orders: AdvanceOrder[]) => {
  try {
    const valid = orders.filter(isValidOrder)
    localStorage.setItem(STORAGE_ORDERS_KEY, JSON.stringify(valid))
  } catch { /* ignore */ }
}
const loadLocalTimeline = (): AdvanceTimeline[] => {
  try { return JSON.parse(localStorage.getItem(STORAGE_TIMELINE_KEY) || '[]') as AdvanceTimeline[] } catch { return [] }
}
const saveLocalTimeline = (t: AdvanceTimeline[]) => {
  try { localStorage.setItem(STORAGE_TIMELINE_KEY, JSON.stringify(t)) } catch { /* ignore */ }
}
const loadLocalPayments = (): AdvancePayment[] => {
  try { return JSON.parse(localStorage.getItem(STORAGE_PAYMENTS_KEY) || '[]') as AdvancePayment[] } catch { return [] }
}
const saveLocalPayments = (p: AdvancePayment[]) => {
  try { localStorage.setItem(STORAGE_PAYMENTS_KEY, JSON.stringify(p)) } catch { /* ignore */ }
}

// ─── API helpers ──────────────────────────────────────────────────────────────
const throwIfError = <T>(result: { data: T | null; error: Error | null }, label: string): T => {
  if (result.error || result.data === null) throw new Error(result.error?.message || `${label} failed`)
  return result.data
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function deleteAdvanceOrder(orderId: string): Promise<{ localOnly: boolean; backupId?: string | number }> {
  const result = await neonApi.delete<{ backup_id?: string | number; backup?: { id?: string | number }; success?: boolean }>(
    `/advance-orders?id=${encodeURIComponent(orderId)}`
  )

  const isNotFound = Boolean(
    result.error && (
      result.error.message.toLowerCase().includes('not found') ||
      result.error.message.includes('404')
    )
  )

  // If error is not a 404 (e.g. 401 Unauthorized, 403 Forbidden, 500 DB error), rethrow so UI can display it
  if (result.error && !isNotFound) {
    throw result.error
  }

  // Clean up local cache (for both successful remote deletes and local-only records)
  saveLocalOrders(loadLocalOrders().filter(o => o.id !== orderId))
  saveLocalTimeline(loadLocalTimeline().filter(t => t.advance_order_id !== orderId))
  saveLocalPayments(loadLocalPayments().filter(p => p.advance_order_id !== orderId))

  return {
    localOnly: isNotFound,
    backupId: result.data?.backup_id || result.data?.backup?.id,
  }
}


export async function listAdvanceOrders(businessId?: string, options: { fallbackToCache?: boolean } = {}): Promise<AdvanceOrder[]> {
  const bizId = businessId || getCurrentBusinessId()
  const result = await neonApi.get<AdvanceOrder[]>(`/advance-orders?business_id=${encodeURIComponent(bizId)}`)
  if (result.error || !result.data) {
    // Background refreshes pass fallbackToCache: false so a failed poll keeps the
    // rows on screen instead of swapping in an older cached list (visible flicker).
    if (options.fallbackToCache === false) throw result.error ?? new Error('Unable to load advance orders')
    console.warn('[listAdvanceOrders] Neon error, falling back to local cache:', result.error?.message)
    return loadLocalOrders()
  }
  const remote = (result.data || []).filter(isValidOrder)
  saveLocalOrders(remote)
  return remote
}

export async function getAdvanceOrderHistory(orderId: string): Promise<{ timeline: AdvanceTimeline[]; payments: AdvancePayment[] }> {
  const result = await neonApi.get<{ timeline: AdvanceTimeline[]; payments: AdvancePayment[] }>(
    `/advance-orders?history=${encodeURIComponent(orderId)}`
  )
  if (result.error || !result.data) {
    return {
      timeline: loadLocalTimeline().filter(t => t.advance_order_id === orderId),
      payments: loadLocalPayments().filter(p => p.advance_order_id === orderId),
    }
  }
  return result.data
}

export async function createAdvanceOrder(input: {
  customerName: string
  phone: string
  address: string
  productName: string
  category: string
  description: string
  totalAmount: number
  depositAmount: number
  expectedDeliveryDate: string
  remarks: string
  referenceNumber: string
  paymentMethod: AdvancePaymentMethod
  createdByName: string
  products?: Array<Record<string, unknown>>
  payments?: Array<{ mode: string; amount: number; notes?: string }>
  subtotal?: number
  discountAmount?: number
  manualDiscountAmount?: number
  manualDiscountType?: string
  manualDiscountValue?: number
  deliveryCharge?: number
  couponCode?: string | null
  couponPercentage?: number
  totalGst?: number
  gstRate?: number
  gstEnabled?: boolean
}): Promise<AdvanceOrder> {
  const order = throwIfError(
    await neonApi.post<AdvanceOrder>('/advance-orders', {
      p_customer_name: input.customerName,
      p_phone: input.phone,
      p_address: input.address,
      p_product_name: input.productName,
      p_category: input.category,
      p_description: input.description,
      p_total_amount: input.totalAmount,
      p_deposit_amount: input.depositAmount,
      p_expected_delivery_date: input.expectedDeliveryDate,
      p_remarks: input.remarks,
      p_payment_method: input.paymentMethod,
      p_created_by_name: input.createdByName,
      p_products: input.products || [],
      reference_number: input.referenceNumber,
      payments: input.payments,
      subtotal: input.subtotal,
      discount_amount: input.discountAmount,
      manual_discount_amount: input.manualDiscountAmount,
      manual_discount_type: input.manualDiscountType || 'flat',
      manual_discount_value: input.manualDiscountValue != null ? input.manualDiscountValue : input.manualDiscountAmount,
      delivery_charge: input.deliveryCharge,
      shipping: input.deliveryCharge,
      coupon_code: input.couponCode,
      coupon_percentage: input.couponPercentage,
      total_gst: input.totalGst,
      gst_rate: input.gstRate,
      gst_enabled: input.gstEnabled,
    }),
    'createAdvanceOrder'
  )
  // Update local cache
  if (isValidOrder(order)) {
    const local = loadLocalOrders()
    saveLocalOrders([order, ...local.filter(o => o.id !== order.id)])
  }
  return order
}

export async function updateAdvanceStatus(
  orderId: string,
  status: AdvanceStatus,
  remarks = ''
): Promise<AdvanceOrder> {
  const updated = throwIfError(
    await neonApi.patch<AdvanceOrder>(`/advance-orders?id=${encodeURIComponent(orderId)}`, { status, remarks }),
    'updateAdvanceStatus'
  )
  saveLocalOrders(loadLocalOrders().map(o => (o.id === orderId ? updated : o)))
  return updated
}

export async function addAdvanceEvent(
  orderId: string,
  eventType: string,
  label: string,
  remarks = ''
): Promise<void> {
  await throwIfError(
    await neonApi.patch<{ ok: boolean }>(`/advance-orders?id=${encodeURIComponent(orderId)}`, {
      action: 'add_event',
      event_type: eventType,
      label,
      remarks,
    }),
    'addAdvanceEvent'
  )
}

export async function completeAdvanceOrder(
  orderId: string,
  paymentMethod: AdvancePaymentMethod,
  finalAmount: number,
  couponCode: string | null = null,
  couponPercentage = 0,
  manualDiscountAmount = 0,
  remarks = '',
  payments?: Array<{ mode: string; amount: number; notes?: string }>,
  changeGiven = 0,
  totalGst = 0,
  gstRate = 0,
  gstEnabled = false
): Promise<{ order_id: string; invoice_no: string; completed_at: string }> {
  const result = throwIfError(
    await neonApi.patch<{ order_id: string; invoice_no: string; completed_at: string }>(
      `/advance-orders?id=${encodeURIComponent(orderId)}`,
      {
        action: 'complete',
        payment_method: paymentMethod,
        final_amount: finalAmount,
        coupon_code: couponCode,
        coupon_percentage: couponPercentage,
        manual_discount: manualDiscountAmount,
        remarks,
        payments,
        change_given: changeGiven,
        total_gst: totalGst,
        gst_rate: gstRate,
        gst_enabled: gstEnabled,
      }
    ),
    'completeAdvanceOrder'
  )
  // Update local cache with completed status
  const now = new Date().toISOString()
  saveLocalOrders(
    loadLocalOrders().map(o =>
      o.id === orderId
        ? {
            ...o,
            status: 'completed',
            completed_at: result.completed_at || now,
            completed_order_id: result.order_id,
            invoice_number: result.invoice_no,
            final_payment_method: paymentMethod,
            remarks: remarks || o.remarks,
            updated_at: now,
          }
        : o
    )
  )
  return result
}
