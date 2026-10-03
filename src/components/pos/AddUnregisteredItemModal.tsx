import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, PlusCircle, AlertCircle } from 'lucide-react'
import { useScrollLock } from '../../lib/scrollLock'
import { useLangStore } from '../../store/langStore'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSubmit: (item: {
    name: string
    price: number
    quantity: number
    note?: string
  }) => Promise<void>
}

export const AddUnregisteredItemModal: React.FC<Props> = ({ isOpen, onClose, onSubmit }) => {
  const { lang } = useLangStore()
  const l = (en: string, ta: string) => (lang === 'ta' ? ta : en)

  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Lock scroll while modal is open
  useScrollLock(isOpen)

  // Close on Escape key press
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError(l('Item name is required', 'பொருளின் பெயர் தேவை'))
      return
    }

    const numPrice = Number(price)
    if (isNaN(numPrice) || numPrice <= 0) {
      setError(l('Enter a valid price', 'சரியான விலையை உள்ளிடவும்'))
      return
    }

    const numQty = Number(quantity)
    if (isNaN(numQty) || numQty <= 0) {
      setError(l('Quantity must be at least 1', 'எண்ணிக்கை குறைந்தது 1 ஆக இருக்க வேண்டும்'))
      return
    }

    try {
      setIsSubmitting(true)
      await onSubmit({
        name: trimmedName,
        price: numPrice,
        quantity: numQty,
        note: note.trim() || undefined,
      })
      setName('')
      setPrice('')
      setQuantity('1')
      setNote('')
      setError('')
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to add item'
      setError(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      style={{
        paddingTop: 'max(16px, env(safe-area-inset-top))',
        paddingRight: 'max(16px, env(safe-area-inset-right))',
        paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
        paddingLeft: 'max(16px, env(safe-area-inset-left))',
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs overflow-y-auto overscroll-contain animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxHeight: 'calc(100dvh - 32px)',
        }}
        className="bg-white rounded-3xl w-full max-w-md my-auto flex flex-col shadow-2xl overflow-hidden border border-[#ead7b7]/50 animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="px-4 sm:px-5 py-3 border-b border-gray-200 flex items-center justify-between bg-[#FBFAF6] shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-600">
              <PlusCircle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-[#111111]">
                {l('Add Ad-Hoc Item', 'புதிய பொருளைச் சேர்')}
              </h3>
              <p className="text-[10px] text-gray-500 font-semibold">
                {l('Direct billing without inventory check', 'சரக்கு சரிபார்ப்பு இல்லாத பில்லிங்')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 sm:p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body & Sticky Actions */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="p-4 sm:p-5 space-y-3.5 overflow-y-auto flex-1 min-h-0 text-xs">
            {error && (
              <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[11px] font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block font-bold text-[#374151] mb-1">
                {l('Item Name *', 'பொருளின் பெயர் *')}
              </label>
              <input
                type="text"
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={l('e.g. Alteration Charge, Custom Dupatta', 'எ.கா. தையல் கட்டணம், துப்பட்டா')}
                className="w-full px-3 py-2 bg-[#FBFAF6] border border-gray-200 rounded-xl text-xs font-semibold text-[#111111] focus:outline-none focus:border-brand-black focus:bg-white transition-colors"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-[#374151] mb-1">
                  {l('Price (₹) *', 'விலை (₹) *')}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 bg-[#FBFAF6] border border-gray-200 rounded-xl text-xs font-bold text-[#111111] focus:outline-none focus:border-brand-black focus:bg-white transition-colors"
                />
              </div>
              <div>
                <label className="block font-bold text-[#374151] mb-1">
                  {l('Quantity *', 'எண்ணிக்கை *')}
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full px-3 py-2 bg-[#FBFAF6] border border-gray-200 rounded-xl text-xs font-bold text-[#111111] focus:outline-none focus:border-brand-black focus:bg-white transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-[#374151] mb-1">
                {l('Variant / Notes / Size (Optional)', 'வகை / குறிப்பு / அளவு (விருப்பமானது)')}
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={l('e.g. Size 38, Maroon, Urgent Stitching', 'எ.கா. அளவு 38, அவசரம்')}
                className="w-full px-3 py-2 bg-[#FBFAF6] border border-gray-200 rounded-xl text-xs font-semibold text-[#111111] focus:outline-none focus:border-brand-black focus:bg-white transition-colors"
              />
            </div>

            <div className="p-2.5 bg-amber-50/80 border border-amber-200 rounded-xl text-[11px] text-amber-900 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                {l(
                  'This item will be billed without checking or deducting inventory stock. It is tagged as Unregistered.',
                  'இந்த பொருள் சரக்கு இருப்பை குறைக்காமல் பில் செய்யப்படும். இது Unregistered பிரிவில் சேமிக்கப்படும்.'
                )}
              </p>
            </div>
          </div>

          {/* Sticky Footer Actions */}
          <div className="sticky bottom-0 z-20 shrink-0 bg-[#FBFAF6] border-t border-gray-200 px-4 sm:px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex items-center justify-end gap-2 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] sm:shadow-none">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none min-h-[48px] sm:min-h-0 sm:h-8 px-3 text-xs sm:text-[11px] font-bold rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer flex items-center justify-center"
            >
              {l('Cancel', 'ரத்து')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 sm:flex-none min-h-[48px] sm:min-h-0 sm:h-8 px-3.5 text-xs sm:text-[11px] font-bold rounded-lg bg-brand-black text-brand-onDark border border-[#7daa8f] hover:bg-[#1e2817] transition-all shadow-xs disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-[#7daa8f]/30 border-t-[#7daa8f] rounded-full animate-spin inline-block" />
                  <span>{l('Adding...', 'சேர்க்கிறது...')}</span>
                </>
              ) : (
                <>
                  <PlusCircle className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-[#7daa8f]" />
                  <span>{l('Add to Bill', 'பில்லில் சேர்')}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}
