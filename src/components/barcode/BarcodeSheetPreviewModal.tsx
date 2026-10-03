import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, Printer } from 'lucide-react'
import { useScrollLock } from '../../lib/scrollLock'
import {
  type BarcodeQueueItem,
  type LabelSizeConfig,
  renderBarcodeSvg,
} from '../../lib/barcode'

interface BarcodeSheetPreviewModalProps {
  isOpen: boolean
  onClose: () => void
  items: BarcodeQueueItem[]
  sizeConfig: LabelSizeConfig
  onPrint: () => void
}

export const BarcodeSheetPreviewModal: React.FC<BarcodeSheetPreviewModalProps> = ({
  isOpen,
  onClose,
  items,
  sizeConfig,
  onPrint,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)

  // Expand all selected queue items into individual labels based on `noOfLabels`
  const individualLabels: BarcodeQueueItem[] = []
  items
    .filter((it) => it.selected)
    .forEach((it) => {
      const count = Math.max(1, it.noOfLabels || 1)
      for (let i = 0; i < count; i++) {
        individualLabels.push(it)
      }
    })

  // Proportional card dimensions for preview sheet (matches physical label aspect ratio)
  const cardScale = Math.min(4.8, 195 / sizeConfig.widthMm)
  const cardWidthPx = Math.max(130, Math.round(sizeConfig.widthMm * cardScale))
  const cardHeightPx = Math.max(85, Math.round(sizeConfig.heightMm * cardScale))
  const cardBarcodeHeightPx = Math.max(22, Math.round(cardHeightPx * 0.48))
  const cardBarcodeWidth = Math.max(0.80, Math.min(1.85, Math.round(((cardWidthPx * 0.85) / 115) * 100) / 100))

  useEffect(() => {
    if (!isOpen || !containerRef.current) return

    // Render SVG barcode for each label using calculated dimensions
    const svgs = containerRef.current.querySelectorAll<SVGSVGElement>('svg.preview-barcode-svg')
    svgs.forEach((svg) => {
      const code = svg.getAttribute('data-barcode')
      if (code) {
        renderBarcodeSvg(svg, code, {
          width: cardBarcodeWidth,
          height: cardBarcodeHeightPx,
          fontSize: Math.max(7, Math.round(cardHeightPx * 0.08)),
          displayValue: false,
          margin: 0,
        })
      }
    })
  }, [
    isOpen,
    individualLabels.length,
    sizeConfig.id,
    sizeConfig.widthMm,
    sizeConfig.heightMm,
    cardBarcodeHeightPx,
    cardBarcodeWidth,
    cardHeightPx,
  ])

  // Lock body scrolling and close on Escape
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
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 backdrop-blur-sm overflow-y-auto overscroll-contain animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxHeight: 'calc(100dvh - 32px)',
        }}
        className="relative z-10 bg-white rounded-3xl max-w-4xl w-full my-auto border border-gray-200 shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-b border-gray-200 bg-brand-black text-white shrink-0">
          <div>
            <h3 className="text-sm sm:text-base font-black tracking-wide text-white">Print Preview</h3>
            <p className="text-[11px] sm:text-xs text-[#7daa8f] font-semibold">
              {individualLabels.length} Labels (1 Barcode Per Page • {sizeConfig.name} • {sizeConfig.widthMm} × {sizeConfig.heightMm} mm)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Preview Sheet Body */}
        <div
          ref={containerRef}
          className="flex-1 overflow-y-auto p-6 bg-gray-100/70 flex justify-center"
        >
          <div className="flex flex-wrap items-center justify-center gap-4 w-full">
            {individualLabels.map((label, idx) => (
              <div key={`${label.id}-${idx}`} className="flex flex-col items-center">
                <span className="text-[10px] font-bold text-gray-500 mb-1.5 font-mono">
                  Page {idx + 1}
                </span>
                <div
                  className="bg-white rounded-xl border border-gray-300 p-2.5 shadow-sm flex flex-col justify-between items-center text-center relative transition-all"
                  style={{
                    width: `${cardWidthPx}px`,
                    height: `${cardHeightPx}px`,
                    boxSizing: 'border-box',
                  }}
                >
                  {/* Header */}
                  {label.header && (
                    <span
                      className="font-black uppercase tracking-wider text-gray-900 leading-none truncate max-w-[90%]"
                      style={{ fontSize: `${Math.max(7.5, Math.round(cardHeightPx * 0.09))}px` }}
                    >
                      {label.header}
                    </span>
                  )}

                {/* Barcode Graphic Box (occupies ~48% height) */}
                <div
                  className="w-full flex items-center justify-center overflow-hidden my-0.5"
                  style={{ height: `${cardBarcodeHeightPx}px` }}
                >
                  <svg
                    className="preview-barcode-svg max-w-[98%] max-h-full h-auto"
                    data-barcode={label.barcodeValue}
                  />
                </div>

                {/* Item Code Number */}
                <span
                  className="font-mono font-bold text-gray-800 tracking-wider leading-none"
                  style={{ fontSize: `${Math.max(7, Math.round(cardHeightPx * 0.075))}px` }}
                >
                  {label.barcodeValue}
                </span>

                {/* Lines */}
                {label.line1 && (
                  <span
                    className="font-bold text-gray-700 truncate max-w-full leading-tight"
                    style={{ fontSize: `${Math.max(7, Math.round(cardHeightPx * 0.075))}px` }}
                  >
                    {label.line1}
                  </span>
                )}
                {label.line2 && (
                  <span
                    className="font-semibold text-gray-600 truncate max-w-full leading-tight"
                    style={{ fontSize: `${Math.max(6.5, Math.round(cardHeightPx * 0.07))}px` }}
                  >
                    {label.line2}
                  </span>
                )}
                {label.line3 && (
                  <span
                    className="font-black text-brand-black truncate max-w-full leading-none"
                    style={{ fontSize: `${Math.max(8, Math.round(cardHeightPx * 0.095))}px` }}
                  >
                    {label.line3}
                  </span>
                )}
                {label.line4 && (
                  <span
                    className="text-gray-500 truncate max-w-full leading-none"
                    style={{ fontSize: `${Math.max(6, Math.round(cardHeightPx * 0.065))}px` }}
                  >
                    {label.line4}
                  </span>
                )}
              </div>
            </div>
          ))}
          </div>
        </div>

        {/* Sticky Action Bar at the bottom */}
        <div className="sticky bottom-0 z-20 flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-t border-gray-200 bg-white shrink-0 gap-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_12px_rgba(0,0,0,0.06)] sm:shadow-none">
          <span className="text-[11px] sm:text-xs font-bold text-gray-600 truncate mr-2">
            Total {individualLabels.length} pages ready to print
          </span>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] sm:min-h-0 px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-xl border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer shrink-0 flex items-center justify-center"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => {
                onClose()
                onPrint()
              }}
              className="min-h-[44px] sm:min-h-0 px-4 py-2 sm:px-6 sm:py-2.5 rounded-xl bg-brand-black border border-[#7daa8f] text-brand-onDark text-xs font-black uppercase tracking-wider hover:bg-[#1e2817] transition-all shadow-md flex items-center gap-1.5 sm:gap-2 cursor-pointer shrink-0"
            >
              <Printer size={15} /> Print Labels
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
