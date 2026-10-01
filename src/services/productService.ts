import { neonApi } from '../lib/neonApi'
import { getCurrentBusinessId } from '../lib/barcode'

// Products/categories now live in Neon (Phase 1 + this Dashboard-CRUD pass) — see neon/README.md.

export function fetchAllCategories() {
  return neonApi.get<Array<{ id: number; name_en: string }>>('/categories')
}

export function fetchAllProducts() {
  return neonApi.get<Array<Record<string, unknown>>>('/products')
}

export async function updateItemPrice(params: {
  entityType: 'product' | 'variant'
  id: number | string
  newPrice: number
  newCostPrice?: number
  businessId?: string
}): Promise<void> {
  if (params.newPrice < 0) throw new Error('Price cannot be negative')

  const updatePayload: Record<string, unknown> = {
    price: params.newPrice,
    offer_price: params.newPrice,
  }
  if (params.newCostPrice !== undefined && params.newCostPrice >= 0) {
    updatePayload.purchase_price = params.newCostPrice
  }

  const bizId = params.businessId || getCurrentBusinessId()
  const path = params.entityType === 'variant'
    ? `/variants/${params.id}`
    : `/products/${params.id}?business_id=${encodeURIComponent(bizId)}`
  const { error } = await neonApi.put(path, updatePayload)
  if (error) throw error
}

export async function getOrCreateUnregisteredProduct(
  name: string,
  price: number
): Promise<{ id: number; name: string; price: number; category: string }> {
  const trimmedName = name.trim()

  // 1. Resolve or create 'Unregistered' category (already seeded by
  // neon/migrations/0003_billing_core_seed.sql, but resolved defensively
  // here in case it was ever removed).
  const { data: categories } = await neonApi.get<Array<{ id: number; name_en: string }>>('/categories')
  let categoryId = categories?.find((c) => c.name_en.toLowerCase() === 'unregistered')?.id

  if (!categoryId) {
    const { data: newCat, error: catErr } = await neonApi.post<{ id: number }>('/categories', {
      name_en: 'Unregistered',
      name_ta: 'பதிவுசெய்யப்படாதது',
      is_active: true,
      sort_order: 999,
    })
    if (catErr || !newCat) throw catErr || new Error('Failed to create Unregistered category')
    categoryId = newCat.id
  }

  // 2. Check if product already exists under Unregistered category
  const { data: products } = await neonApi.get<Array<{ id: number; name: string; price: number; category_id: number }>>('/products')
  const existingProd = products?.find(
    (p) => p.category_id === categoryId && p.name.toLowerCase() === trimmedName.toLowerCase(),
  )

  if (existingProd) {
    if (Number(existingProd.price) !== Number(price)) {
      await neonApi.put(`/products/${existingProd.id}`, { price: Number(price) })
    }
    return {
      id: Number(existingProd.id),
      name: existingProd.name,
      price: Number(price),
      category: 'Unregistered',
    }
  }

  // 3. Create ad-hoc product row (stock 0, non-inventory)
  const { data: newProd, error: prodErr } = await neonApi.post<{ id: number; name: string; price: number }>('/products', {
    name: trimmedName,
    category_id: categoryId,
    price: Number(price),
    offer_price: null,
    stock_quantity: 0,
    stock: 0,
    unit_type: 'unit',
    unit_label: 'piece',
    unit: 'piece',
    base_quantity: 1,
    has_variants: false,
    sort_order: 999,
  })

  if (prodErr || !newProd) throw prodErr || new Error('Failed to create ad-hoc product')

  return {
    id: Number(newProd.id),
    name: newProd.name,
    price: Number(price),
    category: 'Unregistered',
  }
}
