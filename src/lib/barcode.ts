import JsBarcode from 'jsbarcode'
import { QRCodeWriter, BarcodeFormat } from '@zxing/library'
import { jsPDF } from 'jspdf'
import { neonApi } from './neonApi'
import { BRAND_EN } from './brand'
import { formatCurrency } from './retail'

/** Normalize any scanned or user-entered barcode to a consistent UPPERCASE trimmed string. */
export const normalizeBarcode = (code: string | null | undefined): string => {
  return (code ?? '').trim().toUpperCase()
}

export type LabelCategory =
  | 'Small Tags'
  | 'Retail Labels'
  | 'Shipping'
  | 'Roll Layouts'
  | 'A4 Sheets'
  | 'Custom Sizes'

export type PrinterType = 'label' | 'receipt' | 'sheet' | 'pdf'
export type BarcodeType = 'CODE128' | 'EAN13' | 'UPC' | 'QR'
export type RotationAngle = 0 | 90 | 180 | 270
export type OrientationType = 'portrait' | 'landscape'

export interface LabelSizeConfig {
  id: string
  width_mm: number
  height_mm: number
  columns: number
  rows?: number
  gap_mm: number // Horizontal gap
  gap_y_mm?: number // Vertical gap
  margin_top_mm?: number
  margin_bottom_mm?: number
  margin_left_mm?: number
  margin_right_mm?: number
  label: string
  use_case: string
  category: LabelCategory
  business_id?: string
  isCustom?: boolean
  isSheet?: boolean

  // CamelCase compatibility aliases for existing codebase
  name: string
  widthMm: number
  heightMm: number
  labelsPerRow: number
  horizontalGapMm: number
  created_at?: string
  updated_at?: string
}

export function createLabelConfig(entry: {
  id: string
  width_mm: number
  height_mm: number
  columns: number
  rows?: number
  gap_mm: number
  gap_y_mm?: number
  margin_top_mm?: number
  margin_bottom_mm?: number
  margin_left_mm?: number
  margin_right_mm?: number
  label: string
  use_case: string
  category: LabelCategory
  business_id?: string
  isCustom?: boolean
  isSheet?: boolean
  created_at?: string
  updated_at?: string
}): LabelSizeConfig {
  return {
    id: entry.id,
    width_mm: entry.width_mm,
    height_mm: entry.height_mm,
    columns: entry.columns,
    rows: entry.rows ?? 1,
    gap_mm: entry.gap_mm,
    gap_y_mm: entry.gap_y_mm ?? 0,
    margin_top_mm: entry.margin_top_mm ?? 0,
    margin_bottom_mm: entry.margin_bottom_mm ?? 0,
    margin_left_mm: entry.margin_left_mm ?? 0,
    margin_right_mm: entry.margin_right_mm ?? 0,
    label: entry.label,
    use_case: entry.use_case,
    category: entry.category,
    business_id: entry.business_id,
    isCustom: entry.isCustom,
    isSheet: entry.isSheet,
    // CamelCase aliases
    name: entry.label,
    widthMm: entry.width_mm,
    heightMm: entry.height_mm,
    labelsPerRow: entry.columns,
    horizontalGapMm: entry.gap_mm,
    created_at: entry.created_at,
    updated_at: entry.updated_at,
  }
}

/**
 * Standard label size list config array.
 * Grouped into: Small Tags, Retail Labels, Shipping, Roll Layouts, A4 Sheets.
 */
export const DEFAULT_LABEL_SIZES: LabelSizeConfig[] = [
  // --- Small Tags ---
  createLabelConfig({
    id: 'tag_25x15',
    width_mm: 25,
    height_mm: 15,
    columns: 1,
    gap_mm: 0,
    label: '25 × 15 mm (Mini Tag)',
    use_case: 'Mini Tag',
    category: 'Small Tags',
  }),
  createLabelConfig({
    id: 'tag_30x20',
    width_mm: 30,
    height_mm: 20,
    columns: 1,
    gap_mm: 0,
    label: '30 × 20 mm (Small Tag)',
    use_case: 'Small Tag',
    category: 'Small Tags',
  }),
  createLabelConfig({
    id: 'tag_32x19',
    width_mm: 32,
    height_mm: 19,
    columns: 1,
    gap_mm: 0,
    label: '32 × 19 mm (Jewelry / Price Tag)',
    use_case: 'Jewelry / Price Tag',
    category: 'Small Tags',
  }),
  createLabelConfig({
    id: '2_38x25', // Default standard
    width_mm: 38,
    height_mm: 25,
    columns: 1,
    gap_mm: 0,
    label: '38 × 25 mm (Tag / Jewelry)',
    use_case: 'Tag / Jewelry',
    category: 'Small Tags',
  }),
  createLabelConfig({
    id: 'tag_40x30',
    width_mm: 40,
    height_mm: 30,
    columns: 1,
    gap_mm: 0,
    label: '40 × 30 mm (Garment Tag)',
    use_case: 'Garment Tag',
    category: 'Small Tags',
  }),

  // --- Retail Labels ---
  createLabelConfig({
    id: '1_50x25',
    width_mm: 50,
    height_mm: 25,
    columns: 1,
    gap_mm: 0,
    label: '50 × 25 mm (Standard Compact)',
    use_case: 'Standard Compact',
    category: 'Retail Labels',
  }),
  createLabelConfig({
    id: 'retail_50x30',
    width_mm: 50,
    height_mm: 30,
    columns: 1,
    gap_mm: 0,
    label: '50 × 30 mm (Standard)',
    use_case: 'Standard',
    category: 'Retail Labels',
  }),
  createLabelConfig({
    id: '2_50x25',
    width_mm: 50,
    height_mm: 38,
    columns: 1,
    gap_mm: 0,
    label: '50 × 38 mm (Retail Standard)',
    use_case: 'Retail Standard',
    category: 'Retail Labels',
  }),
  createLabelConfig({
    id: '1_60x40',
    width_mm: 60,
    height_mm: 40,
    columns: 1,
    gap_mm: 0,
    label: '60 × 40 mm (Shipping / Product)',
    use_case: 'Shipping / Product',
    category: 'Retail Labels',
  }),

  // --- Shipping ---
  createLabelConfig({
    id: 'ship_75x50',
    width_mm: 75,
    height_mm: 50,
    columns: 1,
    gap_mm: 0,
    label: '75 × 50 mm (Medium Box)',
    use_case: 'Medium Box',
    category: 'Shipping',
  }),
  createLabelConfig({
    id: '1_100x50',
    width_mm: 100,
    height_mm: 50,
    columns: 1,
    gap_mm: 0,
    label: '100 × 50 mm (Large Carton / Box)',
    use_case: 'Large Carton / Box',
    category: 'Shipping',
  }),
  createLabelConfig({
    id: 'ship_100x75',
    width_mm: 100,
    height_mm: 75,
    columns: 1,
    gap_mm: 0,
    label: '100 × 75 mm (Large Product)',
    use_case: 'Large Product',
    category: 'Shipping',
  }),
  createLabelConfig({
    id: 'ship_100x100',
    width_mm: 100,
    height_mm: 100,
    columns: 1,
    gap_mm: 0,
    label: '100 × 100 mm (Square Shipping)',
    use_case: 'Square Shipping',
    category: 'Shipping',
  }),
  createLabelConfig({
    id: 'ship_100x150',
    width_mm: 100,
    height_mm: 150,
    columns: 1,
    gap_mm: 0,
    label: '100 × 150 mm (4×6 in Courier / Shipping)',
    use_case: '4×6 in Courier / Shipping',
    category: 'Shipping',
  }),

  // --- Roll Layouts ---
  createLabelConfig({
    id: 'roll_38x25x2',
    width_mm: 38,
    height_mm: 25,
    columns: 2,
    gap_mm: 2,
    label: '38 × 25 mm × 2 (2-Up Roll)',
    use_case: '2-Up Roll',
    category: 'Roll Layouts',
  }),
  createLabelConfig({
    id: '2up_50x25',
    width_mm: 50,
    height_mm: 25,
    columns: 2,
    gap_mm: 2,
    label: '50 × 25 mm × 2 (2-Up Roll)',
    use_case: '2-Up Roll',
    category: 'Roll Layouts',
  }),
  createLabelConfig({
    id: '2up_50x30',
    width_mm: 50,
    height_mm: 30,
    columns: 2,
    gap_mm: 2,
    label: '50 × 30 mm × 2 (2-Up Roll)',
    use_case: '2-Up Roll',
    category: 'Roll Layouts',
  }),
  createLabelConfig({
    id: 'roll_40x30x3',
    width_mm: 40,
    height_mm: 30,
    columns: 3,
    gap_mm: 2,
    label: '40 × 30 mm × 3 (3-Up Roll)',
    use_case: '3-Up Roll',
    category: 'Roll Layouts',
  }),
  createLabelConfig({
    id: 'roll_33x21x3',
    width_mm: 33,
    height_mm: 21,
    columns: 3,
    gap_mm: 2,
    label: '33 × 21 mm × 3 (3-Up Roll)',
    use_case: '3-Up Roll',
    category: 'Roll Layouts',
  }),

  // --- A4 Sheets ---
  createLabelConfig({
    id: 'sheet_24up_64x34',
    width_mm: 64,
    height_mm: 34,
    columns: 3,
    rows: 8,
    gap_mm: 2.5,
    gap_y_mm: 0,
    margin_top_mm: 13.5,
    margin_left_mm: 7,
    label: '24-Up Sheet (64 × 34 mm)',
    use_case: '3×8 A4 Sheet',
    category: 'A4 Sheets',
    isSheet: true,
  }),
  createLabelConfig({
    id: 'sheet_21up_63x38',
    width_mm: 63.5,
    height_mm: 38.1,
    columns: 3,
    rows: 7,
    gap_mm: 2.5,
    gap_y_mm: 0,
    margin_top_mm: 15,
    margin_left_mm: 7,
    label: '21-Up Sheet (63.5 × 38.1 mm)',
    use_case: '3×7 A4 Sheet',
    category: 'A4 Sheets',
    isSheet: true,
  }),
  createLabelConfig({
    id: 'sheet_65up_38x21',
    width_mm: 38.1,
    height_mm: 21.2,
    columns: 5,
    rows: 13,
    gap_mm: 2.5,
    gap_y_mm: 0,
    margin_top_mm: 10.7,
    margin_left_mm: 4.5,
    label: '65-Up Sheet (38.1 × 21.2 mm)',
    use_case: '5×13 A4 Sheet',
    category: 'A4 Sheets',
    isSheet: true,
  }),
  createLabelConfig({
    id: 'sheet_40up_52x29',
    width_mm: 52.5,
    height_mm: 29.7,
    columns: 4,
    rows: 10,
    gap_mm: 0,
    gap_y_mm: 0,
    margin_top_mm: 0,
    margin_left_mm: 0,
    label: '40-Up Sheet (52.5 × 29.7 mm)',
    use_case: '4×10 A4 Sheet',
    category: 'A4 Sheets',
    isSheet: true,
  }),
]

export interface PrinterProfile {
  id: string
  business_id?: string
  name: string
  is_default?: boolean
  printer_type: PrinterType
  size_id: string
  orientation: OrientationType
  rotation: RotationAngle
  margin_top_mm: number
  margin_right_mm: number
  margin_bottom_mm: number
  margin_left_mm: number
  gap_x_mm: number
  gap_y_mm: number
  offset_x_mm: number // -5 to +5 mm
  offset_y_mm: number // -5 to +5 mm
  barcode_type: BarcodeType
  font_scale: number // 0.8 to 1.5
  barcode_height_scale: number // 0.5 to 1.5
  show_product_name: boolean
  show_price: boolean
  show_sku: boolean
  show_mrp: boolean
  show_variant: boolean
  show_business_name: boolean
  show_date: boolean
  sheet_start_position?: number
  created_at?: string
  updated_at?: string
}

export const DEFAULT_PRINTER_PROFILE: PrinterProfile = {
  id: 'default_label_profile',
  name: 'Standard Thermal 38×25',
  is_default: true,
  printer_type: 'label',
  size_id: '2_38x25',
  orientation: 'portrait',
  rotation: 0,
  margin_top_mm: 0,
  margin_right_mm: 0,
  margin_bottom_mm: 0,
  margin_left_mm: 0,
  gap_x_mm: 2,
  gap_y_mm: 0,
  offset_x_mm: 0,
  offset_y_mm: 0,
  barcode_type: 'CODE128',
  font_scale: 1.0,
  barcode_height_scale: 1.0,
  show_product_name: true,
  show_price: true,
  show_sku: true,
  show_mrp: false,
  show_variant: true,
  show_business_name: true,
  show_date: false,
  sheet_start_position: 1,
}

export interface BarcodeSettings {
  printerType: 'label' | 'regular' | 'receipt' | 'sheet' | 'pdf'
  selectedSizeId: string
  selectedProfileId?: string
  showSalePrice: boolean
  showCompanyName: boolean
  showItemName: boolean
  showDiscount: boolean
  profile?: PrinterProfile
}

export const DEFAULT_BARCODE_SETTINGS: BarcodeSettings = {
  printerType: 'label',
  selectedSizeId: '2_38x25',
  selectedProfileId: 'default_label_profile',
  showSalePrice: true,
  showCompanyName: true,
  showItemName: true,
  showDiscount: false,
  profile: DEFAULT_PRINTER_PROFILE,
}

const SETTINGS_KEY = 'vasthraalayam_barcode_settings'
const CUSTOM_SIZES_KEY = 'vasthraalayam_custom_label_sizes'
const PROFILES_KEY = 'vasthraalayam_printer_profiles'
const BUSINESS_ID_KEY = 'vasthraalayam_business_id'

export function getCurrentBusinessId(): string {
  try {
    return localStorage.getItem(BUSINESS_ID_KEY) || '1'
  } catch {
    return '1'
  }
}

export function setCurrentBusinessId(businessId: string): void {
  try {
    localStorage.setItem(BUSINESS_ID_KEY, businessId)
  } catch (e) {
    console.error('Failed to set business ID:', e)
  }
}

export function getStoredBarcodeSettings(businessId?: string): BarcodeSettings {
  const bizId = businessId || getCurrentBusinessId()
  const bizKey = `${SETTINGS_KEY}_${bizId}`
  try {
    const rawBiz = localStorage.getItem(bizKey)
    if (rawBiz) return { ...DEFAULT_BARCODE_SETTINGS, ...JSON.parse(rawBiz) }

    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) return { ...DEFAULT_BARCODE_SETTINGS, ...JSON.parse(raw) }
  } catch (e) {
    console.error('Failed to parse barcode settings:', e)
  }
  return DEFAULT_BARCODE_SETTINGS
}

export function saveStoredBarcodeSettings(settings: BarcodeSettings, businessId?: string): void {
  const bizId = businessId || getCurrentBusinessId()
  const bizKey = `${SETTINGS_KEY}_${bizId}`
  try {
    localStorage.setItem(bizKey, JSON.stringify(settings))
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch (e) {
    console.error('Failed to save barcode settings:', e)
  }
}

// ==================== CUSTOM LABEL SIZES ====================

export function getStoredCustomSizes(businessId?: string): LabelSizeConfig[] {
  const bizId = businessId || getCurrentBusinessId()
  const bizKey = `${CUSTOM_SIZES_KEY}_${bizId}`
  try {
    const rawBiz = localStorage.getItem(bizKey)
    if (rawBiz) {
      const parsed = JSON.parse(rawBiz)
      return parsed.map((item: any) =>
        createLabelConfig({
          ...item,
          columns: item.columns ?? item.labelsPerRow ?? 1,
          rows: item.rows ?? 1,
          gap_mm: item.gap_mm ?? item.horizontalGapMm ?? 0,
          label: item.name || item.label || 'Custom Size',
          use_case: 'Custom Size',
          category: 'Custom Sizes',
          isCustom: true,
          business_id: bizId,
        })
      )
    }

    const raw = localStorage.getItem(CUSTOM_SIZES_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return parsed.map((item: any) =>
        createLabelConfig({
          ...item,
          columns: item.columns ?? item.labelsPerRow ?? 1,
          rows: item.rows ?? 1,
          gap_mm: item.gap_mm ?? item.horizontalGapMm ?? 0,
          label: item.name || item.label || 'Custom Size',
          use_case: 'Custom Size',
          category: 'Custom Sizes',
          isCustom: true,
          business_id: bizId,
        })
      )
    }
  } catch (e) {
    console.error('Failed to parse custom label sizes:', e)
  }
  return []
}

export function saveStoredCustomSizesLocally(sizes: LabelSizeConfig[], businessId?: string): void {
  const bizId = businessId || getCurrentBusinessId()
  const bizKey = `${CUSTOM_SIZES_KEY}_${bizId}`
  try {
    localStorage.setItem(bizKey, JSON.stringify(sizes))
  } catch (e) {
    console.error('Failed to save custom label sizes locally:', e)
  }
}

export async function fetchCustomSizesFromDb(
  businessId?: string
): Promise<{ sizes: LabelSizeConfig[]; lastUsedSizeId: string | null }> {
  const bizId = businessId || getCurrentBusinessId()
  try {
    const res = await neonApi.get<LabelSizeConfig[]>(`/custom-label-sizes?business_id=${encodeURIComponent(bizId)}`)
    if (res.data) {
      const formatted = res.data.map((item: any) =>
        createLabelConfig({
          id: item.id,
          width_mm: Number(item.width_mm ?? item.widthMm),
          height_mm: Number(item.height_mm ?? item.heightMm),
          columns: Number(item.columns ?? item.labelsPerRow ?? 1),
          rows: Number(item.rows || 1),
          gap_mm: Number(item.gap_mm ?? item.horizontalGapMm ?? 0),
          gap_y_mm: Number(item.gap_y_mm || 0),
          margin_top_mm: Number(item.margin_top_mm || 0),
          margin_bottom_mm: Number(item.margin_bottom_mm || 0),
          margin_left_mm: Number(item.margin_left_mm || 0),
          margin_right_mm: Number(item.margin_right_mm || 0),
          label: item.name || item.label,
          use_case: 'Custom Size',
          category: 'Custom Sizes',
          business_id: bizId,
          isCustom: true,
          created_at: item.created_at,
          updated_at: item.updated_at,
        })
      )
      saveStoredCustomSizesLocally(formatted, bizId)
      const lastUsed = (res.meta?.lastUsedSizeId as string | undefined) || null
      return { sizes: formatted, lastUsedSizeId: lastUsed }
    }
  } catch (err) {
    console.warn('[barcode] Failed to fetch custom sizes from DB, using cached:', err)
  }
  return { sizes: getStoredCustomSizes(bizId), lastUsedSizeId: null }
}

export async function createCustomSizeInDb(
  sizeData: {
    name: string
    width_mm: number
    height_mm: number
    columns: number
    rows?: number
    gap_mm: number
    gap_y_mm?: number
    margin_top_mm?: number
    margin_bottom_mm?: number
    margin_left_mm?: number
    margin_right_mm?: number
  },
  businessId?: string
): Promise<LabelSizeConfig> {
  const bizId = businessId || getCurrentBusinessId()
  const payload = {
    ...sizeData,
    business_id: bizId,
  }

  const res = await neonApi.post<Record<string, unknown>>('/custom-label-sizes', payload)
  let created: LabelSizeConfig
  if (res.data) {
    const raw = res.data
    created = createLabelConfig({
      id: String(raw.id),
      width_mm: Number(raw.width_mm),
      height_mm: Number(raw.height_mm),
      columns: Number(raw.columns || 1),
      rows: Number(raw.rows || 1),
      gap_mm: Number(raw.gap_mm || 0),
      gap_y_mm: Number(raw.gap_y_mm || 0),
      margin_top_mm: Number(raw.margin_top_mm || 0),
      margin_bottom_mm: Number(raw.margin_bottom_mm || 0),
      margin_left_mm: Number(raw.margin_left_mm || 0),
      margin_right_mm: Number(raw.margin_right_mm || 0),
      label: String(raw.name || raw.label),
      use_case: 'Custom Size',
      category: 'Custom Sizes',
      business_id: bizId,
      isCustom: true,
      created_at: raw.created_at ? String(raw.created_at) : undefined,
      updated_at: raw.updated_at ? String(raw.updated_at) : undefined,
    })
  } else {
    created = createLabelConfig({
      id: `custom_${Date.now()}`,
      width_mm: sizeData.width_mm,
      height_mm: sizeData.height_mm,
      columns: sizeData.columns,
      rows: sizeData.rows || 1,
      gap_mm: sizeData.gap_mm,
      gap_y_mm: sizeData.gap_y_mm || 0,
      margin_top_mm: sizeData.margin_top_mm || 0,
      margin_bottom_mm: sizeData.margin_bottom_mm || 0,
      margin_left_mm: sizeData.margin_left_mm || 0,
      margin_right_mm: sizeData.margin_right_mm || 0,
      label: sizeData.name,
      use_case: 'Custom Size',
      category: 'Custom Sizes',
      business_id: bizId,
      isCustom: true,
    })
  }

  const current = getStoredCustomSizes(bizId).filter((s) => s.id !== created.id)
  saveStoredCustomSizesLocally([...current, created], bizId)
  return created
}

export async function updateCustomSizeInDb(
  size: LabelSizeConfig,
  businessId?: string
): Promise<LabelSizeConfig> {
  const bizId = businessId || getCurrentBusinessId()
  const payload = {
    id: size.id,
    name: size.label || size.name,
    width_mm: size.width_mm,
    height_mm: size.height_mm,
    columns: size.columns,
    rows: size.rows || 1,
    gap_mm: size.gap_mm,
    gap_y_mm: size.gap_y_mm || 0,
    margin_top_mm: size.margin_top_mm || 0,
    margin_bottom_mm: size.margin_bottom_mm || 0,
    margin_left_mm: size.margin_left_mm || 0,
    margin_right_mm: size.margin_right_mm || 0,
    business_id: bizId,
  }

  const res = await neonApi.put<Record<string, unknown>>('/custom-label-sizes', payload)
  let updated: LabelSizeConfig
  if (res.data) {
    const raw = res.data
    updated = createLabelConfig({
      id: String(raw.id),
      width_mm: Number(raw.width_mm),
      height_mm: Number(raw.height_mm),
      columns: Number(raw.columns || 1),
      rows: Number(raw.rows || 1),
      gap_mm: Number(raw.gap_mm || 0),
      gap_y_mm: Number(raw.gap_y_mm || 0),
      margin_top_mm: Number(raw.margin_top_mm || 0),
      margin_bottom_mm: Number(raw.margin_bottom_mm || 0),
      margin_left_mm: Number(raw.margin_left_mm || 0),
      margin_right_mm: Number(raw.margin_right_mm || 0),
      label: String(raw.name || raw.label),
      use_case: 'Custom Size',
      category: 'Custom Sizes',
      business_id: bizId,
      isCustom: true,
      created_at: raw.created_at ? String(raw.created_at) : undefined,
      updated_at: raw.updated_at ? String(raw.updated_at) : undefined,
    })
  } else {
    updated = size
  }

  const current = getStoredCustomSizes(bizId).map((s) => (s.id === updated.id ? updated : s))
  saveStoredCustomSizesLocally(current, bizId)
  return updated
}

export async function deleteCustomSizeInDb(id: string, businessId?: string): Promise<boolean> {
  const bizId = businessId || getCurrentBusinessId()
  try {
    await neonApi.delete(`/custom-label-sizes?id=${encodeURIComponent(id)}&business_id=${encodeURIComponent(bizId)}`)
  } catch (err) {
    console.warn('[barcode] Failed to delete custom size from DB, removing locally:', err)
  }

  const current = getStoredCustomSizes(bizId).filter((s) => s.id !== id)
  saveStoredCustomSizesLocally(current, bizId)
  return true
}

export async function saveLastUsedSizeId(sizeId: string, businessId?: string): Promise<void> {
  const bizId = businessId || getCurrentBusinessId()
  const currentSettings = getStoredBarcodeSettings(bizId)
  const updatedSettings = { ...currentSettings, selectedSizeId: sizeId }
  saveStoredBarcodeSettings(updatedSettings, bizId)

  try {
    await neonApi.put('/custom-label-sizes', {
      action: 'set_last_used',
      last_used_size_id: sizeId,
      business_id: bizId,
    })
  } catch (err) {
    console.warn('[barcode] Failed to persist last used size to DB:', err)
  }
}

export function saveStoredCustomSize(size: LabelSizeConfig, businessId?: string): LabelSizeConfig[] {
  const bizId = businessId || getCurrentBusinessId()
  const existing = getStoredCustomSizes(bizId).filter((s) => s.id !== size.id)
  const formatted = createLabelConfig({
    ...size,
    category: 'Custom Sizes',
    isCustom: true,
    business_id: bizId,
  })
  const updated = [...existing, formatted]
  saveStoredCustomSizesLocally(updated, bizId)
  return updated
}

export function getAllLabelSizes(customSizes?: LabelSizeConfig[]): LabelSizeConfig[] {
  const customs = customSizes || getStoredCustomSizes()
  return [...DEFAULT_LABEL_SIZES, ...customs]
}

// ==================== PRINTER PROFILES ====================

export function getStoredPrinterProfiles(businessId?: string): PrinterProfile[] {
  const bizId = businessId || getCurrentBusinessId()
  const bizKey = `${PROFILES_KEY}_${bizId}`
  try {
    const rawBiz = localStorage.getItem(bizKey)
    if (rawBiz) return JSON.parse(rawBiz)
  } catch (e) {
    console.error('Failed to parse printer profiles from localStorage:', e)
  }
  return [DEFAULT_PRINTER_PROFILE]
}

export function saveStoredPrinterProfilesLocally(profiles: PrinterProfile[], businessId?: string): void {
  const bizId = businessId || getCurrentBusinessId()
  const bizKey = `${PROFILES_KEY}_${bizId}`
  try {
    localStorage.setItem(bizKey, JSON.stringify(profiles))
  } catch (e) {
    console.error('Failed to save printer profiles locally:', e)
  }
}

export async function fetchPrinterProfilesFromDb(
  businessId?: string
): Promise<{ profiles: PrinterProfile[]; lastUsedProfileId: string | null }> {
  const bizId = businessId || getCurrentBusinessId()
  try {
    const res = await neonApi.get<PrinterProfile[]>(`/printer-profiles?business_id=${encodeURIComponent(bizId)}`)
    if (res.data && Array.isArray(res.data) && res.data.length > 0) {
      saveStoredPrinterProfilesLocally(res.data, bizId)
      const lastUsed = (res.meta?.lastUsedProfileId as string | undefined) || null
      return { profiles: res.data, lastUsedProfileId: lastUsed }
    }
  } catch (err) {
    console.warn('[barcode] Failed to fetch printer profiles from DB, using cached:', err)
  }
  return { profiles: getStoredPrinterProfiles(bizId), lastUsedProfileId: null }
}

export async function createPrinterProfileInDb(
  profileData: Partial<PrinterProfile>,
  businessId?: string
): Promise<PrinterProfile> {
  const bizId = businessId || getCurrentBusinessId()
  const payload = {
    ...DEFAULT_PRINTER_PROFILE,
    ...profileData,
    id: `profile_${Date.now()}`,
    business_id: bizId,
  }

  const res = await neonApi.post<PrinterProfile>('/printer-profiles', payload)
  const created = res.data || (payload as PrinterProfile)
  const current = getStoredPrinterProfiles(bizId).filter((p) => p.id !== created.id)
  saveStoredPrinterProfilesLocally([...current, created], bizId)
  return created
}

export async function updatePrinterProfileInDb(
  profile: PrinterProfile,
  businessId?: string
): Promise<PrinterProfile> {
  const bizId = businessId || getCurrentBusinessId()
  const payload = {
    ...profile,
    business_id: bizId,
  }

  const res = await neonApi.put<PrinterProfile>('/printer-profiles', payload)
  if (res.error) {
    throw new Error(res.error instanceof Error ? res.error.message : String(res.error))
  }
  const updated = res.data || profile
  const current = getStoredPrinterProfiles(bizId).map((p) => (p.id === updated.id ? updated : p))
  saveStoredPrinterProfilesLocally(current, bizId)
  return updated
}

export async function deletePrinterProfileInDb(
  id: string,
  businessId?: string
): Promise<{ success: boolean; id?: string; promoted_default_id?: string | null }> {
  const bizId = businessId || getCurrentBusinessId()
  const res = await neonApi.delete<{ success: boolean; id: string; promoted_default_id?: string | null }>(
    `/printer-profiles?id=${encodeURIComponent(id)}&business_id=${encodeURIComponent(bizId)}`
  )
  if (res.error) {
    throw new Error(res.error instanceof Error ? res.error.message : String(res.error))
  }
  const current = getStoredPrinterProfiles(bizId).filter((p) => p.id !== id)
  const promotedId = res.data?.promoted_default_id
  const updatedProfiles = current.map((p) => ({
    ...p,
    is_default: promotedId ? p.id === promotedId : p.is_default,
  }))
  saveStoredPrinterProfilesLocally(updatedProfiles.length > 0 ? updatedProfiles : [DEFAULT_PRINTER_PROFILE], bizId)
  return res.data || { success: true, id }
}

export async function setDefaultPrinterProfileInDb(id: string, businessId?: string): Promise<PrinterProfile> {
  const bizId = businessId || getCurrentBusinessId()
  const res = await neonApi.put<PrinterProfile>('/printer-profiles', {
    action: 'set_default',
    id,
    business_id: bizId,
  })
  if (res.data) {
    const current = getStoredPrinterProfiles(bizId).map((p) => ({
      ...p,
      is_default: p.id === id,
    }))
    saveStoredPrinterProfilesLocally(current, bizId)
    return res.data
  }
  const errMsg = res.error instanceof Error ? res.error.message : (res.error ? String(res.error) : 'Failed to set default profile')
  throw new Error(errMsg)
}

export async function duplicatePrinterProfileInDb(
  id: string,
  snapshot?: Partial<PrinterProfile>,
  businessId?: string
): Promise<PrinterProfile> {
  const bizId = businessId || getCurrentBusinessId()
  const res = await neonApi.put<PrinterProfile>('/printer-profiles', {
    action: 'duplicate',
    id,
    ...(snapshot || {}),
    business_id: bizId,
  })
  if (res.data) {
    const current = getStoredPrinterProfiles(bizId)
    saveStoredPrinterProfilesLocally([...current, res.data], bizId)
    return res.data
  }
  const errMsg = res.error instanceof Error ? res.error.message : (res.error ? String(res.error) : 'Failed to duplicate profile')
  throw new Error(errMsg)
}

export async function saveLastUsedProfileId(profileId: string, businessId?: string): Promise<void> {
  const bizId = businessId || getCurrentBusinessId()
  try {
    await neonApi.put('/printer-profiles', {
      action: 'set_last_used',
      last_used_profile_id: profileId,
      business_id: bizId,
    })
  } catch (err) {
    console.warn('[barcode] Failed to save last used profile ID to DB:', err)
  }
}

// ==================== RENDERING & QR CODE ====================

export function isVerySmallLabelSize(widthMm: number, heightMm: number): boolean {
  return (widthMm <= 30 && heightMm <= 20) || heightMm <= 18
}

/**
 * Generate a standalone crisp SVG string for a QR code using ZXing.
 */
export function generateQrCodeSvgString(text: string, size = 64): string {
  if (!text || typeof text !== 'string') return ''
  try {
    const writer = new QRCodeWriter()
    const matrix = writer.encode(text.trim(), BarcodeFormat.QR_CODE, 29, 29, new Map())
    const width = matrix.getWidth()
    const height = matrix.getHeight()
    let rects = ''
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (matrix.get(x, y)) {
          rects += `<rect x="${x}" y="${y}" width="1" height="1"/>`
        }
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges" fill="#000" style="display:block;max-width:100%;max-height:100%;width:auto;height:${size}px;margin:0 auto;">${rects}</svg>`
  } catch (e) {
    console.error('[generateQrCodeSvgString] Error generating QR code:', e)
    return ''
  }
}

/**
 * Dynamic sizing calculation for print/preview rendering.
 * Scales typography, barcode height, quiet zone, and minimum scannable bar width.
 */
export function getLabelRenderMetrics(
  widthMm: number,
  heightMm: number,
  fontScale = 1.0,
  barcodeHeightScale = 1.0
) {
  const isVerySmall = isVerySmallLabelSize(widthMm, heightMm)
  const isSmall = !isVerySmall && heightMm <= 25
  const isLarge = heightMm >= 40 && heightMm < 70
  const isExtraLarge = heightMm >= 70

  const clampedFontScale = Math.max(0.7, Math.min(1.6, fontScale || 1.0))
  const clampedBarcodeScale = Math.max(0.5, Math.min(1.6, barcodeHeightScale || 1.0))

  // Barcode height
  const baseRatio = isVerySmall ? 0.38 : isSmall ? 0.34 : isExtraLarge ? 0.42 : isLarge ? 0.40 : 0.36
  const barcodeHeightPx = Math.max(
    14,
    Math.round(heightMm * baseRatio * 3.7795 * clampedBarcodeScale)
  )

  // Printable width and minimum bar width
  const printableWidthPx = Math.max(26, (widthMm - (isVerySmall ? 2 : 4)) * 3.7795)
  const barcodeBarWidth = Math.max(0.85, Math.min(1.80, Math.round((printableWidthPx / 115) * 100) / 100))

  // Font sizes with user font scale
  const barcodeFontSize = Math.round((isVerySmall ? 6 : Math.max(6.5, Math.min(11, Math.round(heightMm * 0.18 * 10) / 10))) * clampedFontScale)
  const headerFontSize = `${(isVerySmall ? 5 : isSmall ? 7 : isExtraLarge ? 13 : isLarge ? 10 : 8.5) * clampedFontScale}pt`
  const titleFontSize = `${(isVerySmall ? 5.5 : isSmall ? 6 : isExtraLarge ? 12 : isLarge ? 9 : 7.5) * clampedFontScale}pt`
  const tagFontSize = `${(isVerySmall ? 5 : isSmall ? 5.5 : isExtraLarge ? 10 : isLarge ? 8 : 7) * clampedFontScale}pt`
  const priceFontSize = `${(isVerySmall ? 6.5 : isSmall ? 8 : isExtraLarge ? 14 : isLarge ? 11.5 : 9.5) * clampedFontScale}pt`
  const padding = isVerySmall ? '0.4mm 0.8mm' : isSmall ? '0.6mm 1.2mm' : isExtraLarge ? '1.8mm 2.5mm' : isLarge ? '1.3mm 2.0mm' : '0.8mm 1.5mm'

  return {
    isVerySmall,
    isSmall,
    isLarge,
    isExtraLarge,
    barcodeHeightPx,
    barcodeBarWidth,
    barcodeFontSize,
    barcodeMargin: isVerySmall ? 1 : 2,
    headerFontSize,
    titleFontSize,
    tagFontSize,
    priceFontSize,
    padding,
  }
}

export interface BarcodeRenderOptions {
  width?: number
  height?: number
  displayValue?: boolean
  fontSize?: number
  font?: string
  textMargin?: number
  margin?: number
  lineColor?: string
  background?: string
  barcodeType?: BarcodeType
}

/**
 * Render barcode (CODE128, EAN13, UPC, or QR) into an SVG element.
 */
export function renderBarcodeSvg(
  svgElement: SVGSVGElement,
  value: string,
  options?: BarcodeRenderOptions
) {
  if (!svgElement || !value) return

  const barcodeType = options?.barcodeType || 'CODE128'
  if (barcodeType === 'QR') {
    const qrSvg = generateQrCodeSvgString(value, options?.height || 40)
    svgElement.outerHTML = qrSvg
    return
  }

  const jsBarcodeFormat = barcodeType === 'EAN13' ? 'EAN13' : barcodeType === 'UPC' ? 'UPC' : 'CODE128'

  try {
    JsBarcode(svgElement, value.trim(), {
      format: jsBarcodeFormat,
      width: options?.width ?? 1.5,
      height: options?.height ?? 36,
      displayValue: options?.displayValue ?? true,
      fontSize: options?.fontSize ?? 11,
      font: options?.font ?? 'monospace',
      textMargin: options?.textMargin ?? 1,
      margin: options?.margin ?? 2,
      lineColor: options?.lineColor ?? '#000000',
      background: options?.background ?? '#ffffff',
    })
  } catch (err) {
    // Fallback to CODE128 if format failed (e.g. invalid checksum for EAN13)
    try {
      JsBarcode(svgElement, value.trim(), {
        format: 'CODE128',
        width: options?.width ?? 1.5,
        height: options?.height ?? 36,
        displayValue: options?.displayValue ?? true,
        fontSize: options?.fontSize ?? 11,
        font: options?.font ?? 'monospace',
        textMargin: options?.textMargin ?? 1,
        margin: options?.margin ?? 2,
        lineColor: options?.lineColor ?? '#000000',
        background: options?.background ?? '#ffffff',
      })
    } catch (e2) {
      console.error('[renderBarcodeSvg] Failed to generate fallback barcode:', e2)
    }
  }
}

/**
 * Generate a standalone SVG string for a barcode or QR code.
 */
export function generateBarcodeSvgString(
  value: string,
  options?: BarcodeRenderOptions
): string {
  if (typeof document === 'undefined' || !value) return ''

  if (options?.barcodeType === 'QR') {
    return generateQrCodeSvgString(value, options.height || 40)
  }

  try {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    renderBarcodeSvg(svg, value, options)
    return svg.outerHTML || new XMLSerializer().serializeToString(svg)
  } catch (err) {
    console.error('[generateBarcodeSvgString] Failed to generate SVG string:', err)
    return ''
  }
}

// ==================== TEST LABEL & PDF EXPORT ====================

/**
 * Generates calibrated test label HTML for printer alignment.
 */
export function generateTestLabelHtml(size: LabelSizeConfig, profile: PrinterProfile): string {
  return `
    <div class="test-label-box" style="
      width: ${size.width_mm}mm;
      height: ${size.height_mm}mm;
      box-sizing: border-box;
      border: 0.35mm solid #000;
      position: relative;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      align-items: center;
      padding: 1.5mm;
      background: #fff;
      overflow: hidden;
      font-family: monospace;
      text-align: center;
    ">
      <!-- Crosshairs -->
      <div style="position:absolute;top:50%;left:0;right:0;height:0.2mm;background:#aaa;border-top:0.2mm dashed #666;z-index:1;"></div>
      <div style="position:absolute;left:50%;top:0;bottom:0;width:0.2mm;background:#aaa;border-left:0.2mm dashed #666;z-index:1;"></div>

      <!-- Corner ticks -->
      <div style="position:absolute;top:0;left:0;width:3mm;height:3mm;border-right:0.3mm solid #000;border-bottom:0.3mm solid #000;z-index:2;"></div>
      <div style="position:absolute;top:0;right:0;width:3mm;height:3mm;border-left:0.3mm solid #000;border-bottom:0.3mm solid #000;z-index:2;"></div>
      <div style="position:absolute;bottom:0;left:0;width:3mm;height:3mm;border-right:0.3mm solid #000;border-top:0.3mm solid #000;z-index:2;"></div>
      <div style="position:absolute;bottom:0;right:0;width:3mm;height:3mm;border-left:0.3mm solid #000;border-top:0.3mm solid #000;z-index:2;"></div>

      <!-- Top Text -->
      <div style="z-index:3;background:#fff;padding:0 2px;line-height:1.1;">
        <strong style="font-size:7pt;text-transform:uppercase;">ALIGNMENT TEST</strong><br/>
        <span style="font-size:6.5pt;font-weight:bold;">${size.width_mm} × ${size.height_mm} mm (${profile.printer_type})</span>
      </div>

      <!-- Center Barcode -->
      <div style="z-index:3;background:#fff;padding:1px;max-width:94%;">
        ${generateBarcodeSvgString('TEST-12345', {
          width: 1.1,
          height: Math.max(16, Math.round(size.height_mm * 0.28 * 3.7795)),
          fontSize: 7,
          font: 'monospace',
          margin: 1,
        })}
      </div>

      <!-- Bottom Offset info -->
      <div style="z-index:3;background:#fff;padding:0 2px;line-height:1;">
        <span style="font-size:6pt;font-weight:bold;">Offset: X=${profile.offset_x_mm >= 0 ? '+' : ''}${profile.offset_x_mm}mm Y=${profile.offset_y_mm >= 0 ? '+' : ''}${profile.offset_y_mm}mm | ${profile.rotation}°</span><br/>
        <span style="font-size:5pt;color:#555;">Adjust offsets if border is cut off</span>
      </div>
    </div>
  `
}

export function getDefaultsForPrinterType(type: PrinterType): Partial<PrinterProfile> {
  switch (type) {
    case 'label':
      return {
        printer_type: 'label',
        size_id: '2_38x25',
        orientation: 'portrait',
        rotation: 0,
        margin_top_mm: 0,
        margin_right_mm: 0,
        margin_bottom_mm: 0,
        margin_left_mm: 0,
        gap_x_mm: 2,
        gap_y_mm: 0,
        offset_x_mm: 0,
        offset_y_mm: 0,
      }
    case 'receipt':
      return {
        printer_type: 'receipt',
        size_id: 'retail_50x30',
        orientation: 'portrait',
        rotation: 0,
        margin_top_mm: 1,
        margin_right_mm: 1,
        margin_bottom_mm: 1,
        margin_left_mm: 1,
        gap_x_mm: 0,
        gap_y_mm: 2,
        offset_x_mm: 0,
        offset_y_mm: 0,
      }
    case 'sheet':
      return {
        printer_type: 'sheet',
        size_id: 'sheet_24up_64x34',
        orientation: 'portrait',
        rotation: 0,
        margin_top_mm: 13.5,
        margin_right_mm: 7,
        margin_bottom_mm: 13.5,
        margin_left_mm: 7,
        gap_x_mm: 2.5,
        gap_y_mm: 0,
        offset_x_mm: 0,
        offset_y_mm: 0,
        sheet_start_position: 1,
      }
    case 'pdf':
      return {
        printer_type: 'pdf',
        size_id: '1_60x40',
        orientation: 'portrait',
        rotation: 0,
        margin_top_mm: 2,
        margin_right_mm: 2,
        margin_bottom_mm: 2,
        margin_left_mm: 2,
        gap_x_mm: 2,
        gap_y_mm: 2,
        offset_x_mm: 0,
        offset_y_mm: 0,
      }
  }
}

/**
 * Execute real browser print of an alignment test label.
 */
export function executeTestPrint(size: LabelSizeConfig, profile: PrinterProfile): void {
  if (typeof document === 'undefined') return
  try {
    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;'
    iframe.setAttribute('aria-hidden', 'true')
    iframe.setAttribute('tabindex', '-1')
    document.body.appendChild(iframe)

    const doc = iframe.contentWindow?.document
    if (!doc) {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
      return
    }

    const testHtml = generateTestLabelHtml(size, profile)
    const isSheet = profile.printer_type === 'sheet' || size.isSheet
    const pageWidthMm = isSheet ? 210 : size.width_mm
    const pageHeightMm = isSheet ? 297 : size.height_mm

    doc.open()
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Test Label - ${size.label}</title>
          <style>
            @page {
              size: ${pageWidthMm}mm ${pageHeightMm}mm;
              margin: 0 !important;
            }
            * { box-sizing: border-box; margin: 0; padding: 0; }
            html, body {
              width: ${pageWidthMm}mm;
              height: ${pageHeightMm}mm;
              margin: 0 !important;
              padding: 0 !important;
              background: #fff;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .test-container {
              width: ${pageWidthMm}mm;
              height: ${pageHeightMm}mm;
              display: flex;
              align-items: center;
              justify-content: center;
              transform: translate(${profile.offset_x_mm}mm, ${profile.offset_y_mm}mm) rotate(${profile.rotation}deg);
              transform-origin: center center;
            }
          </style>
        </head>
        <body>
          <div class="test-container">
            ${testHtml}
          </div>
        </body>
      </html>
    `)
    doc.close()

    const cleanup = () => {
      try {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
      } catch {}
    }

    setTimeout(() => {
      try {
        if (iframe.contentWindow) {
          iframe.contentWindow.focus()
          iframe.contentWindow.print()
        }
      } catch (err) {
        console.warn('[executeTestPrint] Error during print:', err)
      } finally {
        setTimeout(cleanup, 2500)
      }
    }, 200)
  } catch (err) {
    console.error('[executeTestPrint] Failed:', err)
  }
}

/**
 * Downloads a test label PDF directly.
 */
export function downloadTestLabelPdf(size: LabelSizeConfig, profile: PrinterProfile): void {
  const isSheet = profile.printer_type === 'sheet' || size.isSheet
  const pageWidth = isSheet ? 210 : size.width_mm
  const pageHeight = isSheet ? 297 : size.height_mm

  const doc = new jsPDF({
    orientation: profile.orientation,
    unit: 'mm',
    format: [pageWidth, pageHeight],
  })

  const x = profile.offset_x_mm + (isSheet ? (210 - size.width_mm) / 2 : 0)
  const y = profile.offset_y_mm + (isSheet ? (297 - size.height_mm) / 2 : 0)

  // Outer border
  doc.setLineWidth(0.35)
  doc.rect(x + 1, y + 1, size.width_mm - 2, size.height_mm - 2)

  // Crosshairs
  doc.setLineWidth(0.1)
  doc.setDrawColor(180, 180, 180)
  doc.line(x + 1, y + size.height_mm / 2, x + size.width_mm - 1, y + size.height_mm / 2)
  doc.line(x + size.width_mm / 2, y + 1, x + size.width_mm / 2, y + size.height_mm - 1)

  // Texts
  doc.setTextColor(0, 0, 0)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('ALIGNMENT TEST', x + size.width_mm / 2, y + 5, { align: 'center' })
  doc.setFontSize(7)
  doc.text(`${size.width_mm} × ${size.height_mm} mm (${profile.printer_type})`, x + size.width_mm / 2, y + 9, { align: 'center' })

  // Barcode text
  doc.setFont('courier', 'bold')
  doc.setFontSize(8)
  doc.text('*TEST-12345*', x + size.width_mm / 2, y + size.height_mm / 2 + 3, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.text(`Offset: X=${profile.offset_x_mm}mm Y=${profile.offset_y_mm}mm | ${profile.rotation}°`, x + size.width_mm / 2, y + size.height_mm - 3, { align: 'center' })

  doc.save(`test_label_${size.width_mm}x${size.height_mm}.pdf`)
}

/**
 * Downloads exact vector PDF using jsPDF for printing anywhere or on mobile.
 */
export async function downloadLabelsPdf(
  items: Array<{
    barcodeValue: string
    productName: string
    variantName?: string
    price: number
    mrp?: number | null
    header?: string
    line2?: string
    quantity?: number
  }>,
  size: LabelSizeConfig,
  profile: PrinterProfile
): Promise<void> {
  const isSheet = profile.printer_type === 'sheet' || size.isSheet
  const pageWidth = isSheet ? (profile.orientation === 'landscape' ? 297 : 210) : size.width_mm
  const pageHeight = isSheet ? (profile.orientation === 'landscape' ? 210 : 297) : size.height_mm

  const doc = new jsPDF({
    orientation: profile.orientation,
    unit: 'mm',
    format: [pageWidth, pageHeight],
  })

  let pageIndex = 0
  const cols = size.columns || 1
  const rows = size.rows || 1

  const expandedItems: typeof items = []
  items.forEach((item) => {
    const count = Math.max(1, item.quantity || 1)
    for (let c = 0; c < count; c++) expandedItems.push(item)
  })

  if (isSheet) {
    // Grid sheet layout (e.g. A4 sticker sheet)
    const labelsPerPage = cols * rows
    const startOffset = Math.max(0, (profile.sheet_start_position || 1) - 1)
    const paddedItems: (typeof items[0] | null)[] = Array(startOffset).fill(null).concat(expandedItems)

    for (let i = 0; i < paddedItems.length; i += labelsPerPage) {
      if (pageIndex > 0) doc.addPage([pageWidth, pageHeight], profile.orientation)
      const pageBatch = paddedItems.slice(i, i + labelsPerPage)

      pageBatch.forEach((item, batchIdx) => {
        if (!item) return
        const colIdx = batchIdx % cols
        const rowIdx = Math.floor(batchIdx / cols)
        const x = (size.margin_left_mm || 0) + colIdx * (size.width_mm + (size.gap_mm || 0)) + profile.offset_x_mm
        const y = (size.margin_top_mm || 0) + rowIdx * (size.height_mm + (size.gap_y_mm || 0)) + profile.offset_y_mm

        // Draw label content
        doc.setFontSize(8 * profile.font_scale)
        if (profile.show_business_name) {
          doc.setFont('helvetica', 'bold')
          doc.text(item.header || BRAND_EN, x + size.width_mm / 2, y + 3, { align: 'center' })
        }
        if (profile.show_product_name) {
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(7 * profile.font_scale)
          doc.text(item.productName.slice(0, 22), x + size.width_mm / 2, y + 6.5, { align: 'center' })
        }
        // Price & Code
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8 * profile.font_scale)
        if (profile.show_price) {
          doc.text(`₹${item.price}`, x + size.width_mm - 2, y + size.height_mm - 2, { align: 'right' })
        }
        if (profile.show_sku) {
          doc.setFont('courier', 'bold')
          doc.setFontSize(6.5 * profile.font_scale)
          doc.text(item.barcodeValue, x + 2, y + size.height_mm - 2)
        }
      })
      pageIndex++
    }
  } else {
    // Single-up or Roll layout
    for (let idx = 0; idx < expandedItems.length; idx++) {
      if (idx > 0) doc.addPage([pageWidth, pageHeight], profile.orientation)
      const item = expandedItems[idx]
      const metrics = getLabelRenderMetrics(size.width_mm, size.height_mm, profile.font_scale, profile.barcode_height_scale)

      const x = profile.offset_x_mm
      const y = profile.offset_y_mm

      if (!metrics.isVerySmall && profile.show_business_name) {
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(7 * profile.font_scale)
        doc.text(item.header || BRAND_EN, x + size.width_mm / 2, y + 3, { align: 'center' })
      }
      if (!metrics.isVerySmall && profile.show_product_name) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(6.5 * profile.font_scale)
        doc.text(item.productName.slice(0, 20), x + size.width_mm / 2, y + 6, { align: 'center' })
      }

      // Barcode value & price
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.5 * profile.font_scale)
      if (profile.show_price) {
        doc.text(`₹${item.price}`, x + size.width_mm - 2, y + size.height_mm - 2, { align: 'right' })
      }
      if (profile.show_sku) {
        doc.setFont('courier', 'bold')
        doc.setFontSize(6 * profile.font_scale)
        doc.text(metrics.isVerySmall ? item.barcodeValue.slice(-8) : item.barcodeValue, x + 2, y + size.height_mm - 2)
      }
    }
  }

  doc.save(`barcode_labels_${size.width_mm}x${size.height_mm}.pdf`)
}

export interface BarcodeQueueItem {
  id: string
  productId: number
  productName: string
  variantId?: string | null
  variantName?: string
  barcodeValue: string
  price: number
  costPrice?: number
  noOfLabels: number
  header: string
  line1: string
  line2: string
  line3: string
  line4: string
  selected: boolean
}

export function formatBarcodeDisplay(value?: string | null): string {
  if (!value) return '—'
  return String(value).trim()
}

export function isValidBarcodeValue(value: string): boolean {
  return /^[A-Z0-9_-]{3,32}$/i.test(value.trim())
}
