/**
 * revenueAnalytics.ts
 * Single shared revenue & line-item analytics engine for POS Analytics.
 * Used by all tabs (Revenue, Today's Sales, Products, Services, Coupons)
 * and CSV/PDF export generation.
 *
 * CORE RULES:
 * 1. Line-item classification: strictly based on line-item item_type ('product' | 'service').
 *    - Product lines (including those in advance/deposit orders) count ONLY in Products.
 *    - Service lines (tailoring, stitching, alterations) count ONLY in Services.
 *    - Mixed bills are split line-by-line.
 *    - Discounts/coupons shared proportionally: (lineGross / orderGross) * min(orderDiscount, orderGross).
 *    - Total Revenue = Product Revenue + Service Revenue.
 * 2. Deposit recognition:
 *    - Recognized as revenue ONLY when fully paid and completed (status = 'completed').
 *    - Open/pending deposits are NOT sales; advance received is tracked separately as Advance Received.
 * 3. Timezone:
 *    - All date presets (Today, Week, Month, Year, Custom) are evaluated in IST (Asia/Kolkata, UTC+5:30).
 *    - Week starts on Monday.
 *    - End date is inclusive through 23:59:59.999.
 * 4. Multi-tenancy:
 *    - Scoped by business_id.
 */

export type LineItemType = 'product' | 'service'

export interface AnalyticsLineItem {
  id?: string | number
  order_id: string
  product_id?: string | number | null
  product_name: string
  variant_name?: string
  category: string
  quantity: number
  unit_price: number
  line_total: number
  item_type: LineItemType
  is_manual?: boolean
  source?: string
  business_id?: string
}

export interface AnalyticsOrder {
  id: string
  invoice_no: string
  customer_name?: string
  phone?: string
  address?: string
  remarks?: string
  tailor_name?: string
  reference_number?: string
  user_id?: string
  invoice_pdf_url?: string
  created_at: string
  billing_date?: string | null
  total: number
  subtotal?: number
  status: string
  order_mode?: string
  order_type?: string
  shipping?: number
  delivery_charge?: number
  discount_amount?: number
  manual_discount_amount?: number
  coupon_code?: string | null
  coupon_percentage?: number
  total_gst?: number
  gst_amount?: number
  payment_method?: string
  payment_mode?: string
  payments?: Array<{ mode: string; amount: number }>
  change_given?: number
  items?: unknown
  business_id?: string
  [key: string]: unknown
}

export interface AnalyticsAdvanceOrder {
  id: string
  deposit_id: string
  status: string
  total_amount: number
  deposit_amount: number
  remaining_balance?: number
  created_at: string
  completed_at?: string | null
  completed_order_id?: string | null
  business_id?: string
}

export interface AnalyticsCoupon {
  id?: number | string
  code: string
  percentage: number
  is_active: boolean
  usage_count?: number
  business_id?: string
}

export interface CatalogItemMetric {
  name: string
  variant: string
  category: string
  sku: string
  qty: number
  revenue: number
  billCount: number
  avgPrice: number
  share: number
}

export interface CatalogMetricsSummary {
  revenue: number
  totalSold: number
  averageRevenue: number
  bestItem: string
  items: CatalogItemMetric[]
}

export interface ProcessedAnalytics {
  // Period-aware metrics
  totalRevenue: number
  totalCompletedRevenue: number
  productRevenue: number
  serviceRevenue: number
  billCount: number
  completedOrders: number
  pendingOrders: number
  offlineOrderCount: number
  onlineBillCount: number
  averageRevenuePerBill: number

  // Products tab metrics
  totalProductsSold: number
  averageProductRevenue: number
  bestProduct: string
  topProducts: CatalogItemMetric[]

  // Services tab metrics
  totalServicesSold: number
  averageServiceRevenue: number
  bestService: string
  topServices: CatalogItemMetric[]

  // Revenue tab breakdowns
  posRevenue: number
  onlinePosRevenue: number
  manualRevenue: number
  todayOfflineRevenue: number
  todayOnlineRevenue: number
  todayManualRevenue: number
  cashRevenue: number
  qrRevenue: number
  cardRevenue: number
  totalGST: number
  totalDeliveryCharges: number
  totalDiscounts: number
  advanceReceivedPending: number
  monthlyRevenue: number
  chartYear: number

  // Profitability
  cogs: number
  totalExpenses: number
  netProfit: number
  isProfitable: boolean

  // Categories distribution
  topCategories: Array<{ name: string; qty: number; revenue: number }>
  categoryDist: Array<{ name: string; value: number }>
  channelDistribution: Array<{ name: string; value: number; color: string }>
  statusDistribution: Array<{ name: string; value: number; color: string }>
  bestCategory: string
  avgItemsPerBill: number

  // Today's Sales tab metrics
  todaySales: number
  todayCompletedOrdersCount: number
  todayItemsSold: number
  todayAvgOrderValue: number
  todayHourlyTrend: Array<{ hour: string; key: string; revenue: number }>
  todayProductHourlyTrend: Array<{ hour: string; key: string; qty: number }>
  todayTopProducts: Array<{ name: string; qty: number; revenue: number }>
  todayBills: AnalyticsOrder[]

  // WhatsApp metrics
  onlineRequests: number
  onlineRequestOrders: AnalyticsOrder[]
  waRequests: number
  waPending: number
  waContacted: number
  waCompleted: number
  topWAProducts: Array<{ name: string; count: number }>
  topWACategories: Array<{ name: string; count: number }>

  // Coupons tab metrics
  topCoupons: Array<{
    code: string
    usage: number
    discounts: number
    percentage?: number
    is_active?: boolean
  }>
  totalCouponOrders: number
  totalCouponDiscounts: number
  couponUsageRate: number
  couponDailyTrend: Array<{ day: string; date: string; orders: number; discounts: number }>

  // Trend Charts (Calendar based, IST)
  monthlyTrend: Array<{ key: string; month: string; revenue: number }>
  weeklySales: Array<{ day: string; date: string; revenue: number }>
  monthDailySales: Array<{ day: string; date: string; label: string; revenue: number }>
}

// ── Timezone Helper (IST: UTC+5:30) ──────────────────────────────────────────

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000

export function getNowIST(): Date {
  const utcNow = new Date()
  return new Date(utcNow.getTime() + IST_OFFSET_MS)
}

export function toISTDateString(d: Date | string | number): string {
  const dateObj = typeof d === 'string' || typeof d === 'number' ? new Date(d) : d
  if (Number.isNaN(dateObj.getTime())) return ''
  const istDate = new Date(dateObj.getTime() + IST_OFFSET_MS)
  return istDate.toISOString().slice(0, 10)
}

export function toISTMonthKey(d: Date | string | number): string {
  return toISTDateString(d).slice(0, 7)
}

export function getISTDateRange(preset: 'all' | 'today' | 'week' | 'month' | 'year' | 'custom', customFrom?: string, customTo?: string): { from: string; to: string } {
  const now = getNowIST()
  const todayStr = now.toISOString().slice(0, 10)

  if (preset === 'today') {
    return { from: todayStr, to: todayStr }
  }

  if (preset === 'week') {
    // Calendar week starting Monday (0 = Sun, 1 = Mon ... 6 = Sat)
    const dayOfWeek = now.getUTCDay()
    const offsetToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    const monday = new Date(now)
    monday.setUTCDate(now.getUTCDate() + offsetToMonday)
    return { from: monday.toISOString().slice(0, 10), to: todayStr }
  }

  if (preset === 'month') {
    const monthStart = `${now.toISOString().slice(0, 7)}-01`
    return { from: monthStart, to: todayStr }
  }

  if (preset === 'year') {
    const yearStart = `${now.toISOString().slice(0, 4)}-01-01`
    return { from: yearStart, to: todayStr }
  }

  if (preset === 'custom') {
    return { from: customFrom || '', to: customTo || '' }
  }

  // 'all'
  return { from: '', to: '' }
}

function parseOrderItemsFallback(itemsRaw: unknown): unknown[] {
  if (Array.isArray(itemsRaw)) return itemsRaw
  if (typeof itemsRaw === 'string' && itemsRaw.trim()) {
    try {
      const parsed = JSON.parse(itemsRaw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

function toNumber(v: unknown, fallback = 0): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

// ── Master Analytics Processor ───────────────────────────────────────────────

export function computeAnalytics({
  orders,
  orderItems,
  advanceOrders = [],
  coupons = [],
  expenses = [],
  productsCatalog = [],
  businessId = '1',
  dateFrom = '',
  dateTo = '',
}: {
  orders: AnalyticsOrder[]
  orderItems: AnalyticsLineItem[]
  advanceOrders?: AnalyticsAdvanceOrder[]
  coupons?: AnalyticsCoupon[]
  expenses?: Array<{ expense_date: string; amount: number; business_id?: string }>
  productsCatalog?: Array<{ id: string | number; name: string; sku?: string; item_type?: string; itemType?: string; purchasePrice?: number; purchase_price?: number }>
  businessId?: string
  dateFrom?: string
  dateTo?: string
}): ProcessedAnalytics {
  // 1. Multi-tenancy filter
  const targetBiz = String(businessId || '1').trim()
  const bizOrders = orders.filter(o => !o.business_id || String(o.business_id).trim() === targetBiz)
  const bizAdvOrders = advanceOrders.filter(ao => !ao.business_id || String(ao.business_id).trim() === targetBiz)
  const bizCoupons = coupons.filter(c => !c.business_id || String(c.business_id).trim() === targetBiz)
  const bizExpenses = expenses.filter(e => !e.business_id || String(e.business_id).trim() === targetBiz)

  // 2. Global Completed Billable Orders (Completed, non-cancelled, non-WhatsApp requests)
  // Advance orders count as revenue strictly when status === 'completed'.
  const allBillable = bizOrders.filter(o => {
    const status = String(o.status || '').toLowerCase()
    const orderType = String(o.order_type || '').toLowerCase()
    return status === 'completed' && orderType !== 'online_request'
  })

  // Date filtering in IST
  const datedBillable = allBillable.filter(o => {
    const istDate = toISTDateString(o.created_at)
    if (dateFrom && istDate < dateFrom) return false
    if (dateTo && istDate > dateTo) return false
    return true
  })

  const billableOrderMap = new Map(datedBillable.map(o => [o.id, o]))
  const datedOrderIds = new Set(datedBillable.map(o => o.id))

  // 3. Resolve Items for Dated Completed Orders
  // Map catalog product costs and SKUs for COGS and lookups
  const prodCostById = new Map<string, number>()
  const prodSkuById = new Map<string, string>()
  const prodTypeById = new Map<string, LineItemType>()
  const prodTypeByName = new Map<string, LineItemType>()

  productsCatalog.forEach(p => {
    const idKey = String(p.id)
    const cost = toNumber(p.purchasePrice ?? p.purchase_price, 0)
    prodCostById.set(idKey, cost)
    if (p.sku) prodSkuById.set(idKey, p.sku)
    const rawType = (p as { itemType?: string; item_type?: string }).itemType || p.item_type
    const itType = (rawType === 'service' ? 'service' : 'product') as LineItemType
    prodTypeById.set(idKey, itType)
    prodTypeByName.set(String(p.name || '').trim().toLowerCase(), itType)
  })

  // Collect items belonging to dated billable orders
  const itemsForDated = orderItems.length > 0
    ? orderItems.filter(it => datedOrderIds.has(it.order_id))
    : datedBillable.flatMap(order => {
        const parsed = parseOrderItemsFallback(order.items)
        return parsed.map(row => {
          const r = row as Record<string, unknown>
          const rawItemType = (r.item_type as string) || (r.itemType as string)
          const validItemType = rawItemType === 'service' || rawItemType === 'product' ? (rawItemType as LineItemType) : undefined
          return {
            order_id: order.id,
            product_id: r.product_id as string | number | null | undefined,
            product_name: String(r.product_name || r.name || 'Product'),
            variant_name: String(r.variant_name || ''),
            category: String(r.category || 'Uncategorized'),
            quantity: toNumber(r.quantity ?? r.qty, 1),
            line_total: toNumber(r.line_total ?? r.lineTotal, 0),
            item_type: validItemType,
            is_manual: Boolean(r.is_manual),
            source: String(r.source || ''),
          } as AnalyticsLineItem
        })
      })

  // Group items by order to compute gross line total and proportional discount allocation
  const orderItemsGrouped = new Map<string, AnalyticsLineItem[]>()
  itemsForDated.forEach(it => {
    const list = orderItemsGrouped.get(it.order_id) || []
    list.push(it)
    orderItemsGrouped.set(it.order_id, list)
  })

  interface ResolvedEnrichedItem {
    order_id: string
    product_id?: string | number | null
    rawKey: string
    mainName: string
    variantName: string
    categoryName: string
    sku: string
    qty: number
    grossRevenue: number
    netRevenue: number
    resolvedType: LineItemType
    is_manual: boolean
  }

  const enrichedItems: ResolvedEnrichedItem[] = []
  let cogs = 0

  orderItemsGrouped.forEach((items, orderId) => {
    const order = billableOrderMap.get(orderId)
    const orderDiscount = order ? toNumber(order.discount_amount, 0) + toNumber(order.manual_discount_amount, 0) : 0
    const orderGrossSubtotal = items.reduce((sum, it) => sum + toNumber(it.line_total, 0), 0)

    items.forEach(it => {
      const qty = toNumber(it.quantity, 0)
      const grossRev = toNumber(it.line_total, 0)
      // Proportional split of order-level discounts across line items
      const discountShare = orderGrossSubtotal > 0 && orderDiscount > 0
        ? (grossRev / orderGrossSubtotal) * Math.min(orderDiscount, orderGrossSubtotal)
        : 0
      const netRev = Math.max(0, grossRev - discountShare)

      const rawKey = String(it.product_name || 'Product').trim() || 'Product'
      const dashIdx = rawKey.indexOf(' - ')
      const mainName = dashIdx > 0 ? rawKey.slice(0, dashIdx).trim() : rawKey
      const variantFromKey = dashIdx > 0 ? rawKey.slice(dashIdx + 3).trim() : ''
      const variantName = it.variant_name || variantFromKey

      const idKey = it.product_id != null ? String(it.product_id) : ''
      const sku = (idKey && prodSkuById.get(idKey)) || ''
      const catName = it.category || 'Uncategorized'

      // STRICT CLASSIFICATION:
      // 1. Line item explicit item_type if valid ('service' | 'product')
      // 2. Catalog product item_type lookup by id or name
      // 3. Fallback to 'product'
      // A service must never appear in the Products table or totals, and a product never in Services.
      const catalogTypeById = idKey ? prodTypeById.get(idKey) : undefined
      const catalogTypeByName = prodTypeByName.get(mainName.toLowerCase())
      const catalogType = catalogTypeById || catalogTypeByName

      let resolvedType: LineItemType = 'product'
      if (it.item_type === 'service') {
        resolvedType = 'service'
      } else if (catalogType === 'service') {
        // Catalog explicitly defines this as a service (e.g. "Test Tailoring Service")
        resolvedType = 'service'
      } else if (it.item_type === 'product') {
        resolvedType = 'product'
      } else if (catalogType === 'product') {
        resolvedType = 'product'
      } else {
        resolvedType = 'product'
      }

      if (resolvedType === 'product') {
        cogs += (idKey ? (prodCostById.get(idKey) || 0) : 0) * qty
      }

      enrichedItems.push({
        order_id: orderId,
        product_id: it.product_id,
        rawKey,
        mainName,
        variantName,
        categoryName: catName,
        sku,
        qty,
        grossRevenue: grossRev,
        netRevenue: netRev,
        resolvedType,
        is_manual: Boolean(it.is_manual),
      })
    })
  })

  // 4. Compute Catalog Metrics (Products tab & Services tab)
  function computeCatalogMetrics(targetType: LineItemType): CatalogMetricsSummary {
    const itemsOfType = enrichedItems.filter(it => it.resolvedType === targetType)
    const itemMap = new Map<string, {
      name: string
      variant: string
      category: string
      sku: string
      qty: number
      revenue: number
      orderSet: Set<string>
    }>()

    let totalRevenue = 0
    let totalSold = 0

    itemsOfType.forEach(it => {
      totalRevenue += it.netRevenue
      totalSold += it.qty

      const existing = itemMap.get(it.rawKey) || {
        name: it.mainName,
        variant: it.variantName,
        category: it.categoryName,
        sku: it.sku,
        qty: 0,
        revenue: 0,
        orderSet: new Set<string>(),
      }
      existing.qty += it.qty
      existing.revenue += it.netRevenue
      if (!existing.sku && it.sku) existing.sku = it.sku
      if ((!existing.category || existing.category === 'Uncategorized') && it.categoryName) {
        existing.category = it.categoryName
      }
      existing.orderSet.add(it.order_id)
      itemMap.set(it.rawKey, existing)
    })

    const sortedItems: CatalogItemMetric[] = Array.from(itemMap.values())
      .map(it => ({
        name: it.name,
        variant: it.variant,
        category: it.category,
        sku: it.sku,
        qty: it.qty,
        revenue: it.revenue,
        billCount: it.orderSet.size,
        avgPrice: it.qty > 0 ? it.revenue / it.qty : 0,
        share: totalRevenue > 0 ? (it.revenue / totalRevenue) * 100 : 0,
      }))
      .sort((a, b) => (b.revenue !== a.revenue ? b.revenue - a.revenue : b.qty - a.qty))

    const averageRevenue = totalSold > 0 ? totalRevenue / totalSold : 0
    const bestItem = sortedItems[0]?.name || 'No sales yet'

    return {
      revenue: totalRevenue,
      totalSold,
      averageRevenue,
      bestItem,
      items: sortedItems,
    }
  }

  const productMetrics = computeCatalogMetrics('product')
  const serviceMetrics = computeCatalogMetrics('service')

  // Total Revenue rule: Products + Services = Revenue
  const totalRevenue = productMetrics.revenue + serviceMetrics.revenue
  const billCount = datedBillable.length
  const averageRevenuePerBill = billCount > 0 ? totalRevenue / billCount : 0

  // 5. Payment Methods & Revenue Breakdown
  let posRevenue = 0
  let onlinePosRevenue = 0
  let manualRevenue = 0
  let cashRevenue = 0
  let qrRevenue = 0
  let cardRevenue = 0
  let totalGST = 0
  let totalDeliveryCharges = 0
  let totalDiscounts = 0

  datedBillable.forEach(o => {
    const oTotal = toNumber(o.total, 0)
    totalGST += toNumber(o.total_gst ?? o.gst_amount, 0)
    totalDeliveryCharges += toNumber(o.delivery_charge, 0)
    totalDiscounts += toNumber(o.discount_amount, 0) + toNumber(o.manual_discount_amount, 0)

    const mode = String(o.order_mode || '').toLowerCase()
    const type = String(o.order_type || '').toLowerCase()
    if (type === 'manual_sale') manualRevenue += oTotal
    else if (mode === 'online') onlinePosRevenue += oTotal
    else posRevenue += oTotal

    // Split payments aggregation
    if (Array.isArray(o.payments) && o.payments.length > 0) {
      o.payments.forEach(p => {
        const pMode = String(p.mode || '').toLowerCase()
        const amt = toNumber(p.amount, 0)
        if (pMode === 'cash') {
          const change = toNumber(o.change_given, 0)
          cashRevenue += Math.max(0, amt - change)
        } else if (pMode === 'qr') {
          qrRevenue += amt
        } else if (pMode === 'card') {
          cardRevenue += amt
        }
      })
    } else {
      const pMethod = String(o.payment_mode || o.payment_method || 'cash').toLowerCase()
      if (pMethod === 'cash') cashRevenue += oTotal
      else if (pMethod === 'qr' || pMethod === 'upi') qrRevenue += oTotal
      else if (pMethod === 'card') cardRevenue += oTotal
    }
  })

  // Advance Received on open/pending deposits within the selected period (Liability, NOT sales revenue)
  const pendingDeposits = bizAdvOrders.filter(ao => {
    if (ao.status === 'cancelled') return false
    const aoIstDate = toISTDateString(ao.created_at)
    if (dateFrom && aoIstDate < dateFrom) return false
    if (dateTo && aoIstDate > dateTo) return false
    return ao.status === 'pending_deposit'
  })
  const advanceReceivedPending = pendingDeposits.reduce((s, ao) => s + toNumber(ao.deposit_amount, 0), 0)

  // Expenses & Profitability
  const datedExpenses = bizExpenses.filter(e => {
    if (dateFrom && e.expense_date < dateFrom) return false
    if (dateTo && e.expense_date > dateTo) return false
    return true
  })
  const totalExpenses = datedExpenses.reduce((s, e) => s + toNumber(e.amount, 0), 0)
  const netProfit = totalRevenue - cogs - totalExpenses
  const isProfitable = netProfit >= 0

  // Category Distribution
  const categoryMap = new Map<string, { name: string; qty: number; revenue: number }>()
  enrichedItems.forEach(it => {
    const existing = categoryMap.get(it.categoryName) || { name: it.categoryName, qty: 0, revenue: 0 }
    existing.qty += it.qty
    existing.revenue += it.netRevenue
    categoryMap.set(it.categoryName, existing)
  })
  const topCategories = Array.from(categoryMap.values()).sort((a, b) => b.revenue - a.revenue)
  const bestCategory = topCategories[0]?.name || 'No sales yet'
  const avgItemsPerBill = billCount > 0 ? (productMetrics.totalSold + serviceMetrics.totalSold) / billCount : 0

  // 6. Today's Specific Analytics (strictly in IST)
  const todayISTStr = getNowIST().toISOString().slice(0, 10)
  const todayOrders = allBillable.filter(o => toISTDateString(o.created_at) === todayISTStr)
  const todaySales = todayOrders.reduce((s, o) => s + toNumber(o.total, 0), 0)
  const todayCompletedOrdersCount = todayOrders.length

  const todayOrderIds = new Set(todayOrders.map(o => o.id))
  const todayItems = enrichedItems.filter(it => todayOrderIds.has(it.order_id))
  const todayItemsSold = todayItems.reduce((s, it) => s + it.qty, 0)
  const todayAvgOrderValue = todayCompletedOrdersCount > 0 ? todaySales / todayCompletedOrdersCount : 0

  // Today top products
  const todayProductMap = new Map<string, { name: string; qty: number; revenue: number }>()
  todayItems.forEach(it => {
    const existing = todayProductMap.get(it.rawKey) || { name: it.mainName, qty: 0, revenue: 0 }
    existing.qty += it.qty
    existing.revenue += it.netRevenue
    todayProductMap.set(it.rawKey, existing)
  })
  const todayTopProducts = Array.from(todayProductMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 5)
  const todayBills = [...todayOrders].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 10)

  // Today Hourly Trend (00 to 23 in IST)
  const hourlyRevenueMap = new Map<string, number>()
  const hourlyQtyMap = new Map<string, number>()

  todayOrders.forEach(o => {
    const istTime = new Date(new Date(o.created_at).getTime() + IST_OFFSET_MS)
    const hourKey = String(istTime.getUTCHours()).padStart(2, '0')
    hourlyRevenueMap.set(hourKey, (hourlyRevenueMap.get(hourKey) || 0) + toNumber(o.total, 0))
  })

  todayItems.forEach(it => {
    const order = billableOrderMap.get(it.order_id)
    if (!order) return
    const istTime = new Date(new Date(order.created_at).getTime() + IST_OFFSET_MS)
    const hourKey = String(istTime.getUTCHours()).padStart(2, '0')
    hourlyQtyMap.set(hourKey, (hourlyQtyMap.get(hourKey) || 0) + it.qty)
  })

  const todayHourlyTrend = Array.from({ length: 24 }, (_, i) => {
    const h = String(i).padStart(2, '0')
    const ampm = i < 12 ? 'AM' : 'PM'
    const h12 = i === 0 ? 12 : i > 12 ? i - 12 : i
    return { hour: `${h12} ${ampm}`, key: h, revenue: hourlyRevenueMap.get(h) || 0 }
  })

  const todayProductHourlyTrend = Array.from({ length: 24 }, (_, i) => {
    const h = String(i).padStart(2, '0')
    const ampm = i < 12 ? 'AM' : 'PM'
    const h12 = i === 0 ? 12 : i > 12 ? i - 12 : i
    return { hour: `${h12} ${ampm}`, key: h, qty: hourlyQtyMap.get(h) || 0 }
  })

  // 7. Coupons Analytics
  const couponMap = new Map<string, { code: string; usage: number; discounts: number; percentage?: number; is_active?: boolean }>()
  bizCoupons.forEach(c => {
    const code = String(c.code || '').trim().toUpperCase()
    if (!code) return
    couponMap.set(code, {
      code,
      usage: 0,
      discounts: 0,
      percentage: c.percentage,
      is_active: c.is_active,
    })
  })

  // Count coupons used in dated completed orders
  datedBillable.forEach(order => {
    const rawCode = String(order.coupon_code || '').trim()
    if (!rawCode) return
    const code = rawCode.toUpperCase()
    const u = couponMap.get(code) || { code, usage: 0, discounts: 0, is_active: false }
    u.usage += 1
    u.discounts += toNumber(order.discount_amount, 0)
    couponMap.set(code, u)
  })

  const topCoupons = Array.from(couponMap.values()).sort((a, b) => (b.usage !== a.usage ? b.usage - a.usage : b.discounts - a.discounts))
  const totalCouponOrders = topCoupons.reduce((s, c) => s + c.usage, 0)
  const totalCouponDiscounts = topCoupons.reduce((s, c) => s + c.discounts, 0)
  const couponUsageRate = billCount > 0 ? (totalCouponOrders / billCount) * 100 : 0

  // Rolling 7-day coupon trend (Last 7 Days from ALL completed orders, not bounded by period filter)
  const last7DaysCouponMap = new Map<string, { orders: number; discounts: number }>()
  allBillable.forEach(order => {
    const code = String(order.coupon_code || '').trim()
    if (!code) return
    const istKey = toISTDateString(order.created_at)
    const existing = last7DaysCouponMap.get(istKey) || { orders: 0, discounts: 0 }
    existing.orders += 1
    existing.discounts += toNumber(order.discount_amount, 0)
    last7DaysCouponMap.set(istKey, existing)
  })

  const couponDailyTrend = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(getNowIST())
    d.setUTCDate(d.getUTCDate() - (6 - i))
    const dateStr = d.toISOString().slice(0, 10)
    const dayName = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(d)
    const trendData = last7DaysCouponMap.get(dateStr) || { orders: 0, discounts: 0 }
    return { day: dayName, date: dateStr, orders: trendData.orders, discounts: trendData.discounts }
  })

  // 8. Trend Charts (Calendar-based in IST)
  const chartYear = getNowIST().getUTCFullYear()
  const monthlyRevenueMap = new Map<string, number>()
  allBillable.forEach(o => {
    const k = toISTMonthKey(o.created_at)
    monthlyRevenueMap.set(k, (monthlyRevenueMap.get(k) || 0) + toNumber(o.total, 0))
  })

  const monthlyTrend = Array.from({ length: 12 }, (_, i) => {
    const mStr = String(i + 1).padStart(2, '0')
    const k = `${chartYear}-${mStr}`
    const d = new Date(Date.UTC(chartYear, i, 1))
    const monthName = d.toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' })
    return { key: k, month: monthName, revenue: monthlyRevenueMap.get(k) || 0 }
  })

  const weeklySalesMap = new Map<string, number>()
  allBillable.forEach(o => {
    const k = toISTDateString(o.created_at)
    weeklySalesMap.set(k, (weeklySalesMap.get(k) || 0) + toNumber(o.total, 0))
  })

  const nowIST = getNowIST()
  const dayOfWeek = nowIST.getUTCDay()
  const offsetToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const mondayDate = new Date(nowIST)
  mondayDate.setUTCDate(mondayDate.getUTCDate() + offsetToMonday)

  const weeklySales = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mondayDate)
    d.setUTCDate(d.getUTCDate() + i)
    const k = d.toISOString().slice(0, 10)
    const dayName = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(d)
    return { day: dayName, date: k, revenue: weeklySalesMap.get(k) || 0 }
  })

  const daysInCurrentMonth = new Date(Date.UTC(nowIST.getUTCFullYear(), nowIST.getUTCMonth() + 1, 0)).getUTCDate()
  const monthDailySales = Array.from({ length: daysInCurrentMonth }, (_, i) => {
    const d = new Date(Date.UTC(nowIST.getUTCFullYear(), nowIST.getUTCMonth(), i + 1))
    const k = d.toISOString().slice(0, 10)
    return { day: `${i + 1}`, date: `${i + 1}/${nowIST.getUTCMonth() + 1}`, label: `Day ${i + 1}`, revenue: weeklySalesMap.get(k) || 0 }
  })

  // Channel & Status Breakdown
  const offlinePOS = datedBillable.filter(o => String(o.order_mode || '').toLowerCase() === 'offline' && String(o.order_type || '').toLowerCase() !== 'manual_sale')
  const onlinePOS = datedBillable.filter(o => String(o.order_mode || '').toLowerCase() === 'online')
  const waOrders = bizOrders.filter(o => String(o.order_type || '').toLowerCase() === 'online_request')
  const pendingOrders = bizOrders.filter(o => String(o.status || '').toLowerCase() === 'pending' && String(o.order_type || '').toLowerCase() !== 'online_request')

  const channelDistribution = [
    { name: 'Offline Bills', value: posRevenue, color: '#f97316' },
    { name: 'Online Bills',  value: onlinePosRevenue, color: '#3b82f6' },
    { name: 'Manual Sales',  value: manualRevenue, color: '#8b5cf6' },
  ]
  const statusDistribution = [
    { name: 'WA Requests', value: waOrders.length, color: '#3b82f6' },
    { name: 'POS Pending', value: pendingOrders.length, color: '#f59e0b' },
    { name: 'Completed',   value: datedBillable.length, color: '#10b981' },
  ]
  const categoryDist = topCategories.slice(0, 8).map(c => ({ name: c.name, value: c.revenue }))

  // Today Channel Breakdown
  const todayOffline = todayOrders.filter(o => String(o.order_mode || '').toLowerCase() === 'offline' && String(o.order_type || '').toLowerCase() !== 'manual_sale')
  const todayOnline = todayOrders.filter(o => String(o.order_mode || '').toLowerCase() === 'online')
  const todayManual = todayOrders.filter(o => String(o.order_type || '').toLowerCase() === 'manual_sale')
  const todayOfflineRevenue = todayOffline.reduce((s, o) => s + toNumber(o.total, 0), 0)
  const todayOnlineRevenue = todayOnline.reduce((s, o) => s + toNumber(o.total, 0), 0)
  const todayManualRevenue = todayManual.reduce((s, o) => s + toNumber(o.total, 0), 0)

  // Current Month Total Revenue
  const currentMonthKey = toISTMonthKey(getNowIST())
  const monthlyRevenue = allBillable.filter(o => toISTMonthKey(o.created_at) === currentMonthKey).reduce((s, o) => s + toNumber(o.total, 0), 0)

  // WhatsApp Analytics
  const waRequests = waOrders.length
  const waPending = waOrders.filter(o => String(o.status || '').toLowerCase() === 'pending').length
  const waContacted = waOrders.filter(o => String(o.status || '').toLowerCase() === 'contacted').length
  const waCompleted = waOrders.filter(o => String(o.status || '').toLowerCase() === 'completed').length

  const waProductMap = new Map<string, number>()
  waOrders.forEach(order => {
    parseOrderItemsFallback(order.items).forEach(item => {
      const n = String((item as Record<string, unknown>).name || (item as Record<string, unknown>).product_name || '').trim()
      if (n) waProductMap.set(n, (waProductMap.get(n) || 0) + 1)
    })
  })
  const topWAProducts = Array.from(waProductMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count }))

  const waCategoryMap = new Map<string, number>()
  waOrders.forEach(order => {
    parseOrderItemsFallback(order.items).forEach(item => {
      const n = String((item as Record<string, unknown>).name || (item as Record<string, unknown>).product_name || '').trim()
      if (n) {
        const mainName = n.includes(' - ') ? n.split(' - ')[0] : n
        const catName = 'Uncategorized'
        waCategoryMap.set(catName, (waCategoryMap.get(catName) || 0) + 1)
      }
    })
  })
  const topWACategories = Array.from(waCategoryMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count }))

  return {
    totalRevenue,
    totalCompletedRevenue: totalRevenue,
    productRevenue: productMetrics.revenue,
    serviceRevenue: serviceMetrics.revenue,
    billCount,
    completedOrders: datedBillable.length,
    pendingOrders: pendingOrders.length,
    offlineOrderCount: offlinePOS.length,
    onlineBillCount: onlinePOS.length,
    averageRevenuePerBill,
    totalProductsSold: productMetrics.totalSold,
    averageProductRevenue: productMetrics.averageRevenue,
    bestProduct: productMetrics.bestItem,
    topProducts: productMetrics.items,
    totalServicesSold: serviceMetrics.totalSold,
    averageServiceRevenue: serviceMetrics.averageRevenue,
    bestService: serviceMetrics.bestItem,
    topServices: serviceMetrics.items,
    posRevenue,
    onlinePosRevenue,
    manualRevenue,
    todayOfflineRevenue,
    todayOnlineRevenue,
    todayManualRevenue,
    cashRevenue,
    qrRevenue,
    cardRevenue,
    totalGST,
    totalDeliveryCharges,
    totalDiscounts,
    advanceReceivedPending,
    monthlyRevenue,
    chartYear,
    cogs,
    totalExpenses,
    netProfit,
    isProfitable,
    topCategories,
    categoryDist,
    channelDistribution,
    statusDistribution,
    bestCategory,
    avgItemsPerBill,
    todaySales,
    todayCompletedOrdersCount,
    todayItemsSold,
    todayAvgOrderValue,
    todayHourlyTrend,
    todayProductHourlyTrend,
    todayTopProducts,
    todayBills,
    onlineRequests: waRequests,
    onlineRequestOrders: waOrders,
    waRequests,
    waPending,
    waContacted,
    waCompleted,
    topWAProducts,
    topWACategories,
    topCoupons,
    totalCouponOrders,
    totalCouponDiscounts,
    couponUsageRate,
    couponDailyTrend,
    monthlyTrend,
    weeklySales,
    monthDailySales,
  }
}
