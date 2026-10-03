import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  X,
  SlidersHorizontal,
  AlertCircle,
  CheckCircle2,
  PlusCircle,
  MinusCircle,
  Target,
  ArrowRight,
  Package,
} from 'lucide-react'
import { inventoryService, type InventoryStockItem } from '../../services/inventoryService'
import { BRAND_EN } from '../../lib/brand'
import { useScrollLock } from '../../lib/scrollLock'

export interface AdjustStockModalProps {
  isOpen: boolean
  onClose: () => void
  item: InventoryStockItem | null
  onSuccess?: () => void
}

type AdjustMode = 'RESTOCK' | 'REMOVE' | 'CORRECTION'
type RemoveReason = 'DAMAGE' | 'RETURN' | 'CORRECTION'

export const AdjustStockModal: React.FC<AdjustStockModalProps> = ({
  isOpen,
  onClose,
  item,
  onSuccess,
}) => {
  const [mode, setMode] = useState<AdjustMode>('RESTOCK')
  const [addQuantity, setAddQuantity] = useState<number | ''>(0)
  const [removeQuantity, setRemoveQuantity] = useState<number | ''>(0)
  const [removeReason, setRemoveReason] = useState<RemoveReason>('DAMAGE')
  const [correctedQuantity, setCorrectedQuantity] = useState<number | ''>(0)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (item && isOpen) {
      setMode('RESTOCK')
      setAddQuantity(0)
      setRemoveQuantity(0)
      setRemoveReason('DAMAGE')
      setCorrectedQuantity(item.stock)
      setNote('')
      setError('')
    }
  }, [item, isOpen])

  // Close on Escape key & lock body scrolling when open
  useScrollLock(isOpen)
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  if (!isOpen || !item) return null

  const currentStock = item.stock
  const numAdd = typeof addQuantity === 'number' ? addQuantity : 0
  const numRemove = typeof removeQuantity === 'number' ? removeQuantity : 0
  const numCorrected = typeof correctedQuantity === 'number' ? correctedQuantity : 0

  // Calculate effective new total stock and delta based on active mode
  let effectiveNewStock = currentStock
  let delta = 0
  let effectiveReason: 'RESTOCK' | 'DAMAGE' | 'CORRECTION' | 'RETURN' = 'RESTOCK'

  if (mode === 'RESTOCK') {
    effectiveNewStock = currentStock + Math.max(0, numAdd)
    delta = numAdd
    effectiveReason = 'RESTOCK'
  } else if (mode === 'REMOVE') {
    effectiveNewStock = Math.max(0, currentStock - Math.max(0, numRemove))
    delta = -Math.min(currentStock, Math.max(0, numRemove))
    effectiveReason = removeReason
  } else {
    effectiveNewStock = Math.max(0, numCorrected)
    delta = effectiveNewStock - currentStock
    effectiveReason = 'CORRECTION'
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (mode === 'RESTOCK' && numAdd <= 0) {
      setError('Please enter a valid quantity to add (minimum 1 unit)')
      return
    }

    if (mode === 'REMOVE') {
      if (numRemove <= 0) {
        setError('Please enter a valid quantity to remove (minimum 1 unit)')
        return
      }
      if (currentStock <= 0) {
        setError('Current stock is 0. Cannot remove units from an empty stock.')
        return
      }
      if (numRemove > currentStock) {
        setError(`Cannot remove ${numRemove} units. Maximum available stock to remove is ${currentStock}.`)
        return
      }
    }

    if (mode === 'CORRECTION' && numCorrected < 0) {
      setError('Reconciled stock quantity cannot be negative.')
      return
    }

    if (delta === 0) {
      setError('No stock change detected. Please adjust the quantity.')
      return
    }

    setSubmitting(true)

    try {
      await inventoryService.adjustStock({
        product_id: item.product_id,
        variant_id: item.variant_id || null,
        new_quantity: effectiveNewStock,
        reason: effectiveReason,
        note: note.trim() || undefined,
        created_by_name: 'Admin',
      })

      onSuccess?.()
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to adjust stock'
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return createPortal(
    <div
      style={{
        paddingTop: 'max(16px, env(safe-area-inset-top))',
        paddingRight: 'max(16px, env(safe-area-inset-right))',
        paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
        paddingLeft: 'max(16px, env(safe-area-inset-left))',
      }}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 backdrop-blur-sm overflow-y-auto overscroll-contain animate-in fade-in duration-150"
    >
      <div className="fixed inset-0" onClick={onClose} />
      <div
        style={{ maxHeight: 'calc(100dvh - 32px)' }}
        className="relative z-10 bg-white rounded-3xl max-w-lg w-full border border-[#ead7b7] shadow-2xl overflow-hidden flex flex-col my-auto animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="shrink-0 bg-brand-black px-4 py-3 sm:px-5 sm:py-3.5 border-b border-[#7daa8f]/30 flex items-center justify-between text-white">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#1e2817] border border-[#7daa8f] flex items-center justify-center text-[#7daa8f]">
              <SlidersHorizontal size={16} />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black tracking-wide text-white leading-tight">
                Adjust Inventory Stock ({BRAND_EN})
              </h2>
              <p className="text-[11px] text-[#7daa8f] font-semibold leading-tight">
                Restock, remove stock, or reconcile physical count
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden min-h-0">
          <div className="overflow-y-auto flex-1 p-4 sm:p-5 space-y-3.5">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3.5 py-2 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle size={15} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Target SKU card */}
            <div className="bg-[#FBFAF6] border border-[#ead7b7] rounded-xl p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-wider text-[#5f6d59] flex items-center gap-1">
                    <Package size={11} /> Target SKU / Product
                  </div>
                  <div className="text-xs sm:text-sm font-black text-black truncate mt-0.5">
                    {item.name}
                  </div>
                  {item.variant_name && (
                    <span className="inline-block text-[11px] font-bold text-amber-900 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300 mt-1">
                      Variant: {item.variant_name}
                    </span>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider block">
                    Current Stock
                  </span>
                  <span className="text-base font-black text-black">{currentStock}</span>
                  <span className="text-[11px] font-bold text-gray-600 ml-1">units</span>
                </div>
              </div>
              {item.barcode && (
                <div className="mt-1.5 pt-1.5 border-t border-[#ead7b7]/40 flex items-center gap-1.5 text-[11px] font-semibold text-gray-600">
                  <span>Barcode:</span>
                  <strong className="font-mono text-black bg-white px-1.5 py-0.2 rounded border border-gray-200">
                    {item.barcode}
                  </strong>
                </div>
              )}
            </div>

            {/* Action Mode Selector Tabs */}
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-gray-700 mb-1.5">
                Select Adjustment Type <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                {/* RESTOCK TAB */}
                <button
                  type="button"
                  onClick={() => { setMode('RESTOCK'); setError('') }}
                  className={`flex flex-col items-center justify-center p-2 sm:p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                    mode === 'RESTOCK'
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-900 shadow-sm ring-2 ring-emerald-500/20'
                      : 'bg-[#FBFAF6] border-gray-200 text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <PlusCircle size={17} className={mode === 'RESTOCK' ? 'text-emerald-600' : 'text-gray-400'} />
                  <span className="text-xs font-black mt-0.5">Restock</span>
                  <span className="text-[9px] font-semibold text-gray-500">+ Add Units</span>
                </button>

                {/* REMOVE TAB */}
                <button
                  type="button"
                  onClick={() => { setMode('REMOVE'); setError('') }}
                  className={`flex flex-col items-center justify-center p-2 sm:p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                    mode === 'REMOVE'
                      ? 'bg-rose-50 border-rose-500 text-rose-900 shadow-sm ring-2 ring-rose-500/20'
                      : 'bg-[#FBFAF6] border-gray-200 text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <MinusCircle size={17} className={mode === 'REMOVE' ? 'text-rose-600' : 'text-gray-400'} />
                  <span className="text-xs font-black mt-0.5">Remove Stock</span>
                  <span className="text-[9px] font-semibold text-gray-500">- Deduct Units</span>
                </button>

                {/* RECONCILE TAB */}
                <button
                  type="button"
                  onClick={() => { setMode('CORRECTION'); setError('') }}
                  className={`flex flex-col items-center justify-center p-2 sm:p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                    mode === 'CORRECTION'
                      ? 'bg-amber-50 border-[#7daa8f] text-amber-950 shadow-sm ring-2 ring-[#7daa8f]/30'
                      : 'bg-[#FBFAF6] border-gray-200 text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <Target size={17} className={mode === 'CORRECTION' ? 'text-[#7daa8f]' : 'text-gray-400'} />
                  <span className="text-xs font-black mt-0.5">Reconciliation</span>
                  <span className="text-[9px] font-semibold text-gray-500">Set Exact Count</span>
                </button>
              </div>
            </div>

            {/* MODE 1: RESTOCK INPUT */}
            {mode === 'RESTOCK' && (
              <div className="space-y-2.5 bg-emerald-50/60 border border-emerald-200 p-3 sm:p-3.5 rounded-xl">
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-emerald-900 mb-1">
                    Quantity to Add (Restock) <span className="text-red-500">*</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setAddQuantity((q) => (typeof q === 'number' ? Math.max(0, q - 1) : 0))}
                      className="w-10 h-10 rounded-lg bg-white hover:bg-emerald-100 text-emerald-900 font-black text-lg flex items-center justify-center border border-emerald-300 transition-colors"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min="0"
                      value={addQuantity}
                      onChange={(e) => {
                        const val = e.target.value
                        if (val === '') {
                          setAddQuantity('')
                        } else {
                          const parsed = parseInt(val, 10)
                          setAddQuantity(isNaN(parsed) ? '' : Math.max(0, parsed))
                        }
                      }}
                      onBlur={() => {
                        if (addQuantity === '') setAddQuantity(0)
                      }}
                      className="flex-1 text-center font-black text-xl py-1.5 rounded-lg border-2 border-emerald-400 bg-white text-emerald-950 focus:border-emerald-600 outline-none shadow-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setAddQuantity((q) => (typeof q === 'number' ? q + 1 : 1))}
                      className="w-10 h-10 rounded-lg bg-white hover:bg-emerald-100 text-emerald-900 font-black text-lg flex items-center justify-center border border-emerald-300 transition-colors"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Quick Preset Buttons */}
                <div className="flex flex-wrap items-center gap-1 pt-0.5">
                  <span className="text-[10px] font-bold text-emerald-800 mr-1">Quick Add:</span>
                  {[1, 5, 10, 25, 50, 100].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setAddQuantity(preset)}
                      className={`px-2 py-0.5 rounded-md text-[11px] font-bold border transition-colors cursor-pointer ${
                        addQuantity === preset
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white text-emerald-900 border-emerald-200 hover:bg-emerald-100'
                      }`}
                    >
                      +{preset}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* MODE 2: REMOVE STOCK INPUT */}
            {mode === 'REMOVE' && (
              <div className="space-y-2.5 bg-rose-50/60 border border-rose-200 p-3 sm:p-3.5 rounded-xl">
                {/* Removal Reason Sub-picker */}
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-rose-900 mb-1">
                    Removal Reason <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setRemoveReason('DAMAGE')}
                      className={`py-1.5 px-1.5 rounded-lg text-[11px] font-black border transition-all ${
                        removeReason === 'DAMAGE'
                          ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                          : 'bg-white text-rose-900 border-rose-200 hover:bg-rose-100'
                      }`}
                    >
                      Damaged / Defect
                    </button>
                    <button
                      type="button"
                      onClick={() => setRemoveReason('RETURN')}
                      className={`py-1.5 px-1.5 rounded-lg text-[11px] font-black border transition-all ${
                        removeReason === 'RETURN'
                          ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                          : 'bg-white text-rose-900 border-rose-200 hover:bg-rose-100'
                      }`}
                    >
                      Vendor Return
                    </button>
                    <button
                      type="button"
                      onClick={() => setRemoveReason('CORRECTION')}
                      className={`py-1.5 px-1.5 rounded-lg text-[11px] font-black border transition-all ${
                        removeReason === 'CORRECTION'
                          ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                          : 'bg-white text-rose-900 border-rose-200 hover:bg-rose-100'
                      }`}
                    >
                      Lost / Shrinkage
                    </button>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-black uppercase tracking-wider text-rose-900">
                      Quantity to Remove <span className="text-red-500">*</span>
                    </label>
                    <span className="text-[10px] font-bold text-rose-700">
                      Max: {currentStock} units
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setRemoveQuantity((q) => (typeof q === 'number' ? Math.max(0, q - 1) : 0))}
                      className="w-10 h-10 rounded-lg bg-white hover:bg-rose-100 text-rose-900 font-black text-lg flex items-center justify-center border border-rose-300 transition-colors"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min="0"
                      max={currentStock}
                      value={removeQuantity}
                      onChange={(e) => {
                        const val = e.target.value
                        if (val === '') {
                          setRemoveQuantity('')
                        } else {
                          const parsed = parseInt(val, 10)
                          setRemoveQuantity(isNaN(parsed) ? '' : Math.min(currentStock, Math.max(0, parsed)))
                        }
                      }}
                      onBlur={() => {
                        if (removeQuantity === '') setRemoveQuantity(0)
                      }}
                      className="flex-1 text-center font-black text-xl py-1.5 rounded-lg border-2 border-rose-400 bg-white text-rose-950 focus:border-rose-600 outline-none shadow-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setRemoveQuantity((q) => (typeof q === 'number' ? Math.min(currentStock, q + 1) : 1))}
                      className="w-10 h-10 rounded-lg bg-white hover:bg-rose-100 text-rose-900 font-black text-lg flex items-center justify-center border border-rose-300 transition-colors"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Quick Preset Buttons */}
                <div className="flex flex-wrap items-center gap-1 pt-0.5">
                  <span className="text-[10px] font-bold text-rose-800 mr-1">Quick Remove:</span>
                  {[1, 2, 5, 10].filter((p) => p <= currentStock).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setRemoveQuantity(preset)}
                      className={`px-2 py-0.5 rounded-md text-[11px] font-bold border transition-colors cursor-pointer ${
                        removeQuantity === preset
                          ? 'bg-rose-600 text-white border-rose-600'
                          : 'bg-white text-rose-900 border-rose-200 hover:bg-rose-100'
                      }`}
                    >
                      -{preset}
                    </button>
                  ))}
                  {currentStock > 0 && (
                    <button
                      type="button"
                      onClick={() => setRemoveQuantity(currentStock)}
                      className="px-2 py-0.5 rounded-md text-[11px] font-black border bg-rose-100 text-rose-900 border-rose-300 hover:bg-rose-200"
                    >
                      Clear All ({currentStock})
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* MODE 3: RECONCILIATION COUNT INPUT */}
            {mode === 'CORRECTION' && (
              <div className="space-y-2.5 bg-amber-50/60 border border-[#ead7b7] p-3 sm:p-3.5 rounded-xl">
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-amber-950 mb-1">
                    Actual Audited Physical Count <span className="text-red-500">*</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCorrectedQuantity((q) => (typeof q === 'number' ? Math.max(0, q - 1) : 0))}
                      className="w-10 h-10 rounded-lg bg-white hover:bg-amber-100 text-amber-950 font-black text-lg flex items-center justify-center border border-amber-300 transition-colors"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min="0"
                      value={correctedQuantity}
                      onChange={(e) => {
                        const val = e.target.value
                        if (val === '') {
                          setCorrectedQuantity('')
                        } else {
                          const parsed = parseInt(val, 10)
                          setCorrectedQuantity(isNaN(parsed) ? '' : Math.max(0, parsed))
                        }
                      }}
                      onBlur={() => {
                        if (correctedQuantity === '') setCorrectedQuantity(0)
                      }}
                      className="flex-1 text-center font-black text-xl py-1.5 rounded-lg border-2 border-[#7daa8f] bg-white text-black focus:border-black outline-none shadow-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setCorrectedQuantity((q) => (typeof q === 'number' ? q + 1 : 1))}
                      className="w-10 h-10 rounded-lg bg-white hover:bg-amber-100 text-amber-950 font-black text-lg flex items-center justify-center border border-amber-300 transition-colors"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Real-time Math Preview Banner */}
            <div className="bg-[#FBFAF6] border border-[#ead7b7] rounded-xl p-2.5 sm:p-3 flex items-center justify-between text-xs font-bold">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="text-gray-500 text-[11px]">Current:</span>
                <span className="text-black font-black text-xs sm:text-sm">{currentStock}</span>
                <ArrowRight size={13} className="text-gray-400" />
                <span className="text-gray-500 text-[11px]">New Stock:</span>
                <span
                  className={`text-xs sm:text-sm font-black ${
                    effectiveNewStock > currentStock
                      ? 'text-emerald-700'
                      : effectiveNewStock < currentStock
                      ? 'text-rose-700'
                      : 'text-gray-700'
                  }`}
                >
                  {effectiveNewStock} units
                </span>
              </div>
              <span
                className={`px-2 py-0.5 rounded-full text-[11px] font-black ${
                  delta > 0
                    ? 'bg-emerald-100 text-emerald-800'
                    : delta < 0
                    ? 'bg-rose-100 text-rose-800'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {delta > 0 ? `+${delta}` : delta}
              </span>
            </div>

            {/* Note Input */}
            <div>
              <label className="block text-[11px] font-bold text-gray-600 mb-1">
                Adjustment Note / Reason Description (Optional)
              </label>
              <input
                type="text"
                placeholder={
                  mode === 'RESTOCK'
                    ? 'e.g. Received new stock shipment / batch delivery'
                    : mode === 'REMOVE'
                    ? 'e.g. Broken packaging, water damage, supplier return'
                    : 'e.g. Physical inventory count reconciliation'
                }
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full py-2 px-3 rounded-xl border border-gray-300 bg-white text-xs text-gray-900 outline-none focus:border-brand-black"
              />
            </div>
          </div>

          {/* Sticky Action Bar at the bottom */}
          <div className="sticky bottom-0 z-20 shrink-0 px-4 py-3 sm:px-5 sm:py-3 bg-[#FBFAF6] border-t border-gray-200 flex items-center justify-end gap-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_12px_rgba(0,0,0,0.06)] sm:shadow-none">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-initial min-h-[48px] sm:min-h-0 py-2.5 sm:py-2 px-4 rounded-xl border border-gray-300 text-gray-700 text-xs sm:text-xs font-bold hover:bg-gray-100 transition-colors cursor-pointer flex items-center justify-center shrink-0"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || delta === 0}
              className={`flex-[1.5] sm:flex-initial min-h-[48px] sm:min-h-0 py-2.5 sm:py-2 px-4 sm:px-5 rounded-xl text-xs font-black transition-all shadow-md disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5 shrink-0 ${
                mode === 'RESTOCK'
                  ? 'bg-brand-black border border-[#7daa8f] text-brand-onDark hover:bg-[#1e2817]'
                  : mode === 'REMOVE'
                  ? 'bg-rose-700 text-white hover:bg-rose-800 border border-rose-800'
                  : 'bg-brand-black border border-[#7daa8f] text-brand-onDark hover:bg-[#1e2817]'
              }`}
            >
              {submitting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={15} />
                  <span>
                    {mode === 'RESTOCK'
                      ? `Confirm Restock (+${numAdd} Units)`
                      : mode === 'REMOVE'
                      ? `Confirm Removal (-${numRemove} Units)`
                      : `Confirm Reconciliation (${effectiveNewStock} Units)`}
                  </span>
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
