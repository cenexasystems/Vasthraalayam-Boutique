import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Info, Loader2 } from 'lucide-react'
import {
  type LabelSizeConfig,
  createCustomSizeInDb,
  updateCustomSizeInDb,
  getCurrentBusinessId,
  createLabelConfig,
} from '../../lib/barcode'

interface CreateCustomSizeModalProps {
  isOpen: boolean
  onClose: () => void
  onSaved?: (newSize: LabelSizeConfig) => void
  onCreated?: (newSize: LabelSizeConfig) => void
  initialSize?: LabelSizeConfig | null
  businessId?: string
}

export const CreateCustomSizeModal: React.FC<CreateCustomSizeModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  onCreated,
  initialSize = null,
  businessId,
}) => {
  const isEditing = Boolean(initialSize)
  const activeBizId = businessId || getCurrentBusinessId()

  const [name, setName] = useState('')
  const [columns, setColumns] = useState<number>(1)
  const [rows, setRows] = useState<number>(1)
  const [widthMm, setWidthMm] = useState<string>('50')
  const [heightMm, setHeightMm] = useState<string>('38')
  const [gapXMm, setGapXMm] = useState<string>('2')
  const [gapYMm, setGapYMm] = useState<string>('0')
  const [marginTopMm, setMarginTopMm] = useState<string>('0')
  const [marginLeftMm, setMarginLeftMm] = useState<string>('0')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (initialSize) {
      setName(initialSize.label || initialSize.name || '')
      setColumns(initialSize.columns || initialSize.labelsPerRow || 1)
      setRows(initialSize.rows || 1)
      setWidthMm(String(initialSize.width_mm || initialSize.widthMm || 50))
      setHeightMm(String(initialSize.height_mm || initialSize.heightMm || 38))
      setGapXMm(String(initialSize.gap_mm ?? initialSize.horizontalGapMm ?? 2))
      setGapYMm(String(initialSize.gap_y_mm || 0))
      setMarginTopMm(String(initialSize.margin_top_mm || 0))
      setMarginLeftMm(String(initialSize.margin_left_mm || 0))
    } else {
      setName('')
      setColumns(1)
      setRows(1)
      setWidthMm('50')
      setHeightMm('38')
      setGapXMm('2')
      setGapYMm('0')
      setMarginTopMm('0')
      setMarginLeftMm('0')
    }
    setError('')
  }, [initialSize, isOpen])

  useEffect(() => {
    if (!isOpen) return
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('Please enter a custom size name')
      return
    }

    const w = parseFloat(widthMm)
    const h = parseFloat(heightMm)
    const gx = parseFloat(gapXMm) || 0
    const gy = parseFloat(gapYMm) || 0
    const mTop = parseFloat(marginTopMm) || 0
    const mLeft = parseFloat(marginLeftMm) || 0

    if (isNaN(w) || w < 10 || w > 210) {
      setError('Label width must be between 10 mm and 210 mm')
      return
    }
    if (isNaN(h) || h < 10 || h > 210) {
      setError('Label height must be between 10 mm and 210 mm')
      return
    }
    if (isNaN(columns) || columns < 1 || columns > 10) {
      setError('Columns must be between 1 and 10')
      return
    }
    if (isNaN(rows) || rows < 1 || rows > 25) {
      setError('Rows must be between 1 and 25')
      return
    }
    if (isNaN(gx) || gx < 0 || gx > 50 || isNaN(gy) || gy < 0 || gy > 50) {
      setError('Gaps must be between 0 mm and 50 mm')
      return
    }

    setSaving(true)
    try {
      let savedConfig: LabelSizeConfig
      if (isEditing && initialSize) {
        const updatedConfig = createLabelConfig({
          id: initialSize.id,
          width_mm: w,
          height_mm: h,
          columns,
          rows,
          gap_mm: gx,
          gap_y_mm: gy,
          margin_top_mm: mTop,
          margin_left_mm: mLeft,
          label: trimmedName,
          use_case: 'Custom Size',
          category: 'Custom Sizes',
          business_id: activeBizId,
          isCustom: true,
          isSheet: rows > 1 || columns > 3,
        })
        savedConfig = await updateCustomSizeInDb(updatedConfig, activeBizId)
      } else {
        savedConfig = await createCustomSizeInDb(
          {
            name: trimmedName,
            width_mm: w,
            height_mm: h,
            columns,
            rows,
            gap_mm: gx,
            gap_y_mm: gy,
            margin_top_mm: mTop,
            margin_left_mm: mLeft,
          },
          activeBizId
        )
      }

      if (onSaved) onSaved(savedConfig)
      if (onCreated) onCreated(savedConfig)
      onClose()
    } catch (err) {
      console.error('[CreateCustomSizeModal] Save error:', err)
      setError(err instanceof Error ? err.message : 'Failed to save custom size to database')
    } finally {
      setSaving(false)
    }
  }

  const numWidth = Math.max(10, Math.min(210, parseFloat(widthMm) || 50))
  const numHeight = Math.max(10, Math.min(210, parseFloat(heightMm) || 38))
  const numGapX = Math.max(0, Math.min(50, parseFloat(gapXMm) || 0))
  const numGapY = Math.max(0, Math.min(50, parseFloat(gapYMm) || 0))

  // Scaled aspect ratio preview calculations
  const totalW = numWidth * columns + (columns > 1 ? numGapX * (columns - 1) : 0)
  const totalH = numHeight * rows + (rows > 1 ? numGapY * (rows - 1) : 0)
  const totalAspectRatio = totalW / totalH
  const containerMaxW = 260
  const containerMaxH = 150
  let renderedW = containerMaxW
  let renderedH = containerMaxW / totalAspectRatio
  if (renderedH > containerMaxH) {
    renderedH = containerMaxH
    renderedW = containerMaxH * totalAspectRatio
  }
  const singleLabelPreviewWidth = Math.max(20, (renderedW - (columns > 1 ? numGapX * (columns - 1) : 0)) / columns)
  const singleLabelPreviewHeight = Math.max(16, (renderedH - (rows > 1 ? numGapY * (rows - 1) : 0)) / rows)

  return createPortal(
    <div className="fixed inset-0 top-0 left-0 right-0 bottom-0 w-screen h-screen h-[100dvh] z-[9999] flex items-center justify-center bg-black/75 backdrop-blur-xs p-0 sm:p-4 overflow-hidden animate-in fade-in duration-150">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 bg-white rounded-none sm:rounded-2xl max-w-2xl w-full h-screen h-[100dvh] sm:h-auto sm:max-h-[90vh] border-0 sm:border border-[#E5E7EB] shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-3.5 border-b border-gray-200 bg-brand-black text-white shrink-0">
          <h3 className="text-base font-black tracking-wide text-white">
            {isEditing ? 'Edit Custom Size' : 'Create Custom Size'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSave} className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-6">
            <div className="mb-3.5 flex items-start gap-2.5 rounded-xl bg-blue-50/80 border border-blue-200 px-3.5 py-2 text-xs text-blue-900 font-semibold">
              <Info size={15} className="text-blue-600 shrink-0 mt-0.5" />
              <span>
                Saved to your business database (Neon) and available on every device. Valid size limits: 10 mm to 210 mm.
              </span>
            </div>

            {error && (
              <div className="mb-3.5 rounded-xl bg-red-50 border border-red-200 px-3.5 py-2 text-xs font-bold text-red-700">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
              {/* Left Column: Form inputs */}
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-gray-700 mb-1">
                    Custom Size Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="e.g. 50 × 38 mm Special"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full h-9 px-3 rounded-xl border border-gray-300 bg-[#FBFAF6] text-xs font-bold text-gray-900 outline-none focus:border-brand-black focus:bg-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider text-gray-700 mb-1">
                      Label Width (mm)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="10"
                      max="210"
                      required
                      value={widthMm}
                      onChange={(e) => setWidthMm(e.target.value)}
                      className="w-full h-9 px-3 rounded-xl border border-gray-300 bg-[#FBFAF6] text-xs font-bold text-gray-900 outline-none focus:border-brand-black focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider text-gray-700 mb-1">
                      Label Height (mm)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="10"
                      max="210"
                      required
                      value={heightMm}
                      onChange={(e) => setHeightMm(e.target.value)}
                      className="w-full h-9 px-3 rounded-xl border border-gray-300 bg-[#FBFAF6] text-xs font-bold text-gray-900 outline-none focus:border-brand-black focus:bg-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider text-gray-700 mb-1">
                      Columns (Across)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      required
                      value={columns}
                      onChange={(e) => setColumns(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="w-full h-9 px-3 rounded-xl border border-gray-300 bg-[#FBFAF6] text-xs font-bold text-gray-900 outline-none focus:border-brand-black focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider text-gray-700 mb-1">
                      Rows (Down / Sheet)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="25"
                      required
                      value={rows}
                      onChange={(e) => setRows(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="w-full h-9 px-3 rounded-xl border border-gray-300 bg-[#FBFAF6] text-xs font-bold text-gray-900 outline-none focus:border-brand-black focus:bg-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider text-gray-700 mb-1">
                      Horizontal Gap (mm)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="50"
                      value={gapXMm}
                      onChange={(e) => setGapXMm(e.target.value)}
                      className="w-full h-9 px-3 rounded-xl border border-gray-300 bg-[#FBFAF6] text-xs font-bold text-gray-900 outline-none focus:border-brand-black focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider text-gray-700 mb-1">
                      Vertical Gap (mm)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="50"
                      value={gapYMm}
                      onChange={(e) => setGapYMm(e.target.value)}
                      className="w-full h-9 px-3 rounded-xl border border-gray-300 bg-[#FBFAF6] text-xs font-bold text-gray-900 outline-none focus:border-brand-black focus:bg-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider text-gray-700 mb-1">
                      Top Margin (mm)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="50"
                      value={marginTopMm}
                      onChange={(e) => setMarginTopMm(e.target.value)}
                      className="w-full h-9 px-3 rounded-xl border border-gray-300 bg-[#FBFAF6] text-xs font-bold text-gray-900 outline-none focus:border-brand-black focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider text-gray-700 mb-1">
                      Left Margin (mm)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="50"
                      value={marginLeftMm}
                      onChange={(e) => setMarginLeftMm(e.target.value)}
                      className="w-full h-9 px-3 rounded-xl border border-gray-300 bg-[#FBFAF6] text-xs font-bold text-gray-900 outline-none focus:border-brand-black focus:bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Right Column: Visual Interactive Preview scaled to real aspect ratio */}
              <div className="flex flex-col items-center justify-center">
                <span className="text-[11px] font-black uppercase tracking-wider text-gray-600 mb-2">
                  Layout Preview ({numWidth} × {numHeight} mm · {columns}×{rows})
                </span>
                <div className="w-full min-h-[220px] rounded-2xl bg-[#FFF9E6] border border-[#ead7b7] p-4 flex flex-col items-center justify-center relative shadow-inner overflow-hidden">
                  <div
                    className="grid gap-1 max-w-full"
                    style={{
                      width: `${Math.round(renderedW)}px`,
                      height: `${Math.round(renderedH)}px`,
                      gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                      gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
                    }}
                  >
                    {Array.from({ length: Math.min(colsAndRowsCap(columns, rows), 30) }).map((_, idx) => (
                      <div
                        key={idx}
                        className="bg-white rounded border border-gray-300 p-1 shadow-2xs flex flex-col items-center justify-between text-center overflow-hidden"
                        style={{
                          width: `${Math.round(singleLabelPreviewWidth)}px`,
                          height: `${Math.round(singleLabelPreviewHeight)}px`,
                        }}
                      >
                        {idx === 0 && (
                          <span className="text-[7px] font-black text-gray-800 tracking-wider truncate max-w-full">
                            {name || 'VASTHRAALAYAM'}
                          </span>
                        )}
                        <div className="w-full h-2.5 bg-gray-200 rounded flex items-center justify-center">
                          <span className="text-[5.5px] font-mono text-gray-700">||||||||</span>
                        </div>
                        <span className="text-[6px] font-bold text-gray-700">₹999</span>
                      </div>
                    ))}
                  </div>

                  {columns > 1 && numGapX > 0 && (
                    <span className="absolute top-2.5 right-2.5 bg-brand-black text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow-xs">
                      Gap X: {numGapX}mm
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Footer Action */}
          <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-4 py-3 sm:px-6 sm:py-3.5 bg-gray-50/80 shrink-0 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-xl border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 sm:px-6 py-2 rounded-xl bg-brand-black border border-[#7daa8f] text-brand-onDark text-xs font-black uppercase tracking-wider hover:bg-[#1e2817] transition-all shadow-md cursor-pointer flex items-center gap-1.5"
            >
              {saving && <Loader2 size={13} className="animate-spin" />}
              {isEditing ? 'Update Custom Size' : 'Save Custom Size'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}

function colsAndRowsCap(cols: number, rws: number): number {
  return cols * rws
}
