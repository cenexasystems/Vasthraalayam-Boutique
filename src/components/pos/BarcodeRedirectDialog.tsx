import React from 'react'
import { AlertCircle, ShoppingCart, X, ScanBarcode } from 'lucide-react'
import { useNavigationStore } from '../../store/navigationStore'

export interface BarcodeRedirectDialogProps {
  onNavigateToBilling?: (barcode: string) => void
}

export const BarcodeRedirectDialog: React.FC<BarcodeRedirectDialogProps> = ({
  onNavigateToBilling,
}) => {
  const { pendingBarcode, setPendingBarcode, setCurrentTab, setExternalScannedCode } =
    useNavigationStore()

  if (!pendingBarcode) return null

  const handleConfirm = () => {
    const code = pendingBarcode
    setPendingBarcode(null)
    setCurrentTab('billing')
    setExternalScannedCode(code)
    if (onNavigateToBilling) {
      onNavigateToBilling(code)
    }
  }

  const handleCancel = () => {
    setPendingBarcode(null)
  }

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) handleCancel()
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-150"
    >
      <div className="bg-white rounded-3xl w-full max-w-sm border border-[#ead7b7] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-brand-black p-4 border-b border-[#7daa8f]/30 flex items-center justify-between text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#1e2817] border border-[#7daa8f] flex items-center justify-center text-[#7daa8f] shrink-0 shadow-sm">
              <ScanBarcode size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-black text-white tracking-wide">
                Barcode Scanned
              </h3>
              <p className="text-[11px] font-mono font-bold text-[#7daa8f] truncate mt-0.5">
                {pendingBarcode}
              </p>
            </div>
          </div>
          <button
            onClick={handleCancel}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-3 bg-[#FBFAF6]">
          <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-amber-50 border border-amber-200/80 text-amber-950 text-xs">
            <AlertCircle size={17} className="text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold leading-relaxed">
                A barcode was scanned with the hardware reader while you are on another section.
              </p>
            </div>
          </div>
          <p className="text-xs text-gray-700 font-bold px-1">
            Would you like to switch to the <span className="text-black font-black">Billing Panel</span> and add this item to the order?
          </p>
        </div>

        {/* Actions */}
        <div className="px-5 py-3.5 bg-white border-t border-[#ead7b7] flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2 text-xs font-black rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="px-5 py-2 text-xs font-black rounded-xl bg-brand-black border border-[#7daa8f] text-brand-onDark hover:bg-[#1e2817] transition-all shadow-md flex items-center gap-1.5 cursor-pointer hover:scale-[1.02]"
          >
            <ShoppingCart size={14} />
            <span>Go to Billing</span>
          </button>
        </div>
      </div>
    </div>
  )
}
