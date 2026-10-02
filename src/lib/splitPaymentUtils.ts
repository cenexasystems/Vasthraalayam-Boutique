export type PaymentMode = 'cash' | 'qr' | 'card' | 'split'

export interface SplitPaymentItem {
  mode: 'cash' | 'qr' | 'card'
  amount: number
}

export interface SplitPaymentValidationResult {
  isValid: boolean
  totalPaid: number
  remaining: number
  changeGiven: number
  maxQrAllowed: number
  maxCardAllowed: number
  activePayments: SplitPaymentItem[]
  errorMessage?: string
}

export const roundMoney = (val: number): number => {
  return Math.round((Number(val) || 0) * 100) / 100
}

/**
 * Validate and calculate split payments for:
 * - 'sale': Standard POS sale where full grand total must be paid
 * - 'deposit': Advance deposit creation where paid must be > 0 and <= total
 * - 'balance': Receiving final balance payment where remaining must be cleared
 */
export function calculateSplitPayments({
  type,
  targetAmount,
  method,
  cashAmount,
  qrAmount,
  cardAmount,
  singleReceived,
}: {
  type: 'sale' | 'deposit' | 'balance'
  targetAmount: number
  method: PaymentMode
  cashAmount: number | string
  qrAmount: number | string
  cardAmount: number | string
  singleReceived?: number | string
}): SplitPaymentValidationResult {
  const target = Math.max(0, roundMoney(targetAmount))
  const cashNum = Math.max(0, roundMoney(Number(cashAmount) || 0))
  const qrNum = Math.max(0, roundMoney(Number(qrAmount) || 0))
  const cardNum = Math.max(0, roundMoney(Number(cardAmount) || 0))

  if (method === 'split') {
    const totalPaid = roundMoney(cashNum + qrNum + cardNum)
    const activePayments: SplitPaymentItem[] = []
    if (cashNum > 0) activePayments.push({ mode: 'cash', amount: cashNum })
    if (qrNum > 0) activePayments.push({ mode: 'qr', amount: qrNum })
    if (cardNum > 0) activePayments.push({ mode: 'card', amount: cardNum })

    if (type === 'deposit') {
      // Deposit rules: total paid across modes must be > 0 and <= targetAmount
      const remaining = Math.max(0, roundMoney(target - totalPaid))
      const maxQrAllowed = Math.max(0, roundMoney(target - cardNum - cashNum))
      const maxCardAllowed = Math.max(0, roundMoney(target - qrNum - cashNum))

      if (totalPaid <= 0) {
        return {
          isValid: false,
          totalPaid,
          remaining: target,
          changeGiven: 0,
          maxQrAllowed: target,
          maxCardAllowed: target,
          activePayments,
          errorMessage: 'Enter an advance amount greater than ₹0.00',
        }
      }
      if (totalPaid > target) {
        return {
          isValid: false,
          totalPaid,
          remaining: 0,
          changeGiven: 0,
          maxQrAllowed,
          maxCardAllowed,
          activePayments,
          errorMessage: `Deposit cannot exceed order total (₹${target.toFixed(2)})`,
        }
      }

      return {
        isValid: true,
        totalPaid,
        remaining,
        changeGiven: 0,
        maxQrAllowed,
        maxCardAllowed,
        activePayments,
      }
    }

    // 'sale' or 'balance': total must cover target, QR/Card cannot exceed remaining
    const maxQrAllowed = Math.max(0, roundMoney(target - cardNum))
    const maxCardAllowed = Math.max(0, roundMoney(target - qrNum))
    const remaining = Math.max(0, roundMoney(target - totalPaid))
    const changeGiven = totalPaid > target ? roundMoney(totalPaid - target) : 0

    let errorMessage: string | undefined
    if (totalPaid < target) {
      errorMessage = `Insufficient payment. Remaining: ₹${remaining.toFixed(2)}`
    } else if (qrNum > maxQrAllowed) {
      errorMessage = `QR payment cannot exceed ₹${maxQrAllowed.toFixed(2)}`
    } else if (cardNum > maxCardAllowed) {
      errorMessage = `Card payment cannot exceed ₹${maxCardAllowed.toFixed(2)}`
    } else if (activePayments.length === 0 && target > 0) {
      errorMessage = 'Please allocate payment amounts'
    }

    const isValid = !errorMessage

    return {
      isValid,
      totalPaid,
      remaining,
      changeGiven,
      maxQrAllowed,
      maxCardAllowed,
      activePayments,
      errorMessage,
    }
  }

  // Single payment mode (cash, qr, or card)
  if (type === 'deposit') {
    const singleNum = Math.max(0, roundMoney(Number(singleReceived) || 0))
    const activePayments: SplitPaymentItem[] = singleNum > 0 ? [{ mode: method, amount: singleNum }] : []
    const remaining = Math.max(0, roundMoney(target - singleNum))

    let errorMessage: string | undefined
    if (singleNum <= 0) {
      errorMessage = 'Enter an advance amount greater than ₹0.00'
    } else if (singleNum > target) {
      errorMessage = `Deposit cannot exceed order total (₹${target.toFixed(2)})`
    }

    return {
      isValid: !errorMessage,
      totalPaid: singleNum,
      remaining,
      changeGiven: 0,
      maxQrAllowed: target,
      maxCardAllowed: target,
      activePayments,
      errorMessage,
    }
  }

  // Single mode for 'sale' or 'balance'
  if (method === 'cash') {
    const singleRaw = singleReceived !== undefined && singleReceived !== '' ? Number(singleReceived) : target
    const singleNum = Math.max(0, roundMoney(Number.isFinite(singleRaw) ? singleRaw : 0))
    const changeGiven = singleNum > target ? roundMoney(singleNum - target) : 0
    const remaining = Math.max(0, roundMoney(target - singleNum))
    const isValid = target === 0 || singleNum >= target
    const errorMessage = !isValid ? `Insufficient cash. Still owes ₹${remaining.toFixed(2)}` : undefined

    return {
      isValid,
      totalPaid: singleNum,
      remaining,
      changeGiven,
      maxQrAllowed: target,
      maxCardAllowed: target,
      activePayments: singleNum > 0 ? [{ mode: 'cash', amount: singleNum }] : (target === 0 ? [{ mode: 'cash', amount: 0 }] : []),
      errorMessage,
    }
  }

  // QR or Card single mode: exact allocation of target
  return {
    isValid: true,
    totalPaid: target,
    remaining: 0,
    changeGiven: 0,
    maxQrAllowed: target,
    maxCardAllowed: target,
    activePayments: [{ mode: method, amount: target }],
  }
}
