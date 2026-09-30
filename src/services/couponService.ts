import { neonApi } from '../lib/neonApi'
import { formatCurrency } from '../lib/retail'

export type AppliedCoupon = {
  code: string
  percentage: number
  discount: number
}

type CouponRow = {
  code: string
  percentage: number
  is_active: boolean
  expiry_date: string | null
  usage_limit: number | null
  usage_count: number
  min_order_value: number
}

export async function validateCoupon(
  rawCode: string,
  subtotal: number,
): Promise<{ data: AppliedCoupon | null; error: string | null }> {
  const code = rawCode.trim().toUpperCase()
  if (!code) return { data: null, error: 'Enter a coupon code' }

  try {
    const result = await neonApi.get<CouponRow>(`/coupons/${encodeURIComponent(code)}`)
    if (result.error || !result.data) {
      return { data: null, error: 'Invalid or expired coupon code' }
    }
    const data = result.data

    if (data.expiry_date && new Date(data.expiry_date) < new Date()) {
      return { data: null, error: 'This coupon has expired' }
    }

    const usageLimit = Number(data.usage_limit || 0)
    const usageCount = Number(data.usage_count || 0)
    if (usageLimit > 0 && usageCount >= usageLimit) {
      return { data: null, error: 'Coupon usage limit has been reached' }
    }

    if (data.min_order_value && subtotal < Number(data.min_order_value)) {
      return {
        data: null,
        error: `Minimum order of ${formatCurrency(Number(data.min_order_value))} required`,
      }
    }

    const discount = Math.round((subtotal * Number(data.percentage) / 100) * 100) / 100
    return {
      data: { code: String(data.code), percentage: Number(data.percentage), discount },
      error: null,
    }
  } catch {
    return { data: null, error: 'Failed to validate coupon. Try again.' }
  }
}
