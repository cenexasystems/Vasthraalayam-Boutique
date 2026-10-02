/**
 * Advance Order Service — Neon-backed (Phase 2 migration)
 *
 * All CRUD now routes to /api/advance-orders (Neon) instead of Supabase RPCs.
 * localStorage is kept as a read-only cache/offline fallback — it is never
 * the source of truth once Neon is available.
 */
import { neonApi } from '../lib/neonApi'

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

export async function deleteAdvanceOrder(orderId: string): Promise<void> {
  await throwIfError(
    await neonApi.delete<{ id: string }>(`/advance-orders?id=${encodeURIComponent(orderId)}`),
    'deleteAdvanceOrder'
  )
  // Clean up local cache
  saveLocalOrders(loadLocalOrders().filter(o => o.id !== orderId))
  saveLocalTimeline(loadLocalTimeline().filter(t => t.advance_order_id !== orderId))
  saveLocalPayments(loadLocalPayments().filter(p => p.advance_order_id !== orderId))
}

export async function listAdvanceOrders(): Promise<AdvanceOrder[]> {
  const result = await neonApi.get<AdvanceOrder[]>('/advance-orders')
  if (result.error || !result.data) {
    console.warn('[listAdvanceOrders] Neon error, falling back to local cache:', result.error?.message)
    return loadLocalOrders()
  }
  const remote = (result.data || []).filter(isValidOrder)
  // Merge: remote is authoritative; keep any purely local valid orders not yet synced
  const remoteIds = new Set(remote.map(r => r.id))
  const localOnly = loadLocalOrders().filter(l => isValidOrder(l) && !remoteIds.has(l.id))
  const merged = [...remote, ...localOnly].sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
  saveLocalOrders(merged)
  return merged
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
  changeGiven = 0
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
