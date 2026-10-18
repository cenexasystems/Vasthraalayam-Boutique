import { useSettingsStore, type StoreSettings } from '../store/store'
import {
  BRAND_ADDRESS,
  BRAND_EMAIL,
  BRAND_EN,
  BRAND_ICON,
  BRAND_INSTAGRAM,
  BRAND_LOCATION_LINK,
  BRAND_PRIMARY_PHONE_DISPLAY,
  BRAND_PRIMARY_PHONE_E164,
  BRAND_SUBTITLE,
} from './brand'

/**
 * The shop identity shown on every screen, receipt, invoice, PDF, label and
 * WhatsApp message. Each field comes from Settings → Store Settings when it
 * has been filled in, and falls back to the brand.ts default otherwise, so a
 * change saved in Settings shows up everywhere without touching code.
 */
export interface ShopProfile {
  name: string
  ownerName: string
  subtitle: string
  phoneDisplay: string
  phoneE164: string
  secondaryPhoneDisplay: string
  secondaryPhoneE164: string
  email: string
  address: string
  locationLink: string
  instagram: string
  instagramUrl: string
  logo: string
  hasCustomLogo: boolean
  whatsappLink: string
}

const toE164 = (phone: string): string => {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `91${digits}`
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`
  return digits
}

export function buildShopProfile(settings: StoreSettings | null | undefined): ShopProfile {
  const s = settings
  const name = s?.name?.trim() || BRAND_EN
  const phoneDisplay = s?.phone?.trim() || BRAND_PRIMARY_PHONE_DISPLAY
  const phoneE164 = s?.phone?.trim() ? toE164(s.phone) : BRAND_PRIMARY_PHONE_E164
  const secondaryPhoneDisplay = s?.shopContactNumber?.trim() || ''
  const address = s?.address?.trim() || BRAND_ADDRESS
  const instagram = (s?.instagramId?.trim() || BRAND_INSTAGRAM).replace(/^@/, '')
  return {
    name,
    ownerName: s?.ownerName?.trim() || name,
    subtitle: s?.businessType?.trim() || BRAND_SUBTITLE,
    phoneDisplay,
    phoneE164,
    secondaryPhoneDisplay,
    secondaryPhoneE164: secondaryPhoneDisplay ? toE164(secondaryPhoneDisplay) : '',
    email: s?.email?.trim() || BRAND_EMAIL,
    address,
    locationLink: s?.address?.trim()
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
      : BRAND_LOCATION_LINK,
    instagram,
    instagramUrl: instagram ? `https://www.instagram.com/${instagram}/` : '',
    logo: s?.logoUrl?.trim() || BRAND_ICON,
    hasCustomLogo: Boolean(s?.logoUrl?.trim()),
    whatsappLink: `https://wa.me/${phoneE164}`,
  }
}

/**
 * Logo to embed in a jsPDF document: the logo uploaded in Settings when there
 * is one (stored as a data URL), otherwise the given built-in fallback.
 */
export function pdfLogo(shop: ShopProfile, fallback: string): { data: string; format: 'PNG' | 'JPEG' } {
  if (shop.hasCustomLogo && shop.logo.startsWith('data:image/')) {
    return { data: shop.logo, format: shop.logo.startsWith('data:image/png') ? 'PNG' : 'JPEG' }
  }
  return { data: fallback, format: 'PNG' }
}

/** Current shop profile, for non-React code (print, PDF, WhatsApp builders). */
export const getShopProfile = (): ShopProfile => buildShopProfile(useSettingsStore.getState().settings)

/** Current shop profile; re-renders the component when Settings are saved. */
export function useShopProfile(): ShopProfile {
  const settings = useSettingsStore((state) => state.settings)
  return buildShopProfile(settings)
}
