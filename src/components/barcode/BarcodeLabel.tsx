import React, { useEffect, useRef } from 'react'
import { renderBarcodeSvg, getLabelRenderMetrics } from '../../lib/barcode'
import { BRAND_EN } from '../../lib/brand'
import { formatCurrency } from '../../lib/retail'

export interface BarcodeLabelProps {
  productName: string
  variantName?: string
  barcodeValue: string
  price: number
  mrp?: number | null
  storeName?: string
  widthMm?: number
  heightMm?: number
}

export const BarcodeLabel: React.FC<BarcodeLabelProps> = ({
  productName,
  variantName,
  barcodeValue,
  price,
  mrp,
  storeName = BRAND_EN,
  widthMm = 50,
  heightMm = 30,
}) => {
  const svgRef = useRef<SVGSVGElement>(null)
  const metrics = getLabelRenderMetrics(widthMm, heightMm)

  useEffect(() => {
    if (svgRef.current && barcodeValue) {
      renderBarcodeSvg(svgRef.current, barcodeValue, {
        width: metrics.barcodeBarWidth,
        height: metrics.barcodeHeightPx,
        fontSize: metrics.barcodeFontSize,
        font: 'Arial, sans-serif',
        margin: metrics.barcodeMargin,
        textMargin: 1.5,
        displayValue: true,
      })
    }
  }, [barcodeValue, widthMm, heightMm, metrics])

  const fullTitle = `${productName}${variantName ? ` (${variantName})` : ''}`

  return (
    <div
      className="barcode-sticker-box bg-white text-black border border-gray-300 rounded flex flex-col justify-between items-center text-center shadow-sm select-none transition-all"
      style={{
        width: `${widthMm}mm`,
        height: `${heightMm}mm`,
        maxWidth: `${widthMm}mm`,
        maxHeight: `${heightMm}mm`,
        padding: metrics.padding,
        boxSizing: 'border-box',
        overflow: 'hidden',
        pageBreakInside: 'avoid',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {/* Brand & Product Header (hidden on very small sizes) */}
      {!metrics.isVerySmall && (
        <div className="w-full flex flex-col items-center leading-none shrink-0">
          <div
            className="font-black tracking-wider text-brand-black uppercase truncate max-w-full"
            style={{ fontSize: metrics.isSmall ? '7.5px' : metrics.isLarge ? '11px' : '9px' }}
          >
            {storeName}
          </div>
          <div
            className="font-bold text-gray-900 truncate max-w-full leading-tight"
            style={{
              fontSize: metrics.isSmall ? '6.5px' : metrics.isLarge ? '9.5px' : '8px',
              marginTop: '0.3mm',
            }}
          >
            {fullTitle}
          </div>
        </div>
      )}

      {/* Barcode Graphic Box */}
      <div
        className="w-full flex-1 flex justify-center items-center overflow-hidden"
        style={{ margin: '0.2mm 0', minHeight: 0 }}
      >
        <svg ref={svgRef} className="max-w-[98%] max-h-full h-auto" />
      </div>

      {/* Pricing Footer */}
      <div
        className="w-full flex items-center justify-between px-0.5 border-t border-black leading-none shrink-0"
        style={{
          paddingTop: '0.3mm',
        }}
      >
        {metrics.isVerySmall ? (
          <span className="text-gray-600 font-bold font-mono" style={{ fontSize: '6.5px' }}>
            {barcodeValue.slice(-8)}
          </span>
        ) : mrp && mrp > price ? (
          <span className="text-gray-500 line-through" style={{ fontSize: metrics.isSmall ? '6px' : metrics.isLarge ? '8.5px' : '7.5px' }}>
            MRP {formatCurrency(mrp)}
          </span>
        ) : (
          <span className="text-gray-600 font-bold" style={{ fontSize: metrics.isSmall ? '6px' : metrics.isLarge ? '8.5px' : '7px' }}>
            VASTHRAALAYAM
          </span>
        )}
        <span
          className="font-black text-black"
          style={{ fontSize: metrics.isVerySmall ? '7.5px' : metrics.isSmall ? '8.5px' : metrics.isLarge ? '12px' : '10px' }}
        >
          {formatCurrency(price)}
        </span>
      </div>
    </div>
  )
}
