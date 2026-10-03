import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Calendar, Tag, AlertCircle, Edit2 } from 'lucide-react'
import { expenseService, type ExpenseCategory, type ExpenseRecord } from '../../services/expenseService'
import { useScrollLock } from '../../lib/scrollLock'

interface RecordExpenseModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (savedExpense: ExpenseRecord) => void
  categories: ExpenseCategory[]
  expenseToEdit?: ExpenseRecord | null
}

export const RecordExpenseModal: React.FC<RecordExpenseModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  categories,
  expenseToEdit,
}) => {
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [categoryId, setCategoryId] = useState<number | string>(() => categories[0]?.id || '')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // Sync state when modal opens or expenseToEdit changes
  useEffect(() => {
    if (isOpen) {
      if (expenseToEdit) {
        setExpenseDate(expenseToEdit.expense_date)
        setCategoryId(expenseToEdit.category_id || (categories[0]?.id || ''))
        setAmount(String(expenseToEdit.amount))
        setDescription(expenseToEdit.description || '')
      } else {
        setExpenseDate(new Date().toISOString().slice(0, 10))
        setCategoryId(categories[0]?.id || '')
        setAmount('')
        setDescription('')
      }
      setErrorMsg('')
    }
  }, [isOpen, expenseToEdit, categories])

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  useScrollLock(isOpen)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')

    const numAmount = parseFloat(amount)
    if (isNaN(numAmount) || numAmount <= 0) {
      setErrorMsg('Please enter a valid positive amount.')
      return
    }

    const selectedCategory = categories.find((c) => String(c.id) === String(categoryId))
    const categoryName = selectedCategory ? selectedCategory.name : 'Other'

    setLoading(true)
    try {
      if (expenseToEdit) {
        const updated = await expenseService.updateExpense(expenseToEdit.id, {
          expense_date: expenseDate,
          category_id: selectedCategory ? selectedCategory.id : null,
          category_name: categoryName,
          amount: numAmount,
          description: description.trim(),
        })
        onSuccess(updated)
      } else {
        const created = await expenseService.createExpense({
          expense_date: expenseDate,
          category_id: selectedCategory ? selectedCategory.id : null,
          category_name: categoryName,
          amount: numAmount,
          description: description.trim(),
          payment_mode: 'cash',
          recorded_by_name: 'Admin',
        })
        onSuccess(created)
      }
      onClose()
    } catch (err: unknown) {
      console.error('Failed to save expense:', err)
      const msg = err instanceof Error ? err.message : 'An error occurred while saving expense'
      setErrorMsg(msg)
    } finally {
      setLoading(false)
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
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-xs overflow-y-auto overscroll-contain animate-in fade-in duration-150"
    >
      <div className="fixed inset-0" onClick={onClose} />
      <div
        style={{ maxHeight: 'calc(100dvh - 32px)' }}
        className="relative z-10 bg-white rounded-3xl max-w-md w-full border border-[#ead7b7] shadow-2xl overflow-hidden flex flex-col my-auto animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="shrink-0 px-5 py-3.5 border-b border-gray-100 flex items-center justify-between bg-[#FBFAF6]">
          <div className="flex items-center gap-2">
            {expenseToEdit ? (
              <Edit2 size={17} className="text-[#7daa8f]" />
            ) : (
              <Tag size={17} className="text-[#7daa8f]" />
            )}
            <h3 className="text-sm font-bold text-brand-black">
              {expenseToEdit ? 'Edit Expense Record' : 'Record Expense'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-700 cursor-pointer transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden min-h-0">
          <div className="overflow-y-auto min-h-0 flex-1 p-4 sm:p-6 space-y-4">
          {errorMsg && (
            <div className="flex items-center gap-2 text-xs font-bold text-rose-800 bg-rose-50 border border-rose-200 p-3 rounded-xl">
              <AlertCircle size={15} className="text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Date Picker */}
          <div>
            <label className="block text-[11px] font-bold text-gray-700 mb-1">
              Date <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="date"
                required
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className="w-full h-11 px-3 pl-9 rounded-xl border border-gray-300 bg-[#FAFAFA] text-xs font-bold text-gray-900 outline-none focus:border-brand-black focus:bg-white transition-all box-border max-w-full min-w-0"
              />
              <Calendar size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Category Dropdown */}
          <div>
            <label className="block text-[11px] font-bold text-gray-700 mb-1">
              Category <span className="text-red-500">*</span>
            </label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-gray-300 bg-[#FAFAFA] text-xs font-bold text-gray-900 outline-none focus:border-brand-black focus:bg-white cursor-pointer transition-all"
            >
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          {/* Amount (₹) */}
          <div>
            <label className="block text-[11px] font-bold text-gray-700 mb-1">
              Amount (₹) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-sm text-brand-black">
                ₹
              </span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full h-11 pl-8 pr-3 rounded-xl border border-gray-300 bg-[#FAFAFA] text-sm font-bold text-gray-900 outline-none focus:border-brand-black focus:bg-white transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-[11px] font-bold text-gray-700 mb-1">
              Description / Notes
            </label>
            <textarea
              rows={3}
              placeholder="Optional details (e.g. Shop electric bill, store supplies)..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full p-3 rounded-xl border border-gray-300 bg-[#FAFAFA] text-xs font-medium text-gray-900 outline-none focus:border-brand-black focus:bg-white resize-none transition-all"
            />
          </div>

          </div>

          {/* Sticky Modal Actions */}
          <div className="sticky bottom-0 z-20 shrink-0 bg-[#FBFAF6] px-4 py-3 sm:px-6 sm:py-3.5 border-t border-gray-100 flex items-center gap-2.5 sm:gap-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_12px_rgba(0,0,0,0.06)] sm:shadow-none">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 min-h-[48px] sm:min-h-0 sm:h-11 rounded-xl border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer flex items-center justify-center shrink-0"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-[1.5] min-h-[48px] sm:min-h-0 sm:h-11 rounded-xl bg-brand-black border border-[#7daa8f] text-brand-onDark text-xs font-bold hover:bg-[#1e2817] transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shrink-0"
            >
              {loading
                ? expenseToEdit
                  ? 'Updating...'
                  : 'Saving...'
                : expenseToEdit
                  ? 'Update Expense'
                  : 'Save Expense'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}
