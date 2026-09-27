export const DEFAULT_THEME_COLOR = '#2c392a'

const STORAGE_KEY = 'vk_theme_color_v1'

function hexToRgbTriplet(hex: string): string {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  if ([r, g, b].some((n) => Number.isNaN(n))) return '44 57 42'
  return `${r} ${g} ${b}`
}

/** Applies a hex color as the app's live theme: sets the CSS custom properties
 * every themed surface reads from (--brand-black for direct var() usage,
 * --brand-black-rgb for Tailwind's opacity-aware `brand-black` color token),
 * and caches it so the next load paints the right color before the settings
 * API call resolves. */
export function applyThemeColor(hex: string): void {
  const root = document.documentElement
  root.style.setProperty('--brand-black', hex)
  root.style.setProperty('--brand-black-rgb', hexToRgbTriplet(hex))
  try {
    localStorage.setItem(STORAGE_KEY, hex)
  } catch {
    // ignore storage failures (private browsing, quota, etc.)
  }
}

/** The current runtime theme hex — for contexts that can't use a CSS var
 * (jsPDF drawing, html2canvas-rendered export templates): PDF/print/export code. */
export function getThemeColor(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME_COLOR
  } catch {
    return DEFAULT_THEME_COLOR
  }
}

/** Applies the cached color immediately (before the settings API responds),
 * to avoid a flash of the default color on load. */
export function applyCachedThemeColor(): void {
  applyThemeColor(getThemeColor())
}
