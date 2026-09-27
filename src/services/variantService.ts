import { neonApi } from '../lib/neonApi'

export type ProductVariant = {
  id: string
  productId: string
  variantName: string
  sizeLabel: string | null   // display label: "25g", "250ml", "Cycle Brand"
  weightValue: number | null // numeric for filtering
  weightUnit: string | null  // "g", "ml", "kg", "L"
  sku: string | null
  barcode: string | null
  purchasePrice: number | null
  mrp: number | null
  price: number
  stock: number
  isDefault: boolean
  isActive: boolean
  sortOrder: number
  imageUrl: string | null
  groupName: string | null   // Brand name for Type D (Brand+Weight) products e.g. "Sithanathan"
}

export type VariantInput = {
  productId: string
  variantName: string
  sizeLabel?: string | null
  weightValue?: number | null
  weightUnit?: string | null
  sku?: string | null
  barcode?: string | null
  purchasePrice?: number | null
  mrp?: number | null
  price: number
  stock: number
  isDefault?: boolean
  sortOrder?: number
  imageUrl?: string | null
}

function mapVariant(r: Record<string, unknown>): ProductVariant {
  return {
    id:          String(r.id || ''),
    productId:   String(r.product_id || ''),
    variantName: String(r.variant_name || ''),
    sizeLabel:   r.size_label ? String(r.size_label) : null,
    weightValue: r.weight_value != null ? Number(r.weight_value) : null,
    weightUnit:  r.weight_unit ? String(r.weight_unit) : null,
    sku:         r.sku ? String(r.sku) : null,
    barcode:     r.barcode ? String(r.barcode) : null,
    purchasePrice: r.purchase_price != null ? Number(r.purchase_price) : null,
    mrp:         r.mrp != null ? Number(r.mrp) : null,
    price:       Number(r.price ?? 0),
    stock:       Number(r.stock ?? 0),
    isDefault:   r.is_default === true,
    isActive:    r.is_active !== false,
    sortOrder:   Number(r.sort_order ?? 0),
    imageUrl:    r.image_url ? String(r.image_url) : null,
    groupName:   r.group_name ? String(r.group_name) : null,
  }
}

// Variants now live in Neon (Phase 1 + this Dashboard-CRUD pass) — see neon/README.md.

// ── Read ──────────────────────────────────────────────────────────

export async function fetchAllVariants(): Promise<{ data: ProductVariant[]; error: string | null }> {
  const { data, error } = await neonApi.get<Array<Record<string, unknown>>>('/variants')

  if (error) return { data: [], error: error.message }
  return {
    data: (data || []).map(r => mapVariant(r)),
    error: null,
  }
}

export async function fetchVariantsByProduct(productId: string): Promise<ProductVariant[]> {
  const { data, error } = await neonApi.get<Array<Record<string, unknown>>>(`/variants?product_id=${encodeURIComponent(productId)}`)
  if (error) {
    console.error('[variantService.fetchVariantsByProduct] Error:', error)
    return []
  }
  return (data || []).map(r => mapVariant(r))
}

// ── Write (admin only) ────────────────────────────────────────────

export async function createVariant(input: VariantInput): Promise<{ data: ProductVariant | null; error: string | null }> {
  const { data, error } = await neonApi.post<Record<string, unknown>>('/variants', {
    product_id:   input.productId,
    variant_name: input.variantName,
    size_label:   input.sizeLabel ?? null,
    weight_value: input.weightValue ?? null,
    weight_unit:  input.weightUnit ?? null,
    sku:          input.sku ?? null,
    barcode:      input.barcode ?? null,
    purchase_price: input.purchasePrice ?? null,
    mrp:          input.mrp ?? null,
    price:        input.price,
    stock:        input.stock ?? 0,
    is_default:   input.isDefault ?? false,
    sort_order:   input.sortOrder ?? 0,
    image_url:    input.imageUrl ?? null,
  })

  if (error || !data) return { data: null, error: error?.message ?? 'Failed to create variant' }
  return { data: mapVariant(data), error: null }
}

export async function updateVariant(
  id: string,
  updates: Partial<VariantInput>,
): Promise<{ error: string | null }> {
  const payload: Record<string, unknown> = {}
  if (updates.variantName !== undefined) payload.variant_name = updates.variantName
  if (updates.sizeLabel   !== undefined) payload.size_label   = updates.sizeLabel
  if (updates.weightValue !== undefined) payload.weight_value = updates.weightValue
  if (updates.weightUnit  !== undefined) payload.weight_unit  = updates.weightUnit
  if (updates.sku           !== undefined) payload.sku            = updates.sku
  if (updates.barcode       !== undefined) payload.barcode        = updates.barcode
  if (updates.purchasePrice !== undefined) payload.purchase_price = updates.purchasePrice
  if (updates.mrp           !== undefined) payload.mrp            = updates.mrp
  if (updates.price         !== undefined) payload.price          = updates.price
  if (updates.stock         !== undefined) payload.stock          = updates.stock
  if (updates.isDefault     !== undefined) payload.is_default     = updates.isDefault
  if (updates.sortOrder     !== undefined) payload.sort_order     = updates.sortOrder
  if (updates.imageUrl      !== undefined) payload.image_url      = updates.imageUrl

  const { error } = await neonApi.put(`/variants/${id}`, payload)
  return { error: error?.message ?? null }
}

export async function deleteVariant(id: string): Promise<{ error: string | null }> {
  const { error } = await neonApi.delete(`/variants/${id}`)
  return { error: error?.message ?? null }
}

export async function setDefaultVariant(
  variantId: string,
  _productId: string,
): Promise<{ error: string | null }> {
  // ensure_one_default_variant_trigger (neon/migrations/0001) automatically
  // clears is_default on the product's other variants — a single update
  // suffices (the Supabase version's separate "clear defaults first" call
  // was redundant with the same trigger already present there).
  const { error } = await neonApi.put(`/variants/${variantId}`, { is_default: true })
  return { error: error?.message ?? null }
}
