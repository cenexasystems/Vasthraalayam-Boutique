import { neonApi } from '../lib/neonApi'

export interface BarcodeRegistryRecord {
  id: string
  barcode_value: string
  entity_type: 'product' | 'variant'
  product_id: number
  variant_id?: string | null
  is_active: boolean
  created_by_name: string
  created_at: string
  updated_at: string
  product?: {
    id: number
    name: string
    name_ta?: string
    price: number
    offer_price?: number
    image_url?: string
    category?: string
  }
  variant?: {
    id: string
    variant_name: string
    price?: number
    stock?: number
    sku?: string
  } | null
}

export interface CreateBarcodeAndReceivePayload {
  product_id: number
  variant_id?: string | null
  quantity_received: number
  unit_cost?: number | null
  created_by_name?: string
  custom_barcode?: string | null
  note?: string
}

export interface CreateBarcodeResponse {
  success: boolean
  barcode_id: string
  barcode_value: string
  is_new_barcode: boolean
  movement_type: string
  quantity_before: number
  quantity_received: number
  quantity_after: number
  product_id: number
  variant_id?: string | null
  product_name: string
  variant_name?: string
}

// Barcode registry now lives in Neon (Phase 1 + this Dashboard-CRUD pass) — see neon/README.md.
export const barcodeService = {
  /**
   * Receive stock and create/reuse barcode in a single atomic transaction.
   */
  async receiveStockWithBarcode(payload: CreateBarcodeAndReceivePayload): Promise<CreateBarcodeResponse> {
    const { data, error } = await neonApi.post<CreateBarcodeResponse>('/inventory/receive', {
      product_id: payload.product_id,
      variant_id: payload.variant_id || null,
      quantity_received: payload.quantity_received,
      unit_cost: payload.unit_cost ?? null,
      created_by_name: payload.created_by_name || 'Admin',
      custom_barcode: payload.custom_barcode || null,
      note: payload.note || '',
    })

    if (error || !data) {
      console.error('[barcodeService.receiveStockWithBarcode] Error:', error)
      throw error || new Error('Failed to receive stock with barcode')
    }

    return data
  },

  /**
   * Lookup barcode value in registry and resolve product + variant info.
   */
  async lookupBarcode(barcodeValue: string): Promise<BarcodeRegistryRecord | null> {
    const cleanValue = (barcodeValue ?? '').trim().toUpperCase()
    if (!cleanValue) return null

    const { data, error } = await neonApi.get<BarcodeRegistryRecord | null>(`/barcode-registry/lookup/${encodeURIComponent(cleanValue)}`)
    if (error) {
      console.warn('[barcodeService.lookupBarcode] Query error:', error)
      return null
    }
    return data
  },

  /**
   * Fetch all barcodes in the registry with pagination and search.
   */
  async fetchRegistry(params?: { search?: string; limit?: number; offset?: number }): Promise<{ records: BarcodeRegistryRecord[]; total: number }> {
    const qs = new URLSearchParams()
    if (params?.search?.trim()) qs.set('search', params.search.trim())
    if (params?.limit) qs.set('limit', String(params.limit))
    if (params?.offset) qs.set('offset', String(params.offset))

    const { data, error, meta } = await neonApi.get<BarcodeRegistryRecord[]>(`/barcode-registry?${qs.toString()}`)

    if (error) {
      console.error('[barcodeService.fetchRegistry] Error:', error)
      throw error
    }

    return { records: data || [], total: Number(meta?.total) || 0 }
  },

  /**
   * Deactivate a barcode in the registry.
   */
  async deactivateBarcode(id: string): Promise<void> {
    const { error } = await neonApi.patch(`/barcode-registry/${id}`, { is_active: false })
    if (error) throw error
  },
}
