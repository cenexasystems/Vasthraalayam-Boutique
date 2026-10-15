export const BRAND_EN = 'VASTHRAALAYAM BOUTIQUE'
export const BRAND_TA = 'VASTHRAALAYAM BOUTIQUE'
export const BRAND_SHORT = 'VASTHRAALAYAM'
export const BRAND_SUBTITLE = 'Retail Billing & Inventory'
export const BRAND_LOGO = '/vasthraalayam-logo.jpeg'
export const BRAND_ICON = '/vasthraalayam-icon.png'
export const BRAND_FAVICON = '/vasthraalayam-favicon.png'
export const BRAND_PRODUCTION_DOMAIN = 'https://vasthraalayam-boutique.vercel.app'

/**
 * Returns the public customer-facing production base URL.
 * NEVER uses window.location.origin, VERCEL_URL, or preview deployment URLs,
 * preventing customers from seeing Vercel login prompts.
 */
export const getPublicBaseUrl = (): string => {
  const envUrl = (
    (import.meta.env.NEXT_PUBLIC_APP_URL as string | undefined) ||
    (import.meta.env.VITE_SITE_URL as string | undefined) ||
    (import.meta.env.NEXT_PUBLIC_SITE_URL as string | undefined)
  )?.trim().replace(/\/+$/, '')
  return envUrl || BRAND_PRODUCTION_DOMAIN
}

// Owner / Personal contact
export const BRAND_OWNER_NAME = 'Vasthraalayam Boutique'
export const BRAND_OWNER_PHONE_DISPLAY = '+91 98844 23899'
export const BRAND_OWNER_PHONE_E164 = '919884423899'

// Official Shop contact (used for receipts, billing, and customer WhatsApp)
export const BRAND_PRIMARY_PHONE_DISPLAY = '+91 98844 23899'
export const BRAND_PRIMARY_PHONE_E164 = '919884423899'
export const BRAND_SECONDARY_PHONE_DISPLAY = '+91 98844 23899'
export const BRAND_SECONDARY_PHONE_E164 = '919884423899'
export const BRAND_THIRD_PHONE_DISPLAY = BRAND_SECONDARY_PHONE_DISPLAY
export const BRAND_THIRD_PHONE_E164 = BRAND_SECONDARY_PHONE_E164

export const BRAND_PHONE_DISPLAY = BRAND_PRIMARY_PHONE_DISPLAY
export const BRAND_PHONE_E164 = BRAND_PRIMARY_PHONE_E164

export const BRAND_WHATSAPP = BRAND_PRIMARY_PHONE_DISPLAY
export const WHATSAPP_NUM = BRAND_PRIMARY_PHONE_E164
export const BRAND_WHATSAPP_LINK = `https://wa.me/${BRAND_PRIMARY_PHONE_E164}`

export const BRAND_EMAIL = ''
export const BRAND_ADDRESS = 'No. 465/10, Medavakkam Main Road, Ullagaram, Puzhudhivakkam, Chennai - 600091'
export const BRAND_INSTAGRAM = 'vasthraalayamboutique'
export const BRAND_INSTAGRAM_URL = 'https://www.instagram.com/vasthraalayamboutique/'
export const BRAND_LOCATION_LINK = 'https://www.google.com/maps/search/?api=1&query=No+465%2F10+Medavakkam+Main+Road+Ullagaram+Puzhudhivakkam+Chennai+600091'
