import { neonApi } from '../lib/neonApi'

export interface InventoryStockItem {
  id: string // compound id: prod-{id} or var-{id}
  product_id: number
  variant_id?: string | null
  entity_type: 'product' | 'variant'
  name: string
  name_ta?: string
  variant_name?: string
  sku?: string
  barcode?: string
  stock: number
  price: number
  offer_price?: number
  purchase_price?: number
  cost_price?: number
  unit?: string
  unit_type?: string
  category?: string
  image_url?: string
  is_active: boolean
  low_stock_threshold?: number
  updated_at?: string
}

export interface ProductDeletePreview {
  product_id: number
  product_name: string
  item_type: string
  stock_quantity: number
  price: number
  orders_count: number
  total_amount_affected: number
  affected_invoices: string[]
  variants_count: number
  barcodes_count: number
  movements_count: number
}

export interface InventoryMovement {
  id: number
  product_id: number
  variant_id?: string | null
  barcode_id?: string | null
  movement_type: 'INITIAL_BARCODE_STOCK' | 'RESTOCK' | 'SALE' | 'RETURN' | 'DAMAGE' | 'CORRECTION' | 'VOID'
  quantity_delta: number
  quantity_before: number
  quantity_after: number
  unit_cost?: number | null
  reference_type?: string | null
  reference_id?: string | null
  note?: string
  created_by_name: string
  created_at: string
  product?: {
    id: number
    name: string
    name_ta?: string
    image_url?: string
  }
  variant?: {
    id: string
    variant_name: string
    sku?: string
  }
}

export interface StockAdjustmentPayload {
  product_id: number
  variant_id?: string | null
  new_quantity: number
  reason: 'RESTOCK' | 'DAMAGE' | 'CORRECTION' | 'RETURN'
  note?: string
  created_by_name?: string
}

export interface CategoryRecord {
  id: number
  name_en: string
  name_ta?: string
  is_active: boolean
  sort_order: number
  product_count?: number
  created_at?: string
  updated_at?: string
}

export interface InventoryAnalyticsSummary {
  incomingStock: number
  unitsSold: number
  unitsDamaged: number
  unitsReturned: number
  netDelta: number
  totalMovementsCount: number
  movements: InventoryMovement[]
}

// Products/categories/variants/inventory now live in Neon (Phase 1 + this
// Dashboard-CRUD pass) — see neon/README.md.
export const inventoryService = {
  /**
   * Fetch complete SKU/variant level inventory list.
   */
  async fetchInventoryItems(): Promise<InventoryStockItem[]> {
    const [{ data: products, error: prodErr }, { data: variants, error: varErr }] = await Promise.all([
      neonApi.get<Array<Record<string, unknown>>>('/products'),
      neonApi.get<Array<Record<string, unknown>>>('/variants'),
    ])

    if (prodErr) {
      console.error('[inventoryService.fetchInventoryItems] Products error:', prodErr)
      throw prodErr
    }
    if (varErr) {
      console.error('[inventoryService.fetchInventoryItems] Variants error:', varErr)
      throw varErr
    }

    const items: InventoryStockItem[] = []
    const variantsByProduct = new Map<number, Record<string, unknown>[]>()

    for (const v of variants || []) {
      const pid = Number(v.product_id)
      const list = variantsByProduct.get(pid) || []
      list.push(v)
      variantsByProduct.set(pid, list)
    }

    for (const p of products || []) {
      // Exclude ad-hoc non-inventory unregistered items
      if (
        (typeof p.category === 'string' && p.category.trim().toLowerCase() === 'unregistered') ||
        p.category_id === 4
      ) {
        continue
      }
      // Services carry no stock — they don't belong in a stock/inventory list.
      if (p.item_type === 'service') continue

      const threshold = Number(p.low_stock_alert) > 0 ? Number(p.low_stock_alert) : 5
      const prodVariants = variantsByProduct.get(Number(p.id))

      if (prodVariants && prodVariants.length > 0) {
        for (const v of prodVariants) {
          items.push({
            id: `var-${v.id}`,
            product_id: Number(p.id),
            variant_id: String(v.id),
            entity_type: 'variant',
            name: String(p.name),
            name_ta: p.name_ta as string | undefined,
            variant_name: String(v.variant_name),
            sku: (v.sku as string) || (p.sku as string | undefined),
            barcode: v.barcode as string | undefined,
            stock: Number(v.stock) || 0,
            low_stock_threshold: threshold,
            price: Number(v.price) || Number(p.price) || 0,
            offer_price: p.offer_price ? Number(p.offer_price) : undefined,
            purchase_price: v.purchase_price ? Number(v.purchase_price) : (p.purchase_price ? Number(p.purchase_price) : undefined),
            cost_price: v.purchase_price ? Number(v.purchase_price) : (p.purchase_price ? Number(p.purchase_price) : undefined),
            unit: p.unit as string | undefined,
            unit_type: p.unit_type as string | undefined,
            category: p.category as string | undefined,
            image_url: p.image_url as string | undefined,
            is_active: (v.is_active as boolean) && (p.is_active as boolean),
            updated_at: (v.updated_at as string) || (p.updated_at as string | undefined),
          })
        }
      } else {
        items.push({
          id: `prod-${p.id}`,
          product_id: Number(p.id),
          variant_id: null,
          entity_type: 'product',
          name: String(p.name),
          name_ta: p.name_ta as string | undefined,
          variant_name: undefined,
          sku: p.sku as string | undefined,
          barcode: p.barcode as string | undefined,
          stock: Number(p.stock_quantity) || 0,
          low_stock_threshold: threshold,
          price: Number(p.price) || 0,
          offer_price: p.offer_price ? Number(p.offer_price) : undefined,
          purchase_price: p.purchase_price ? Number(p.purchase_price) : undefined,
          cost_price: p.purchase_price ? Number(p.purchase_price) : undefined,
          unit: p.unit as string | undefined,
          unit_type: p.unit_type as string | undefined,
          category: p.category as string | undefined,
          image_url: p.image_url as string | undefined,
          is_active: p.is_active as boolean,
          updated_at: p.updated_at as string | undefined,
        })
      }
    }

    return items.filter((i) => i.is_active !== false)
  },

  /**
   * Preview impact of deleting a product (affected bills, total revenue, stock).
   */
  async previewDeleteProduct(productId: number): Promise<ProductDeletePreview> {
    const { data, error } = await neonApi.get<ProductDeletePreview>(`/products?action=preview_delete&id=${productId}`)
    if (error) throw error
    if (!data) throw new Error('Could not fetch delete preview')
    return data
  },

  /**
   * Hard delete a product or variant permanently from database and inventory.
   */
  async deleteInventoryItem(productId: number, variantId?: string | null): Promise<void> {
    if (variantId) {
      const { error: vErr } = await neonApi.delete(`/variants/${variantId}`)
      if (vErr) throw vErr
    } else {
      const { error: pErr } = await neonApi.delete(`/products/${productId}`)
      if (pErr) throw pErr
    }
  },

  /**
   * Delete a stock movement and reverse its stock effect.
   */
  async deleteMovement(movementId: number): Promise<void> {
    const { error } = await neonApi.delete(`/inventory-movements/${movementId}`)
    if (error) throw error
  },

  /**
   * Adjust stock for an item with an audit log reason.
   */
  async adjustStock(payload: StockAdjustmentPayload) {
    const { data, error } = await neonApi.post('/inventory/adjust', {
      product_id: payload.product_id,
      variant_id: payload.variant_id || null,
      new_quantity: payload.new_quantity,
      reason: payload.reason,
      note: payload.note || '',
      created_by_name: payload.created_by_name || 'Admin',
    })

    if (error) {
      console.error('[inventoryService.adjustStock] Error:', error)
      throw error
    }

    return data
  },

  /**
   * Fetch movement audit ledger logs.
   */
  async fetchMovements(params?: {
    product_id?: number
    variant_id?: string | null
    movement_type?: string
    start_date?: string
    end_date?: string
    limit?: number
    offset?: number
  }): Promise<{ movements: InventoryMovement[]; total: number }> {
    const qs = new URLSearchParams()
    if (params?.product_id) qs.set('product_id', String(params.product_id))
    if (params?.variant_id) qs.set('variant_id', params.variant_id)
    if (params?.movement_type) qs.set('movement_type', params.movement_type)
    if (params?.start_date) qs.set('start_date', params.start_date)
    if (params?.end_date) qs.set('end_date', params.end_date)
    if (params?.limit) qs.set('limit', String(params.limit))
    if (params?.offset) qs.set('offset', String(params.offset))

    const { data, error, meta } = await neonApi.get<InventoryMovement[]>(`/inventory-movements?${qs.toString()}`)

    if (error) {
      console.error('[inventoryService.fetchMovements] Error:', error)
      throw error
    }

    return { movements: data || [], total: Number(meta?.total) || 0 }
  },

  /**
   * Aggregate stock movements math for Analytics & Reports.
   */
  async fetchInventoryAnalytics(startDate?: string, endDate?: string): Promise<InventoryAnalyticsSummary> {
    const { movements } = await this.fetchMovements({
      start_date: startDate,
      end_date: endDate,
      limit: 1000,
    })

    let incomingStock = 0
    let unitsSold = 0
    let unitsDamaged = 0
    let unitsReturned = 0

    for (const m of movements) {
      const delta = Number(m.quantity_delta) || 0
      if (m.movement_type === 'INITIAL_BARCODE_STOCK') {
        incomingStock += delta
      } else if (m.movement_type === 'RESTOCK') {
        if (delta > 0) {
          incomingStock += delta
        }
      } else if (m.movement_type === 'SALE') {
        unitsSold += Math.abs(delta)
      } else if (m.movement_type === 'DAMAGE') {
        unitsDamaged += Math.abs(delta)
      } else if (m.movement_type === 'RETURN') {
        unitsReturned += Math.abs(delta)
      }
    }

    const netDelta = incomingStock + unitsReturned - unitsSold - unitsDamaged

    return {
      incomingStock,
      unitsSold,
      unitsDamaged,
      unitsReturned,
      netDelta,
      totalMovementsCount: movements.length,
      movements,
    }
  },

  /**
   * Fetch all categories with product counts.
   */
  async fetchCategories(): Promise<CategoryRecord[]> {
    const [{ data: categories, error: catErr }, { data: products }] = await Promise.all([
      neonApi.get<CategoryRecord[]>('/categories'),
      neonApi.get<Array<{ category_id: number | null }>>('/products'),
    ])

    if (catErr) {
      console.error('[inventoryService.fetchCategories] Error:', catErr)
      throw catErr
    }

    const countMap: Record<number, number> = {}
    for (const p of products || []) {
      if (p.category_id) {
        countMap[p.category_id] = (countMap[p.category_id] || 0) + 1
      }
    }

    return (categories || []).map((c) => ({
      ...c,
      product_count: countMap[c.id] || 0,
    }))
  },

  /**
   * Create category.
   */
  async createCategory(payload: { name_en: string; name_ta?: string; sort_order?: number; is_active?: boolean }): Promise<CategoryRecord> {
    const { data, error } = await neonApi.post<CategoryRecord>('/categories', {
      name_en: payload.name_en.trim(),
      name_ta: payload.name_ta?.trim() || '',
      sort_order: payload.sort_order ?? 0,
      is_active: payload.is_active !== false,
    })

    if (error || !data) {
      console.error('[inventoryService.createCategory] Error:', error)
      throw error || new Error('Failed to create category')
    }

    return { ...data, product_count: 0 }
  },

  /**
   * Update category.
   */
  async updateCategory(id: number, payload: Partial<{ name_en: string; name_ta?: string; sort_order?: number; is_active?: boolean }>): Promise<CategoryRecord> {
    const updateData: Record<string, unknown> = {}
    if (payload.name_en !== undefined) updateData.name_en = payload.name_en.trim()
    if (payload.name_ta !== undefined) updateData.name_ta = payload.name_ta.trim() || ''
    if (payload.sort_order !== undefined) updateData.sort_order = payload.sort_order
    if (payload.is_active !== undefined) updateData.is_active = payload.is_active

    const { data, error } = await neonApi.put<CategoryRecord>(`/categories/${id}`, updateData)

    if (error || !data) {
      console.error('[inventoryService.updateCategory] Error:', error)
      throw error || new Error('Failed to update category')
    }

    return data
  },

  /**
   * Delete category.
   */
  async deleteCategory(id: number, force = false): Promise<void> {
    const url = `/categories/${id}${force ? '?force=true' : ''}`
    const { error } = await neonApi.delete(url)

    if (error) {
      console.error('[inventoryService.deleteCategory] Error:', error)
      throw error
    }
  },
}
