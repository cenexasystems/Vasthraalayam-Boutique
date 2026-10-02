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
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 w-full h-full h-[100dvh] max-h-[100dvh] z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-xs p-0 sm:p-4 overflow-hidden animate-in fade-in duration-150"
    >
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-sm max-h-[100dvh] sm:max-h-[92dvh] border-0 sm:border border-[#ead7b7] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-brand-black p-4 border-b border-[#7daa8f]/30 flex items-center justify-between text-white shrink-0">
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
        <div className="p-4 sm:p-5 space-y-3 bg-[#FBFAF6] overflow-y-auto flex-1 min-h-0">
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

        {/* Sticky Actions */}
        <div className="sticky bottom-0 z-20 px-4 py-3 sm:px-5 sm:py-3.5 bg-white border-t border-[#ead7b7] flex items-center justify-end gap-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_12px_rgba(0,0,0,0.06)] sm:shadow-none shrink-0">
          <button
            type="button"
            onClick={handleCancel}
            className="flex-1 sm:flex-initial min-h-[48px] sm:min-h-0 px-4 py-2 text-xs font-black rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer flex items-center justify-center"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="flex-[1.5] sm:flex-initial min-h-[48px] sm:min-h-0 px-5 py-2 text-xs font-black rounded-xl bg-brand-black border border-[#7daa8f] text-brand-onDark hover:bg-[#1e2817] transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer hover:scale-[1.02]"
          >
            <ShoppingCart size={14} />
            <span>Go to Billing</span>
          </button>
        </div>
      </div>
    </div>
  )
}
