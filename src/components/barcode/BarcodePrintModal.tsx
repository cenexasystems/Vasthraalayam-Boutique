import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Printer, Copy, Check } from 'lucide-react'
import { BarcodeLabel } from './BarcodeLabel'
import { BRAND_EN } from '../../lib/brand'
import {
  getAllLabelSizes,
  generateBarcodeSvgString,
  getStoredBarcodeSettings,
  saveStoredBarcodeSettings,
  saveLastUsedSizeId,
  getLabelRenderMetrics,
} from '../../lib/barcode'

export interface BarcodePrintModalProps {
  isOpen: boolean
  onClose: () => void
  productName: string
  variantName?: string
  barcodeValue: string
  price: number
  mrp?: number | null
  defaultQuantity?: number
}

type LabelSizePreset = {
  id: string
  name: string
  widthMm: number
  heightMm: number
  labelsPerRow: number
  horizontalGapMm: number
}

const getAvailablePresets = (): LabelSizePreset[] => {
  const sizes = getAllLabelSizes()
  return sizes.map((s) => ({
    id: s.id,
    name: `${s.label || s.name} (${s.width_mm}mm × ${s.height_mm}mm${s.columns > 1 ? ` × ${s.columns} across` : ''})`,
    widthMm: s.width_mm,
    heightMm: s.height_mm,
    labelsPerRow: s.columns || 1,
    horizontalGapMm: s.gap_mm || 0,
  }))
}

export const BarcodePrintModal: React.FC<BarcodePrintModalProps> = ({
  isOpen,
  onClose,
  productName,
  variantName,
  barcodeValue,
  price,
  mrp,
  defaultQuantity = 1,
}) => {
  const presets = getAvailablePresets()
  const [quantity, setQuantity] = useState<string>(String(defaultQuantity || 1))
  const [selectedPreset, setSelectedPreset] = useState<LabelSizePreset>(() => {
    const defaultId = getStoredBarcodeSettings().selectedSizeId || '2_38x25'
    return presets.find((p) => p.id === defaultId) || presets[0] || { id: '2_38x25', name: '38 × 25 mm (Tag / Jewelry)', widthMm: 38, heightMm: 25, labelsPerRow: 1, horizontalGapMm: 0 }
  })
  const [copied, setCopied] = useState(false)
  const [printerType, setPrinterType] = useState<string>(() => {
    return getStoredBarcodeSettings().printerType || 'label'
  })

  const handlePresetChange = (preset: LabelSizePreset) => {
    setSelectedPreset(preset)
    const current = getStoredBarcodeSettings()
    saveStoredBarcodeSettings({ ...current, selectedSizeId: preset.id })
    saveLastUsedSizeId(preset.id)
  }

  const handlePrinterTypeChange = (type: string) => {
    setPrinterType(type)
    const current = getStoredBarcodeSettings()
    saveStoredBarcodeSettings({ ...current, printerType: type as any })
  }

  // Close on Escape key & lock body scrolling when open
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

  const handleCopyBarcode = () => {
    navigator.clipboard.writeText(barcodeValue)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handlePrint = () => {
    try {
      const iframe = document.createElement('iframe')
      iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;'
      iframe.setAttribute('aria-hidden', 'true')
      iframe.setAttribute('tabindex', '-1')
      iframe.setAttribute('data-gramm', 'false')
      iframe.setAttribute('data-gramm_editor', 'false')
      iframe.setAttribute('data-enable-grammarly', 'false')
      iframe.setAttribute('spellcheck', 'false')
      document.body.appendChild(iframe)

      const doc = iframe.contentWindow?.document
      if (!doc) {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
        return
      }

      const fullTitle = `${productName}${variantName ? ` (${variantName})` : ''}`
      const isThermal = printerType === 'label'
      const metrics = getLabelRenderMetrics(selectedPreset.widthMm, selectedPreset.heightMm)

      // Direct SVG generation without CDN script dependencies
      const svgMarkup = generateBarcodeSvgString(barcodeValue, {
        width: metrics.barcodeBarWidth,
        height: metrics.barcodeHeightPx,
        fontSize: metrics.barcodeFontSize,
        font: 'Arial, sans-serif',
        margin: metrics.barcodeMargin,
        textMargin: 1.5,
        displayValue: true,
      })

    // Build standalone HTML for the printed stickers with strict thermal proportions
    const parsedQty = parseInt(quantity.trim(), 10)
    const validQuantity = !isNaN(parsedQty) && parsedQty > 0 ? parsedQty : 1
    const singleStickerHtml = metrics.isVerySmall
      ? `
      <div class="sticker sticker-very-small">
        <div class="barcode-box">
          ${svgMarkup}
        </div>
        <div class="footer">
          <span class="retail-tag">${barcodeValue.slice(-8)}</span>
          <span class="price">₹${price}</span>
        </div>
      </div>
      `
      : `
      <div class="sticker">
        <div class="header">
          <div class="brand">${BRAND_EN}</div>
          <div class="prod-title">${fullTitle}</div>
        </div>
        <div class="barcode-box">
          ${svgMarkup}
        </div>
        <div class="footer">
          <span>${mrp && mrp > price ? `<span class="mrp">MRP ₹${mrp}</span>` : '<span class="retail-tag">VASTHRAALAYAM RETAIL</span>'}</span>
          <span class="price">₹${price}</span>
        </div>
      </div>
    `

    const columns = isThermal ? Math.max(1, selectedPreset.labelsPerRow || 1) : 1
    const gapMm = selectedPreset.horizontalGapMm || 0
    const totalRollWidthMm = (selectedPreset.widthMm * columns + (columns > 1 ? gapMm * (columns - 1) : 0)).toFixed(2)

    const totalStickers = Math.max(1, validQuantity)
    const rows: string[] = []
    for (let i = 0; i < totalStickers; i += columns) {
      const rowCount = Math.min(columns, totalStickers - i)
      const filledStickers = Array.from({ length: rowCount }).map(() => singleStickerHtml)
      // On multi-up rolls, if an odd quantity leaves the last row incomplete, pad with empty invisible cell
      while (filledStickers.length < columns) {
        filledStickers.push('<div class="sticker" style="visibility:hidden;border:none;background:transparent;"></div>')
      }
      const rowHtml = filledStickers.join('')

      if (isThermal) {
        // Wrap each row in a discrete page container to force hardware gap sensor alignment
        rows.push(`<div class="page-wrapper"><div class="sticker-row">${rowHtml}</div></div>`)
      } else {
        rows.push(`<div class="sticker-row">${rowHtml}</div>`)
      }
    }
    const allStickersHtml = rows.join('')

    const bodyContent = isThermal
      ? allStickersHtml
      : `<div class="a4-container">${allStickersHtml}</div>`

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Print Barcode - ${barcodeValue}</title>
          <style>
            @page {
              ${
                isThermal
                  ? `size: ${totalRollWidthMm}mm ${selectedPreset.heightMm}mm; margin: 0;`
                  : `size: A4 portrait; margin: 10mm;`
              }
            }
            @media print {
              ${
                isThermal
                  ? `
                  html, body {
                    margin: 0 !important;
                    padding: 0 !important;
                    width: ${totalRollWidthMm}mm !important;
                  }
                  .page-wrapper {
                    width: ${totalRollWidthMm}mm !important;
                    height: ${selectedPreset.heightMm}mm !important;
                    max-height: ${selectedPreset.heightMm}mm !important;
                    overflow: hidden !important;
                    page-break-after: always !important;
                    break-after: page !important;
                  }
                  .page-wrapper:last-child {
                    page-break-after: avoid !important;
                    break-after: avoid !important;
                  }
                  `
                  : ''
              }
            }
            * {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
            }
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              background: #fff !important;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .a4-container {
              display: flex;
              flex-wrap: wrap;
              align-content: flex-start;
              gap: 3mm 4mm;
            }
            .page-wrapper {
              display: block;
            }
            .sticker-row {
              display: flex;
              flex-direction: row;
              align-items: center;
              justify-content: ${isThermal ? 'space-between' : 'flex-start'};
              gap: ${isThermal ? '0' : gapMm + 'mm'};
              width: ${totalRollWidthMm}mm;
              height: ${isThermal ? selectedPreset.heightMm + 'mm' : 'auto'};
              break-inside: avoid !important;
              page-break-inside: avoid !important;
            }
            .sticker {
              width: ${selectedPreset.widthMm}mm;
              height: ${selectedPreset.heightMm}mm;
              max-width: ${selectedPreset.widthMm}mm;
              max-height: ${selectedPreset.heightMm}mm;
              padding: ${metrics.padding};
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              align-items: center;
              text-align: center;
              overflow: hidden;
              box-sizing: border-box;
              flex-shrink: 0;
              background: #fff;
              ${!isThermal ? 'border: 0.2mm dashed #bbb;' : ''}
            }
            .header {
              width: 100%;
              display: flex;
              flex-direction: column;
              align-items: center;
              line-height: 1.1;
              flex-shrink: 0;
            }
            .brand {
              font-size: ${metrics.headerFontSize};
              font-weight: 900;
              letter-spacing: 0.5px;
              color: #000;
              text-transform: uppercase;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              max-width: 100%;
            }
            .prod-title {
              font-size: ${metrics.titleFontSize};
              font-weight: 700;
              color: #111;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              max-width: 98%;
              margin-top: 0.2mm;
            }
            .barcode-box {
              width: 100%;
              flex: 1;
              min-height: 0;
              display: flex;
              justify-content: center;
              align-items: center;
              margin: 0.2mm 0;
              overflow: hidden;
            }
            .barcode-box svg {
              display: block;
              margin: 0 auto;
              max-width: 98%;
              max-height: 100%;
              width: auto;
              height: auto;
            }
            .footer {
              width: 100%;
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-top: 0.5pt solid #000;
              padding-top: 0.3mm;
              line-height: 1;
              flex-shrink: 0;
            }
            .mrp {
              font-size: ${metrics.tagFontSize};
              color: #555;
              text-decoration: line-through;
            }
            .retail-tag {
              font-size: ${metrics.tagFontSize};
              font-weight: 700;
              color: #333;
            }
            .price {
              font-size: ${metrics.priceFontSize};
              font-weight: 900;
              color: #000;
            }
          </style>
        </head>
        <body data-gramm="false">
          ${bodyContent}
        </body>
      </html>
    `

    doc.open()
    doc.write(html)
    doc.close()

    const cleanup = () => {
      try {
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe)
        }
      } catch {}
    }

    setTimeout(() => {
      try {
        if (iframe.contentWindow) {
          iframe.contentWindow.onbeforeunload = null
          iframe.contentWindow.onunload = null
          iframe.contentWindow.onafterprint = cleanup
          iframe.contentWindow.focus()
          iframe.contentWindow.print()
        }
      } catch (err) {
        console.warn('[BarcodePrintModal] Failed to execute print:', err)
      } finally {
        setTimeout(cleanup, 2500)
      }
    }, 200)
  } catch (err) {
    console.warn('[BarcodePrintModal] Failed to execute print:', err)
  }
}

  return createPortal(
    <div className="fixed inset-0 top-0 left-0 right-0 bottom-0 w-screen h-screen h-[100dvh] z-[9999] flex items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4 overflow-hidden animate-in fade-in duration-150">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 bg-white rounded-none sm:rounded-3xl max-w-2xl sm:max-w-3xl w-full h-screen h-[100dvh] sm:h-auto sm:max-h-[92vh] border-0 sm:border border-[#ead7b7] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-brand-black px-4 py-3 sm:px-6 sm:py-4 border-b border-[#7daa8f]/30 flex items-center justify-between text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-[#1e2817] border border-[#7daa8f] flex items-center justify-center text-[#7daa8f]">
              <Printer size={16} />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black tracking-wide text-white">
                Print Barcode Labels ({BRAND_EN})
              </h2>
              <p className="text-[11px] text-[#7daa8f] font-semibold">
                Generate physical retail stickers for this SKU
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body - Scrollable */}
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-4 overflow-y-auto flex-1 min-h-0">
          {/* Barcode Info Card */}
          <div className="bg-[#FBFAF6] border border-[#ead7b7] rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-[#5f6d59]">
                Product / SKU
              </span>
              <h3 className="text-base sm:text-lg font-black text-brand-black leading-tight">{productName}</h3>
              {variantName && (
                <div className="mt-1 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold">
                  Variant: {variantName}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-gray-200 shadow-sm shrink-0">
              <span className="font-mono text-sm font-black text-black">
                {barcodeValue}
              </span>
              <button
                type="button"
                onClick={handleCopyBarcode}
                className="text-gray-400 hover:text-gray-700 transition-colors p-1 cursor-pointer"
                title="Copy Barcode Value"
              >
                {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
              </button>
            </div>
          </div>

          {/* Configuration Form Card */}
          <div className="bg-[#FBFAF6] border border-[#ead7b7]/70 rounded-2xl p-4 space-y-4">
            {/* Row 1: Target Printer & Preset */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Target Printer Type */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-gray-700 mb-1.5">
                  Target Printer
                </label>
                <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-white border border-[#ead7b7] shadow-sm">
                  <button
                    type="button"
                    onClick={() => handlePrinterTypeChange('label')}
                    className={`py-2 px-2.5 rounded-lg text-xs font-black transition-all text-center cursor-pointer ${
                      printerType === 'label'
                        ? 'bg-brand-black text-brand-onDark shadow-sm'
                        : 'text-gray-600 hover:text-black hover:bg-gray-100'
                    }`}
                  >
                    Thermal (Roll)
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePrinterTypeChange('regular')}
                    className={`py-2 px-2.5 rounded-lg text-xs font-black transition-all text-center cursor-pointer ${
                      printerType === 'regular'
                        ? 'bg-brand-black text-brand-onDark shadow-sm'
                        : 'text-gray-600 hover:text-black hover:bg-gray-100'
                    }`}
                  >
                    Desktop (A4)
                  </button>
                </div>
                <p className="text-[11px] text-gray-500 mt-1">
                  {printerType === 'label'
                    ? `Roll label printer (${(selectedPreset.labelsPerRow || 1) > 1 ? `${selectedPreset.labelsPerRow} labels per page` : '1 label per page'})`
                    : 'A4 sheet printer (Canon G2010, HP, Epson)'}
                </p>
              </div>

              {/* Label Sizing Preset */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-gray-700 mb-1.5">
                  Label Sizing Preset
                </label>
                <select
                  value={selectedPreset.id}
                  onChange={(e) => {
                    const preset = presets.find((p) => p.id === e.target.value)
                    if (preset) handlePresetChange(preset)
                  }}
                  className="w-full py-2.5 px-3 rounded-xl border-2 border-[#ead7b7] bg-white font-bold text-xs sm:text-sm text-gray-900 outline-none focus:border-brand-black shadow-sm cursor-pointer"
                >
                  {presets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-gray-500 mt-1">
                  Dimensions: {selectedPreset.widthMm}mm × {selectedPreset.heightMm}mm
                </p>
              </div>
            </div>

            {/* Row 2: Quantity Stepper & Quick Pills */}
            <div className="pt-3 border-t border-[#ead7b7]/50">
              <label className="block text-xs font-black uppercase tracking-wider text-gray-700 mb-2">
                Number of Labels to Print
              </label>
              <div className="flex flex-wrap items-center gap-3">
                {/* Stepper with explicit unshrinkable buttons */}
                <div className="inline-flex items-center rounded-xl border-2 border-[#ead7b7] bg-white overflow-hidden shadow-sm shrink-0">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => String(Math.max(1, (parseInt(q, 10) || 1) - 1)))}
                    className="w-10 h-10 shrink-0 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-black font-black text-lg flex items-center justify-center transition-colors cursor-pointer select-none"
                  >
                    -
                  </button>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="1"
                    value={quantity}
                    onChange={(e) => {
                      const clean = e.target.value.replace(/[^0-9]/g, '')
                      setQuantity(clean)
                    }}
                    className="w-20 sm:w-24 text-center font-black text-lg py-1.5 bg-white text-black outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => String((parseInt(q, 10) || 0) + 1))}
                    className="w-10 h-10 shrink-0 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-black font-black text-lg flex items-center justify-center transition-colors cursor-pointer select-none"
                  >
                    +
                  </button>
                </div>

                {/* Quick Presets */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[1, 5, 10, 20, 50, 100].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setQuantity(String(num))}
                      className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                        quantity === String(num)
                          ? 'bg-brand-black text-brand-onDark shadow-sm'
                          : 'bg-white hover:bg-gray-100 border border-gray-300 text-gray-700 shadow-sm'
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Live Preview */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-black uppercase tracking-wider text-gray-600">
                Sticker Print Preview
              </label>
              <span className="text-[11px] font-bold text-[#5f6d59]">
                {quantity || 1} {quantity === '1' ? 'Label' : 'Labels'} • {selectedPreset.widthMm} × {selectedPreset.heightMm} mm ({printerType === 'label' ? 'Roll' : 'A4 Sheet'})
              </span>
            </div>
            <div className="bg-[#FBFAF6] border-2 border-dashed border-[#ead7b7] rounded-2xl py-6 px-4 flex items-center justify-center min-h-[140px]">
              <BarcodeLabel
                productName={productName}
                variantName={variantName}
                barcodeValue={barcodeValue}
                price={price}
                mrp={mrp}
                storeName={BRAND_EN}
                widthMm={selectedPreset.widthMm}
                heightMm={selectedPreset.heightMm}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-[#FBFAF6] px-4 py-3 sm:px-6 sm:py-3.5 border-t border-[#ead7b7] flex items-center justify-between shrink-0 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 sm:px-5 sm:py-2.5 rounded-xl border border-gray-300 text-gray-700 font-bold text-xs sm:text-sm hover:bg-gray-100 transition-colors cursor-pointer shrink-0"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-1.5 sm:gap-2 px-4 py-2 sm:px-6 sm:py-2.5 rounded-xl bg-brand-black border border-[#7daa8f] text-brand-onDark font-black hover:bg-[#1e2817] transition-all shadow-md cursor-pointer hover:scale-[1.02] text-xs sm:text-sm shrink-0"
          >
            <Printer size={16} />
            Print {quantity || '1'} {quantity === '1' ? 'Sticker' : 'Stickers'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
