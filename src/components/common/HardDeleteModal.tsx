import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Trash2, X, Loader2, Download, CheckCircle2 } from 'lucide-react'
import { useScrollLock } from '../../lib/scrollLock'

export interface ImpactDetail {
  label: string
  value: string
  color?: 'danger' | 'success' | 'warning' | 'neutral'
}

interface HardDeleteModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => Promise<{ backupId?: string | number; message?: string } | void>
  title: string
  subtitle?: string
  entityType: 'order' | 'advance_order' | 'product' | 'variant' | 'category' | 'coupon' | 'movement'
  impactDetails?: ImpactDetail[]
  requireTypeDelete?: boolean
  warningText?: string
}

export const HardDeleteModal: React.FC<HardDeleteModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  subtitle,
  entityType,
  impactDetails = [],
  requireTypeDelete = true,
  warningText = 'This action is permanent and irreversible. All linked records and data will be removed or recalculated.',
}) => {
  const [confirmInput, setConfirmInput] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deletedBackupId, setDeletedBackupId] = useState<string | number | null>(null)

  useScrollLock(isOpen)

  useEffect(() => {
    if (isOpen) {
      setConfirmInput('')
      setError(null)
      setIsDeleting(false)
      setDeletedBackupId(null)
    }
  }, [isOpen])

  if (!isOpen) return null

  const isConfirmed = !requireTypeDelete || confirmInput.trim().toUpperCase() === 'DELETE'

  const handleConfirm = async () => {
    if (!isConfirmed || isDeleting) return
    setIsDeleting(true)
    setError(null)
    try {
      const res = await onConfirm()
      if (res && res.backupId) {
        setDeletedBackupId(res.backupId)
      } else {
        onClose()
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred during deletion.')
      setIsDeleting(false)
    }
  }

  const handleDownloadBackup = () => {
    if (!deletedBackupId) return
    window.open(`/api/backups?id=${deletedBackupId}&download=true`, '_blank')
  }

  return createPortal(
    <div
      style={{
        paddingTop: 'max(16px, env(safe-area-inset-top))',
        paddingRight: 'max(16px, env(safe-area-inset-right))',
        paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
        paddingLeft: 'max(16px, env(safe-area-inset-left))',
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs overflow-y-auto overscroll-contain animate-in fade-in duration-150"
    >
      <div className="fixed inset-0" onClick={onClose} />
      <div
        style={{ maxHeight: 'calc(100dvh - 32px)' }}
        className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col my-auto"
      >
        {/* Header */}
        <div className="flex items-start justify-between p-4 sm:p-5 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0 border border-red-100">
              <Trash2 size={20} />
            </div>
            <div>
              <h3 className="text-base font-black text-gray-900 leading-snug">{title}</h3>
              {subtitle && <p className="text-xs font-semibold text-gray-500 mt-0.5">{subtitle}</p>}
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 min-h-0">
          {deletedBackupId ? (
            <div className="space-y-4 py-2 text-center">
              <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto border border-emerald-100">
                <CheckCircle2 size={24} />
              </div>
              <div>
                <h4 className="text-sm font-black text-gray-900">Permanently Deleted</h4>
                <p className="text-xs text-gray-500 mt-1">
                  The {entityType.replace('_', ' ')} and all related records were successfully removed.
                </p>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-left text-xs text-gray-600 space-y-1">
                <span className="font-bold text-gray-800">Safety Backup Created:</span>
                <p className="text-[11px] text-gray-500">
                  An immutable JSON snapshot was preserved in the audit log.
                </p>
                <button
                  type="button"
                  onClick={handleDownloadBackup}
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-xs font-bold text-gray-700 rounded-lg hover:bg-gray-50 shadow-xs transition-all cursor-pointer"
                >
                  <Download size={14} /> Download Backup JSON
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Warning Banner */}
              <div className="flex gap-2.5 p-3 rounded-xl bg-amber-50/80 border border-amber-200/80 text-amber-900 text-xs leading-relaxed">
                <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <span>{warningText}</span>
              </div>

              {/* Impact Breakdown */}
              {impactDetails.length > 0 && (
                <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-3.5 space-y-2">
                  <div className="text-[11px] font-black uppercase tracking-wider text-gray-400">
                    Deletion Impact Summary
                  </div>
                  <div className="space-y-1.5">
                    {impactDetails.map((detail, idx) => (
                      <div key={idx} className="flex justify-between items-center text-xs">
                        <span className="text-gray-600 font-medium">{detail.label}</span>
                        <span
                          className={`font-bold ${
                            detail.color === 'danger'
                              ? 'text-red-600'
                              : detail.color === 'success'
                              ? 'text-emerald-700'
                              : detail.color === 'warning'
                              ? 'text-amber-700'
                              : 'text-gray-900'
                          }`}
                        >
                          {detail.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Type DELETE Input */}
              {requireTypeDelete && (
                <div className="space-y-1.5 pt-1">
                  <label className="block text-xs font-bold text-gray-700">
                    Type <span className="font-black text-red-600 tracking-wider">DELETE</span> to confirm:
                  </label>
                  <input
                    type="text"
                    value={confirmInput}
                    onChange={(e) => setConfirmInput(e.target.value)}
                    placeholder="DELETE"
                    disabled={isDeleting}
                    className="w-full px-3 py-2 text-xs font-bold text-gray-900 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-red-500 uppercase tracking-widest placeholder:text-gray-300 placeholder:normal-case"
                  />
                </div>
              )}

              {/* Error Toast */}
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-semibold">
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        {/* Sticky Footer */}
        <div className="sticky bottom-0 z-20 p-4 bg-gray-50/95 border-t border-gray-100 flex items-center justify-end gap-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_12px_rgba(0,0,0,0.06)] sm:shadow-none shrink-0">
          {deletedBackupId ? (
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-initial min-h-[48px] sm:min-h-0 px-4 py-2 text-xs font-black text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-100 transition-colors cursor-pointer flex items-center justify-center"
            >
              Done
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={isDeleting}
                className="flex-1 sm:flex-initial min-h-[48px] sm:min-h-0 px-4 py-2 text-xs font-bold text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!isConfirmed || isDeleting}
                className="flex-[1.5] sm:flex-initial min-h-[48px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-black text-white bg-red-600 hover:bg-red-700 active:scale-98 rounded-xl transition-all shadow-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isDeleting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Permanently Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={14} />
                    <span>Permanently Delete</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
