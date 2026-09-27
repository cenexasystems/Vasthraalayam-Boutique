import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { isSupabaseConfigured } from '../lib/supabase'
import { supabase } from '../lib/supabase'
import { fetchAllCategories, fetchAllProducts } from '../services/productService'
import { fetchAllVariants, type ProductVariant } from '../services/variantService'
import { authLogin, neonApi, setNeonSessionToken } from '../lib/neonApi'
import { BRAND_ADDRESS, BRAND_EN, BRAND_PHONE_DISPLAY } from '../lib/brand'
import { applyThemeColor, DEFAULT_THEME_COLOR } from '../lib/theme'
import {
  calculateLineTotal,
  normalizeSelectedQuantity,
  normalizeUnitType,
  toNumber,
  type QuantityOption,
  type UnitType,
} from '../lib/retail'

import { useAlarmStore } from './alarmStore'
import { alarmSound } from '../lib/alarmAudio'

export type { ProductVariant }

/** Shared state for authentication, products, billing, and settings. */

// --- Types ---
export interface Product {
  id: string | number // Support both legacy numeric IDs and new UUIDs
  name: string
  nameTa?: string
  tamilName?: string
  category: string
  categoryId?: number | string | null
  remedy: string[]
  price: number
  offerPrice?: number | null
  unitType: UnitType
  unitLabel: string
  baseQuantity: number
  stockQuantity: number
  stockUnit: string
  allowDecimalQuantity: boolean
  predefinedOptions: QuantityOption[]
  isActive: boolean
  sortOrder: number
  unit: string
  rating: number
  stock: number
  description: string
  descriptionTa?: string
  benefits: string
  benefitsTa?: string
  image: string
  imageUrl?: string
  source?: 'catalogue' | 'manual'
  note?: string | null
  hasVariants?: boolean
  itemType?: 'product' | 'service'

  // POS inventory fields
  sku?: string
  barcode?: string
  brand?: string
  purchasePrice?: number
  mrp?: number
  gstPercent?: number
  openingStock?: number
  lowStockAlert?: number
  supplier?: string
  size?: string
  color?: string
}

export interface CartItem extends Product {
  qty: number
  selectedUnit: string
  basePrice: number
  lineTotal: number
  variantId?: string      // UUID of the selected variant row
  variantName?: string    // display name e.g. "Cycle Brand"
  parentProductId?: string // original products.id when item was created from a variant

  // POS billing fields
  cartItemId: string
  discountType: 'amount' | 'percent'
  discountValue: number
  gstRate: number
  gstAmount: number
}

interface AuthUser {
  id: string
  name: string
  email: string
  mobile?: string
  role: 'admin' | 'customer'
  avatarUrl?: string
}

interface AuthState {
  user: AuthUser | null
  loading: boolean
  isAuthenticated: () => boolean
  isAdmin: () => boolean
  setAuth: (user: AuthUser | null) => void
  logout: () => Promise<void>
  initialize: () => Promise<void>
}

interface ProductState {
  products: Product[]
  loading: boolean
  error: string | null
  lastFetch: number
  fetchProducts: (force?: boolean) => Promise<void>
}

interface CartState {
  items: CartItem[]
  addItem: (product: Product, quantity: number, unit: string, variantId?: string, variantName?: string, parentProductId?: string) => void
  removeItem: (productId: string | number) => void
  updateQuantity: (productId: string | number, quantity: number) => void
  clearCart: () => void
  totalItems: () => number
  cartSubtotal: () => number
  // Backward-compatible aliases used by existing UI
  add: (product: Product) => void
  remove: (productId: string | number) => void
  updateQty: (productId: string | number, quantity: number) => void
  clear: () => void
  count: () => number
  total: () => number
}

interface FavState {
  items: Product[]
  toggle: (product: Product) => void
  isFav: (productId: string | number) => boolean
  clear: () => void
}

interface ProductModalState {
  product: Product | null
  open: boolean
  openProduct: (product: Product) => void
  closeProduct: () => void
}

export interface StoreSettings {
  name: string
  ownerName: string
  phone: string
  shopContactNumber: string
  email: string
  address: string
  businessType: string
  instagramId: string
  logoUrl: string
  gstEnabled: boolean
  themeColor: string
  lowStockThreshold: number
  expiryAlertDays: number
}

interface SettingsState {
  settings: StoreSettings | null
  loading: boolean
  fetchSettings: () => Promise<void>
  updateThemeColor: (hex: string) => Promise<boolean>
  saveSettings: (partial: Partial<StoreSettings>) => Promise<{ ok: boolean; error?: string }>
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ ok: boolean; error?: string }>
}

interface VariantStoreState {
  variantsMap: Record<string, ProductVariant[]>
  fetched: boolean
  fetchVariants: () => Promise<void>
  refetchVariants: () => Promise<void>
  getVariants: (productId: string) => ProductVariant[]
  getDefaultVariant: (productId: string) => ProductVariant | null
  hasVariants: (productId: string | number) => boolean
}

interface VariantModalState {
  product: Product | null
  open: boolean
  openVariantModal: (product: Product) => void
  closeVariantModal: () => void
}

type SessionFallback = {
  id?: string
  email?: string | null
  phone?: string | null
  user_metadata?: {
    name?: string
    mobile?: string
  }
}

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value === 'object' && value !== null) {
    return value as Record<string, unknown>
  }
  return {}
}

const readString = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback)

const LEGACY_CATEGORY_NAMES = new Set<string>()

const toAuthUser = (profile: unknown, fallback?: SessionFallback): AuthUser => {
  const profileRow = asRecord(profile)
  const fallbackMeta = asRecord(fallback?.user_metadata)
  const email = String(profileRow.email || fallback?.email || '')
  const isAdmin = profileRow.role === 'admin'

  return {
    id: String(profileRow.id || fallback?.id || ''),
    name: String(profileRow.name || fallbackMeta.name || fallback?.email || 'Customer'),
    email,
    mobile: String(profileRow.mobile || fallbackMeta.mobile || fallback?.phone || ''),
    role: isAdmin ? 'admin' : 'customer',
    avatarUrl: readString(profileRow.avatar_url) || undefined,
  }
}

const mapDbProduct = (input: unknown, categoriesById: Record<string, string> = {}): Product => {
  const p = asRecord(input)
  const categoryId = typeof p.category_id === 'string' || typeof p.category_id === 'number' ? p.category_id : null
  const image = readString(p.image_url) || readString(p.image) || '/product-placeholder.svg'
  const remedy = Array.isArray(p.remedy)
    ? p.remedy.filter((entry): entry is string => typeof entry === 'string')
    : []

  return {
    id: String(p.id || ''),
    name: readString(p.name, 'Product'),
    nameTa: readString(p.name_ta) || readString(p.tamil_name),
    tamilName: readString(p.tamil_name) || readString(p.name_ta),
    category: categoriesById[String(categoryId)] || (() => {
      const legacyCategory = readString(p.category).trim()
      return LEGACY_CATEGORY_NAMES.has(legacyCategory.toLowerCase()) ? '' : legacyCategory
    })(),
    categoryId,
    remedy,
    price: toNumber(p.price, 0),
    offerPrice: p.offer_price != null ? toNumber(p.offer_price, 0) : null,
    unitType: normalizeUnitType(p.unit_type, 'unit'),
    unitLabel: readString(p.unit_label, 'piece'),
    baseQuantity: toNumber(p.base_quantity, 1),
    stockQuantity: toNumber(p.stock_quantity, 0),
    stockUnit: readString(p.stock_unit, 'piece'),
    allowDecimalQuantity: Boolean(p.allow_decimal_quantity),
    predefinedOptions: Array.isArray(p.predefined_options) ? p.predefined_options as QuantityOption[] : [],
    isActive: p.is_active !== false,
    sortOrder: toNumber(p.sort_order, 0),
    unit: readString(p.unit, '100g'),
    rating: toNumber(p.rating, 4.7),
    stock: Math.floor(toNumber(p.stock_quantity ?? p.stock, 0)),
    description: readString(p.description),
    descriptionTa: readString(p.description_ta),
    benefits: readString(p.benefits),
    benefitsTa: readString(p.benefits_ta),
    image,
    imageUrl: image,
    hasVariants: Boolean(p.has_variants),
    itemType: p.item_type === 'service' ? 'service' : 'product',

    // POS inventory mapping
    sku: readString(p.sku),
    barcode: readString(p.barcode),
    brand: readString(p.brand),
    purchasePrice: toNumber(p.purchase_price, 0),
    mrp: toNumber(p.mrp, 0),
    gstPercent: toNumber(p.gst_percent, 0),
    openingStock: toNumber(p.opening_stock, 0),
    lowStockAlert: toNumber(p.low_stock_alert, 5),
    supplier: readString(p.supplier),
    size: readString(p.size),
    color: readString(p.color),
  }
}

// --- Auth Store ---
export const useAuthStore = create<AuthState>()(
  persist(
    (set, get): AuthState => ({
      user: null,
      loading: true,
      isAuthenticated: () => !!get().user,
      isAdmin: () => get().user?.role === 'admin',
      setAuth: (user: AuthUser | null) => set({ user, loading: false }),
      logout: async () => {
        await supabase.auth.signOut()
        set({ user: null, loading: false })
      },
      initialize: async () => {
        set({ loading: true })
        try {
          const { data: { session } } = await supabase.auth.getSession()
          if (session?.user) {
            let { data: profile } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', session.user.id)
              .single()

            const meta = session.user.user_metadata || {}
            const email = session.user.email || ''
            const metaName  = String(meta.full_name || meta.name || (email ? email.split('@')[0] : 'Customer'))
            const metaMobile = String(meta.mobile || meta.phone || '')

            if (!profile) {
              // Bootstrap profile for users signed up before the DB trigger existed
              const role = 'customer'
              const { data: upserted } = await supabase
                .from('profiles')
                .upsert({
                  id: session.user.id,
                  email,
                  name: metaName,
                  mobile: metaMobile,
                  role,
                }, { onConflict: 'id' })
                .select()
                .single()
              profile = upserted
            } else {
              // Profile exists — backfill missing fields from user_metadata
              // (handles users who signed up before phone field was added to the form)
              const needsUpdate: Record<string, string> = {}
              if (!profile.mobile && metaMobile) needsUpdate.mobile = metaMobile
              if (!profile.name   && metaName)   needsUpdate.name   = metaName
              if (!profile.email  && email)       needsUpdate.email  = email

              if (Object.keys(needsUpdate).length > 0) {
                const { data: updated } = await supabase
                  .from('profiles')
                  .update(needsUpdate)
                  .eq('id', session.user.id)
                  .select()
                  .single()
                if (updated) profile = updated
              }
            }

            set({ user: toAuthUser(profile, session.user) })
          } else {
            set({ user: null })
          }
        } catch (e) {
          console.error('Auth init error', e)
        } finally {
          set({ loading: false })
        }
      }
    }),
    { name: 'vasthraalayam-boutique-auth' }
  )
)

// --- Product Store ---
export const useProductStore = create<ProductState>((set, get) => ({
  products: [],
  loading: false,
  error: null,
  lastFetch: 0,
  fetchProducts: async (force = false) => {
    if (!force && Date.now() - get().lastFetch < 300000 && get().products.length > 0) return

    // Products/categories now come from the Neon-backed API (see neon/README.md),
    // not Supabase — fetchAllProducts/fetchAllCategories report their own errors.
    set({ loading: true, error: null })
    try {
      const [{ data, error }, { data: categoryData }] = await Promise.all([
        fetchAllProducts(),
        fetchAllCategories(),
      ])

      if (error) throw error

      const categoriesById = Object.fromEntries(
        (categoryData || []).map(category => [String(category.id), String(category.name_en || '').trim()]),
      )
      const normalized = (data || []).map(product => mapDbProduct(product, categoriesById))

      set({ products: normalized, loading: false, lastFetch: Date.now() })
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Unable to fetch products',
        loading: false,
      })
    }
  }
}))

// --- Cart Store ---
export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (product, qty, unit, variantId, variantName, parentProductId) => {
        const items = [...get().items]
        const existing = items.find(i => i.id === product.id)

        const basePrice = product.offerPrice || product.price
        const lineTotal = calculateLineTotal(qty, product.unitType, product.baseQuantity, basePrice)

        if (existing) {
          existing.selectedUnit = unit
          const mergedQty = normalizeSelectedQuantity(
            existing.qty + qty,
            existing.unitType,
            existing.allowDecimalQuantity,
            1,
          )
          existing.qty = mergedQty
          existing.lineTotal = calculateLineTotal(mergedQty, existing.unitType, existing.baseQuantity, basePrice)
        } else {
          items.push({
            ...product,
            qty,
            selectedUnit: unit,
            basePrice,
            lineTotal,
            // Variant identity — only set for variant items
            variantId:       variantId       ?? undefined,
            variantName:     variantName     ?? undefined,
            parentProductId: parentProductId ?? undefined,

            // POS defaults
            cartItemId: Date.now().toString() + Math.random().toString(36).substr(2, 5),
            discountType: 'amount',
            discountValue: 0,
            gstRate: product.gstPercent || 0,
            gstAmount: ((product.gstPercent || 0) > 0) ? (lineTotal * (product.gstPercent || 0) / 100) : 0,
          })
        }
        set({ items })
      },
      removeItem: (id) => set({ items: get().items.filter(i => i.id !== id) }),
      updateQuantity: (id, qty) => {
        const items = get().items.map(item => {
          if (item.id === id) {
            const newQty = normalizeSelectedQuantity(
              qty,
              item.unitType,
              item.allowDecimalQuantity,
              1,
            )
            return {
              ...item,
              qty: newQty,
              lineTotal: calculateLineTotal(newQty, item.unitType, item.baseQuantity, item.basePrice)
            }
          }
          return item
        })
        set({ items })
      },
      clearCart: () => set({ items: [] }),
      totalItems: () => get().items.length,
      cartSubtotal: () => get().items.reduce((sum, item) => sum + item.lineTotal, 0),
      add: (product) => {
        const packLabel = product.predefinedOptions[0]?.label ?? product.unitLabel
        get().addItem(product, 1, packLabel)
      },
      remove: (productId) => get().removeItem(productId),
      updateQty: (productId, quantity) => get().updateQuantity(productId, quantity),
      clear: () => get().clearCart(),
      count: () => get().totalItems(),
      total: () => get().cartSubtotal(),
    }),
    { name: 'vasthraalayam-boutique-cart' }
  )
)

export const useFavStore = create<FavState>()(
  persist(
    (set, get) => ({
      items: [],
      toggle: (product) => {
        const exists = get().items.some((p) => p.id === product.id)
        if (exists) {
          set({ items: get().items.filter((p) => p.id !== product.id) })
          return
        }
        set({ items: [...get().items, product] })
      },
      isFav: (productId) => get().items.some((p) => p.id === productId),
      clear: () => set({ items: [] }),
    }),
    { name: 'vasthraalayam-boutique-favorites' },
  ),
)

export const useProductModalStore = create<ProductModalState>()((set) => ({
  product: null,
  open: false,
  openProduct: (product) => set({ product, open: true }),
  closeProduct: () => set({ open: false, product: null }),
}))

// --- Variant Store ---
export const useVariantStore = create<VariantStoreState>()((set, get) => ({
  variantsMap: {},
  fetched: false,
  fetchVariants: async () => {
    if (get().fetched) return
    const { data } = await fetchAllVariants()
    const map: Record<string, ProductVariant[]> = {}
    for (const v of data) {
      if (!map[v.productId]) map[v.productId] = []
      map[v.productId].push(v)
    }
    set({ variantsMap: map, fetched: true })
  },
  refetchVariants: async () => {
    set({ fetched: false })
    const { data } = await fetchAllVariants()
    const map: Record<string, ProductVariant[]> = {}
    for (const v of data) {
      if (!map[v.productId]) map[v.productId] = []
      map[v.productId].push(v)
    }
    set({ variantsMap: map, fetched: true })
  },
  getVariants: (productId) => get().variantsMap[String(productId)] || [],
  getDefaultVariant: (productId) => {
    const variants = get().variantsMap[String(productId)] || []
    return variants.find(v => v.isDefault) || variants[0] || null
  },
  hasVariants: (productId) => (get().variantsMap[String(productId)] || []).length > 0,
}))

// --- Variant Selector Modal Store ---
export const useVariantModalStore = create<VariantModalState>()((set) => ({
  product: null,
  open: false,
  openVariantModal: (product) => set({ product, open: true }),
  closeVariantModal: () => set({ open: false, product: null }),
}))

// --- Store Settings State ---
const mapStoreSettings = (data: Record<string, unknown>): StoreSettings => ({
  name: String(data.name || ''),
  ownerName: String(data.owner_name || ''),
  phone: String(data.phone || ''),
  shopContactNumber: String(data.shop_contact_number || ''),
  email: String(data.email || ''),
  address: String(data.address || ''),
  businessType: String(data.business_type || ''),
  instagramId: String(data.instagram_id || ''),
  logoUrl: String(data.logo_url || ''),
  gstEnabled: Boolean(data.gst_enabled),
  themeColor: String(data.theme_color || DEFAULT_THEME_COLOR),
  lowStockThreshold: toNumber(data.low_stock_threshold, 5),
  expiryAlertDays: toNumber(data.expiry_alert_days, 30),
})

const STORE_SETTINGS_FIELD_TO_COLUMN: Record<keyof StoreSettings, string> = {
  name: 'name',
  ownerName: 'owner_name',
  phone: 'phone',
  shopContactNumber: 'shop_contact_number',
  email: 'email',
  address: 'address',
  businessType: 'business_type',
  instagramId: 'instagram_id',
  logoUrl: 'logo_url',
  gstEnabled: 'gst_enabled',
  themeColor: 'theme_color',
  lowStockThreshold: 'low_stock_threshold',
  expiryAlertDays: 'expiry_alert_days',
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  settings: null,
  loading: false,
  fetchSettings: async () => {
    set({ loading: true })
    const { data, error } = await neonApi.get<Record<string, unknown>>('/settings')
    if (!error && data) {
      const mapped = mapStoreSettings(data)
      applyThemeColor(mapped.themeColor)
      set({ settings: mapped, loading: false })
      return
    }
    // Fallback/Demo settings
    applyThemeColor(DEFAULT_THEME_COLOR)
    set({
      settings: {
        name: BRAND_EN,
        ownerName: BRAND_EN,
        phone: BRAND_PHONE_DISPLAY,
        shopContactNumber: '',
        email: '',
        address: BRAND_ADDRESS,
        businessType: '',
        instagramId: '',
        logoUrl: '',
        gstEnabled: false,
        themeColor: DEFAULT_THEME_COLOR,
        lowStockThreshold: 5,
        expiryAlertDays: 30,
      },
      loading: false
    })
  },
  updateThemeColor: async (hex) => {
    const result = await get().saveSettings({ themeColor: hex })
    return result.ok
  },
  saveSettings: async (partial) => {
    const body: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(partial)) {
      const column = STORE_SETTINGS_FIELD_TO_COLUMN[key as keyof StoreSettings]
      if (column) body[column] = value
    }
    const { data, error } = await neonApi.put<Record<string, unknown>>('/settings', body)
    if (error || !data) return { ok: false, error: error?.message || 'Failed to save settings' }
    const mapped = mapStoreSettings(data)
    applyThemeColor(mapped.themeColor)
    set({ settings: mapped })
    return { ok: true }
  },
  changePassword: async (currentPassword, newPassword) => {
    const { error } = await neonApi.put<{ success: boolean }>('/settings/password', { currentPassword, newPassword })
    if (error) return { ok: false, error: error.message || 'Failed to change password' }
    return { ok: true }
  },
}))

// --- Admin Auth Store ---
export type AdminRole = 'admin' | 'staff' | null

interface AdminAuthState {
  isLoggedIn: boolean
  role: AdminRole
  adminId: string | null
  sessionToken: string | null
  sessionExpiresAt: number | null
  login: (portalId: string, password: string) => Promise<AdminRole | false>
  logout: () => void
}

export const useAdminAuthStore = create<AdminAuthState>()(
  persist(
    (set) => ({
      isLoggedIn: false,
      role: null,
      adminId: null,
      sessionToken: null,
      sessionExpiresAt: null,
      login: async (portalId: string, password: string) => {
        const trimmedId = String(portalId || '').trim()
        const trimmedPass = String(password || '').trim()
        if (!trimmedId || !trimmedPass) return false

        // Credentials are verified server-side (api/auth/login.ts) against
        // env vars that are never sent to the browser — this used to be a
        // client-side comparison against VITE_ADMIN_ID/VITE_ADMIN_PASSWORD,
        // which meant the real password shipped in the public JS bundle.
        const { data, error } = await authLogin(trimmedId, trimmedPass)
        if (error || !data) return false

        useAlarmStore.getState().resetSilencedState()
        set({
          isLoggedIn: true,
          role: data.role,
          adminId: trimmedId,
          sessionToken: data.token,
          sessionExpiresAt: data.expiresAt,
        })
        return data.role
      },
      logout: () => {
        alarmSound.stopAlert()
        useAlarmStore.getState().resetSilencedState()
        set({ isLoggedIn: false, role: null, adminId: null, sessionToken: null, sessionExpiresAt: null })
      },
    }),
    {
      name: 'vasthraalayam-boutique-admin-session',
      // Using sessionStorage so the session is cleared when the tab is closed
      storage: {
        getItem: (name) => {
          const str = sessionStorage.getItem(name)
          if (!str) return null
          return JSON.parse(str)
        },
        setItem: (name, value) => {
          sessionStorage.setItem(name, JSON.stringify(value))
        },
        removeItem: (name) => {
          sessionStorage.removeItem(name)
        }
      }
    }
  )
)

// Keep the Neon API client's bearer token in sync with the store — on every
// login/logout, and once immediately here for state already rehydrated from
// sessionStorage when this module loads.
useAdminAuthStore.subscribe((state) => setNeonSessionToken(state.sessionToken))
setNeonSessionToken(useAdminAuthStore.getState().sessionToken)
