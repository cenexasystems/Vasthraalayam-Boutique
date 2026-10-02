import { getThemeColor } from './theme'

export interface InvoiceTheme {
  primary: string
  accent: string
  contrast: string
  tint: string
  border: string
}

export const INVOICE_LOGO_PRIMARY = '#1F3A2E' // Dominant dark green background sampled from VASTHRAALAYAM logo
export const INVOICE_LOGO_ACCENT = '#C5A059'  // Warm champagne gold lettering sampled from VASTHRAALAYAM logo
export const INVOICE_PRIMARY_CONTRAST = '#FFFFFF'
export const INVOICE_STORAGE_KEY = 'vk_invoice_primary_color'

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  if ([r, g, b].some((n) => Number.isNaN(n))) return { r: 31, g: 58, b: 46 }
  return { r, g, b }
}

export function getInvoiceTheme(customColor?: string): InvoiceTheme {
  let chosen = customColor
  if (!chosen) {
    try {
      chosen = localStorage.getItem(INVOICE_STORAGE_KEY) || undefined
    } catch { /* ignore */ }
  }
  if (!chosen) {
    // If an app theme is set that is distinct from default, use that or the logo primary
    const appTheme = getThemeColor()
    chosen = appTheme && appTheme !== '#2c392a' ? appTheme : INVOICE_LOGO_PRIMARY
  }

  const cleanHex = String(chosen || '').trim()
  const primary = /^#[0-9a-f]{3,8}$/i.test(cleanHex) ? cleanHex : INVOICE_LOGO_PRIMARY
  const { r, g, b } = hexToRgb(primary)

  return {
    primary,
    accent: INVOICE_LOGO_ACCENT,
    contrast: INVOICE_PRIMARY_CONTRAST,
    tint: `rgba(${r}, ${g}, ${b}, 0.07)`,
    border: `rgba(${r}, ${g}, ${b}, 0.22)`,
  }
}

export function applyInvoiceTheme(customColor?: string): void {
  if (typeof document === 'undefined') return
  const theme = getInvoiceTheme(customColor)
  const root = document.documentElement
  root.style.setProperty('--invoice-primary', theme.primary)
  root.style.setProperty('--invoice-accent', theme.accent)
  root.style.setProperty('--invoice-primary-contrast', theme.contrast)
  root.style.setProperty('--invoice-tint', theme.tint)
  root.style.setProperty('--invoice-border', theme.border)
  if (customColor) {
    try {
      localStorage.setItem(INVOICE_STORAGE_KEY, customColor)
    } catch { /* ignore */ }
  }
}
