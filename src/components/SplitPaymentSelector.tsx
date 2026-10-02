import React, { useState, useEffect, useId } from 'react'
import { Banknote, QrCode, CreditCard, Split } from 'lucide-react'
import { formatCurrency } from '../lib/retail'
import {
  type PaymentMode,
  type SplitPaymentValidationResult,
  calculateSplitPayments,
  roundMoney,
} from '../lib/splitPaymentUtils'

export interface SplitPaymentSelectorProps {
  type: 'sale' | 'deposit' | 'balance'
  targetAmount: number
  method: PaymentMode
  onMethodChange: (mode: PaymentMode) => void
  onChange: (result: SplitPaymentValidationResult) => void
  disabled?: boolean
  initialSingleAmount?: string
  initialSplitCash?: string
  initialSplitQr?: string
  initialSplitCard?: string
}

export const SplitPaymentSelector: React.FC<SplitPaymentSelectorProps> = ({
  type,
  targetAmount,
  method,
  onMethodChange,
  onChange,
  disabled = false,
  initialSingleAmount = '',
  initialSplitCash = '',
  initialSplitQr = '',
  initialSplitCard = '',
}) => {
  const [singleReceived, setSingleReceived] = useState<string>(initialSingleAmount)
  const [splitCash, setSplitCash] = useState<string>(initialSplitCash)
  const [splitQr, setSplitQr] = useState<string>(initialSplitQr)
  const [splitCard, setSplitCard] = useState<string>(initialSplitCard)

  // Sync initial values if parent changes targetAmount significantly
  useEffect(() => {
    if (initialSingleAmount && !singleReceived) setSingleReceived(initialSingleAmount)
  }, [initialSingleAmount])

  // Recalculate and notify parent on any input change
  useEffect(() => {
    const res = calculateSplitPayments({
      type,
      targetAmount,
      method,
      cashAmount: splitCash,
      qrAmount: splitQr,
      cardAmount: splitCard,
      singleReceived,
    })
    onChange(res)
  }, [type, targetAmount, method, splitCash, splitQr, splitCard, singleReceived])

  // Split calculation helpers
  const splitCashNum = Math.max(0, roundMoney(Number(splitCash) || 0))
  const splitQrNum = Math.max(0, roundMoney(Number(splitQr) || 0))
  const splitCardNum = Math.max(0, roundMoney(Number(splitCard) || 0))
  const totalSplitPaid = roundMoney(splitCashNum + splitQrNum + splitCardNum)
  const splitRemaining = Math.max(0, roundMoney(targetAmount - totalSplitPaid))
  const splitChangeDue = totalSplitPaid > targetAmount ? roundMoney(totalSplitPaid - targetAmount) : 0

  const maxQrAllowed = type === 'deposit'
    ? Math.max(0, roundMoney(targetAmount - splitCardNum - splitCashNum))
    : Math.max(0, roundMoney(targetAmount - splitCardNum))

  const maxCardAllowed = type === 'deposit'
    ? Math.max(0, roundMoney(targetAmount - splitQrNum - splitCashNum))
    : Math.max(0, roundMoney(targetAmount - splitQrNum))

  const fillRemainingCash = () => {
    const rem = Math.max(0, roundMoney(targetAmount - splitQrNum - splitCardNum))
    setSplitCash(rem > 0 ? String(rem) : '0')
  }

  const fillRemainingQr = () => {
    const rem = Math.max(0, roundMoney(targetAmount - splitCashNum - splitCardNum))
    setSplitQr(rem > 0 ? String(rem) : '0')
  }

  const fillRemainingCard = () => {
    const rem = Math.max(0, roundMoney(targetAmount - splitCashNum - splitQrNum))
    setSplitCard(rem > 0 ? String(rem) : '0')
  }

  const handleSplitQrChange = (val: string) => {
    if (val === '') { setSplitQr(''); return }
    const num = Number(val)
    if (isNaN(num) || num < 0) return
    if (num > maxQrAllowed && maxQrAllowed >= 0) {
      setSplitQr(String(maxQrAllowed))
    } else {
      setSplitQr(val)
    }
  }

  const handleSplitCardChange = (val: string) => {
    if (val === '') { setSplitCard(''); return }
    const num = Number(val)
    if (isNaN(num) || num < 0) return
    if (num > maxCardAllowed && maxCardAllowed >= 0) {
      setSplitCard(String(maxCardAllowed))
    } else {
      setSplitCard(val)
    }
  }

  const singleNum = Math.max(0, Number(singleReceived) || 0)
  const singleCashChange = singleNum > targetAmount ? roundMoney(singleNum - targetAmount) : 0

  return (
    <div className="space-y-3">
      {/* Payment Method Selector Grid */}
      <div>
        <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1.5">
          Payment Mode *
        </label>
        <div className="grid grid-cols-4 gap-2">
          {(['cash', 'qr', 'card', 'split'] as const).map((m) => (
            <button
              key={m}
              type="button"
              disabled={disabled}
              onClick={() => onMethodChange(m)}
              className={`min-h-[44px] rounded-xl border font-black text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                method === m
                  ? 'bg-brand-black text-white border-brand-black shadow-xs'
                  : 'bg-[#FAFAFA] text-[#374151] border-gray-200 hover:bg-[#F3F4F6] hover:text-[#111111]'
              }`}
            >
              {m === 'cash' && <Banknote size={14} className="shrink-0 text-emerald-500" />}
              {m === 'qr' && <QrCode size={14} className="shrink-0 text-blue-500" />}
              {m === 'card' && <CreditCard size={14} className="shrink-0 text-purple-500" />}
              {m === 'split' && <Split size={14} className="shrink-0 text-amber-500" />}
              <span>{m === 'qr' ? 'QR' : m === 'card' ? 'Card' : m === 'split' ? 'SPLIT' : 'Cash'}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Single Mode View */}
      {method !== 'split' && (
        <div className="border border-gray-200 rounded-xl p-3 bg-white space-y-2">
          {type === 'deposit' ? (
            <div>
              <label className="block text-[10px] font-black text-[#374151] tracking-wider uppercase mb-1">
                Advance Amount Received ({method === 'qr' ? 'QR' : method === 'card' ? 'Card' : 'Cash'}) (₹) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={targetAmount}
                disabled={disabled}
                onWheel={(e) => (e.target as HTMLInputElement).blur()}
                value={singleReceived}
                onChange={(e) => setSingleReceived(e.target.value)}
                placeholder="0.00"
                className="w-full h-10 px-3 bg-[#FAFAFA] border border-gray-200 rounded-xl text-[14px] font-black text-[#111111] focus:outline-none focus:border-[#7daa8f]"
              />
              <div className="mt-2 flex justify-between items-center bg-[#F9FAFB] px-3 py-1.5 rounded-lg border border-gray-200">
                <span className="text-[10px] font-bold text-[#374151]">Remaining Balance:</span>
                <span className="text-[12px] font-black text-violet-700">
                  {formatCurrency(Math.max(0, roundMoney(targetAmount - singleNum)))}
                </span>
              </div>
            </div>
          ) : method === 'cash' ? (
            <div>
              <label className="block text-[10px] font-black text-[#374151] tracking-wider uppercase mb-1">
                Cash — Amount Received (₹)
              </label>
              <input
                type="number"
                step="any"
                min="0"
                disabled={disabled}
                onWheel={(e) => (e.target as HTMLInputElement).blur()}
                value={singleReceived}
                onChange={(e) => setSingleReceived(e.target.value)}
                placeholder={targetAmount > 0 ? targetAmount.toFixed(2) : '0.00'}
                className="w-full h-10 px-3 bg-[#FAFAFA] border border-gray-200 rounded-xl text-[14px] font-black text-[#111111] focus:outline-none focus:border-[#7daa8f]"
              />
              {singleCashChange > 0 && (
                <div className="mt-2 flex justify-between items-center bg-blue-50 px-3 py-2 rounded-lg border border-blue-200 text-blue-800">
                  <span className="text-[11px] font-bold">Return Balance:</span>
                  <span className="text-[13px] font-black tabular-nums">{formatCurrency(singleCashChange)}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex justify-between items-center py-1">
              <span className="text-xs font-bold text-gray-600">
                Amount to pay via {method === 'qr' ? 'QR / UPI' : 'Card'}:
              </span>
              <span className="text-sm font-black text-brand-black">
                {formatCurrency(targetAmount)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Split Mode View */}
      {method === 'split' && (
        <div className="border border-gray-200 rounded-xl p-3 bg-white space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-[#374151] tracking-wider uppercase">
              Split Payment Breakdown
            </span>
            <span className="text-[11px] font-bold text-gray-500">
              {type === 'deposit' ? 'Order Total: ' : 'Target: '}
              <strong className="text-brand-black">{formatCurrency(targetAmount)}</strong>
            </span>
          </div>

          {/* Cash Row */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] font-bold text-gray-700">
              <span className="flex items-center gap-1.5">
                <Banknote size={14} className="text-emerald-600" /> Cash (₹)
              </span>
              <button
                type="button"
                disabled={disabled}
                onClick={fillRemainingCash}
                className="text-[10px] font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md px-2 py-0.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                Fill remaining
              </button>
            </div>
            <input
              type="number"
              step="any"
              min="0"
              disabled={disabled}
              onWheel={(e) => (e.target as HTMLInputElement).blur()}
              value={splitCash}
              onChange={(e) => setSplitCash(e.target.value)}
              placeholder="0.00"
              className="w-full h-9 px-3 bg-[#FAFAFA] border border-gray-200 rounded-xl text-[13px] font-black text-[#111111] focus:outline-none focus:border-[#7daa8f]"
            />
          </div>

          {/* QR Row */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] font-bold text-gray-700">
              <span className="flex items-center gap-1.5">
                <QrCode size={14} className="text-blue-600" /> QR Code / UPI (₹)
              </span>
              <button
                type="button"
                disabled={disabled}
                onClick={fillRemainingQr}
                className="text-[10px] font-bold text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md px-2 py-0.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                Fill remaining
              </button>
            </div>
            <input
              type="number"
              step="any"
              min="0"
              max={maxQrAllowed}
              disabled={disabled}
              onWheel={(e) => (e.target as HTMLInputElement).blur()}
              value={splitQr}
              onChange={(e) => handleSplitQrChange(e.target.value)}
              placeholder="0.00"
              className="w-full h-9 px-3 bg-[#FAFAFA] border border-gray-200 rounded-xl text-[13px] font-black text-[#111111] focus:outline-none focus:border-[#7daa8f]"
            />
          </div>

          {/* Card Row */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] font-bold text-gray-700">
              <span className="flex items-center gap-1.5">
                <CreditCard size={14} className="text-purple-600" /> Card (₹)
              </span>
              <button
                type="button"
                disabled={disabled}
                onClick={fillRemainingCard}
                className="text-[10px] font-bold text-purple-700 hover:text-purple-800 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-md px-2 py-0.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                Fill remaining
              </button>
            </div>
            <input
              type="number"
              step="any"
              min="0"
              max={maxCardAllowed}
              disabled={disabled}
              onWheel={(e) => (e.target as HTMLInputElement).blur()}
              value={splitCard}
              onChange={(e) => handleSplitCardChange(e.target.value)}
              placeholder="0.00"
              className="w-full h-9 px-3 bg-[#FAFAFA] border border-gray-200 rounded-xl text-[13px] font-black text-[#111111] focus:outline-none focus:border-[#7daa8f]"
            />
          </div>

          {/* Live Status Bar */}
          <div
            className={`p-2.5 rounded-xl border text-[11px] font-black flex items-center justify-between transition-colors ${
              (type === 'deposit' ? totalSplitPaid > 0 && totalSplitPaid <= targetAmount : splitRemaining === 0 && totalSplitPaid >= targetAmount)
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-red-50 border-red-200 text-red-600'
            }`}
          >
            <span>Paid: {formatCurrency(totalSplitPaid)}</span>
            <span>
              {type === 'deposit' ? 'Remaining Balance: ' : 'Remaining: '}
              {formatCurrency(splitRemaining)}
            </span>
          </div>

          {/* Change Due if Cash Overpayment */}
          {splitChangeDue > 0 && (
            <div className="flex justify-between items-center bg-blue-50 border border-blue-200 px-3 py-2 rounded-xl text-blue-800">
              <span className="text-[11px] font-bold">Change Due (Return to Customer):</span>
              <span className="text-[13px] font-black tabular-nums">{formatCurrency(splitChangeDue)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
