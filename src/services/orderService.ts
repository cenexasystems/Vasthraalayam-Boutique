import { neonApi } from '../lib/neonApi'
import type { StructuredOrderItem } from '../lib/retail'

type CreateOrderInput = {
  customerName: string
  phone: string
  address: string
  items: StructuredOrderItem[]
  shipping: number
  status?: string
  orderMode?: 'online' | 'offline'
  orderType?: 'online_request' | 'pos_sale' | 'manual_sale'
  deliveryCharge?: number
  discountAmount?: number
  manualDiscountAmount?: number
  manualDiscountType?: 'flat' | 'percent'
  manualDiscountValue?: number
  couponCode?: string
  couponPercentage?: number

  // POS additions
  paymentMethod?: string
  splitDetails?: Record<string, unknown>
  totalGst?: number
  gstEnabled?: boolean
}

type CreatedOrder = {
  orderId: string
  invoiceNo: string
  createdAt: string
}

// Orders now live in Neon (Phase 1 of the Supabase migration) — see
// neon/README.md. complete_pos_sale_with_inventory is the only checkout
// function there, so the old Supabase-migration-version fallback chain
// (complete_pos_sale_with_inventory -> create_order_with_stock ->
// create_order_without_stock, keyed on PostgREST's PGRST202 error code)
// no longer applies and has been dropped.
export const createOrderWithStock = async (input: CreateOrderInput): Promise<CreatedOrder> => {
  const customerName = input.customerName.trim() || 'Customer'
  const phone = input.phone.trim()
  const address = input.address.trim()
  const shipping = Number(input.shipping || 0)
  const status = input.status || 'pending'
  const orderMode = input.orderMode || 'online'
  const orderType = input.orderType || (status === 'pending' && orderMode === 'online' ? 'online_request' : 'pos_sale')
  const deliveryCharge = Number(input.deliveryCharge || 0)
  const discountAmount = Number(input.discountAmount || 0)
  const manualDiscountAmount = Number(input.manualDiscountAmount || 0)
  const manualDiscountType = input.manualDiscountType || 'flat'
  const manualDiscountValue = Number(input.manualDiscountValue || 0)
  const couponCode = input.couponCode?.trim() || null
  const couponPercentage = Number(input.couponPercentage || 0)
  const totalGst = Number(input.totalGst || 0)
  const gstEnabled = Boolean(input.gstEnabled)
  const paymentMethod = input.paymentMethod || 'cash'
  const splitDetails = input.splitDetails || {}

  const { data, error } = await neonApi.post<{ order_id: string; invoice_no: string; total: number }>('/checkout', {
    customer_name: customerName,
    phone,
    address,
    items: input.items,
    shipping,
    status,
    order_mode: orderMode,
    order_type: orderType,
    delivery_charge: deliveryCharge,
    discount_amount: discountAmount,
    manual_discount_amount: manualDiscountAmount,
    manual_discount_type: manualDiscountType,
    manual_discount_value: manualDiscountValue,
    coupon_code: couponCode,
    coupon_percentage: couponPercentage,
    total_gst: totalGst,
    gst_enabled: gstEnabled,
    payment_method: paymentMethod,
    split_details: splitDetails,
  })

  if (error || !data) {
    throw error || new Error('Checkout did not return an order')
  }

  return {
    orderId: data.order_id,
    invoiceNo: data.invoice_no,
    createdAt: new Date().toISOString(),
  }
}
