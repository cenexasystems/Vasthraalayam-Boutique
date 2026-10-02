import { AnimatePresence, motion } from 'framer-motion'
import { X, Trash2, Plus, Minus, ShoppingBag } from 'lucide-react'
import { useCartStore, useFavStore } from '../store/store'
import { useLangStore } from '../store/langStore'
import { Link } from 'react-router-dom'
import { formatCurrency, formatQuantityDisplay, getDefaultQuantityForProduct } from '../lib/retail'
import { PLACEHOLDER as PRODUCT_PLACEHOLDER } from '../lib/productImages'

export function CartDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { items, remove, updateQty, total, count, clear } = useCartStore()
  const { t, lang } = useLangStore()
  const orderTotal = total()

  const getStep = (item: (typeof items)[number]) => {
    if (item.unitType === 'unit' || item.unitType === 'bundle') return 1
    return getDefaultQuantityForProduct({
      unitType: item.unitType,
      baseQuantity: item.baseQuantity,
      predefinedOptions: item.predefinedOptions,
    })
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 top-0 left-0 right-0 bottom-0 w-screen h-screen h-[100dvh] bg-black/40 z-50 backdrop-blur-sm" />
          <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', stiffness: 290, damping: 28 }} className="fixed right-0 top-0 bottom-0 h-screen h-[100dvh] w-full max-w-sm bg-white z-50 flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <ShoppingBag className="text-sageDark" size={20} />
                <h2 className="font-bold text-lg text-textMain font-headline">{t('drawer.cart')} <span className="text-sm font-normal text-gray-400">({count()} {t('drawer.items')})</span></h2>
              </div>
              <div className="flex items-center gap-3">
                {items.length > 0 && <button onClick={clear} className="text-xs text-red-400 hover:text-red-600 font-medium">{t('cart.clear_all')}</button>}
                <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-full"><X size={18} /></button>
              </div>
            </div>

            <div className="flex-grow overflow-y-auto px-4 py-3 space-y-3">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-4 text-center py-16">
                  <div className="text-6xl">🛒</div>
                  <p className="text-textMuted font-medium">{t('drawer.empty_cart')}</p>
                  <Link to="/products" onClick={onClose} className="text-sageDark font-bold text-sm hover:underline">{t('drawer.browse')}</Link>
                </div>
              ) : (
                <AnimatePresence>
                  {items.map(item => (
                    <motion.div key={item.id} layout initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex gap-3 p-3 bg-bgMain rounded-xl border border-sand/40">
                      <img src={item.image} alt={item.name} onError={(e) => { (e.target as HTMLImageElement).src = PRODUCT_PLACEHOLDER }} className="w-16 h-16 object-cover rounded-lg shrink-0 bg-gray-100" loading="lazy" />
                      <div className="flex-grow min-w-0">
                        <h4 className="font-bold text-sm text-textMain truncate">
                          {lang === 'ta' && item.nameTa ? item.nameTa : item.name}
                        </h4>
                        <p className="text-xs text-gray-400 mb-2">{t('cat.' + item.category)}</p>
                        <p className="text-[11px] text-sageDark font-bold mb-2">{item.unitLabel} • {formatCurrency(item.basePrice)}</p>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-0.5 border border-sand rounded-lg bg-white overflow-hidden">
                            <button onClick={() => updateQty(item.id, item.qty - getStep(item))} className="w-7 h-7 flex items-center justify-center hover:bg-gray-50 text-gray-500"><Minus size={11} /></button>
                            <span className="min-w-12 px-1 text-center text-xs font-bold text-textMain">{item.variantId ? String(item.qty) : formatQuantityDisplay(item.qty, item.selectedUnit, item.unitType)}</span>
                            <button onClick={() => updateQty(item.id, item.qty + getStep(item))} className="w-7 h-7 flex items-center justify-center hover:bg-gray-50 text-gray-500"><Plus size={11} /></button>
                          </div>
                          <span className="font-bold text-textMain text-sm">{formatCurrency(item.lineTotal)}</span>
                        </div>
                      </div>
                      <button onClick={() => remove(item.id)} className="self-start p-1 text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>

            {items.length > 0 && (
              <div className="sticky bottom-0 z-20 shrink-0 bg-white px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-gray-100 space-y-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
                <div className="flex justify-between font-bold text-textMain text-base">
                  <span>Order Total</span><span>{formatCurrency(orderTotal)}</span>
                </div>
                <Link to="/cart" onClick={onClose} className="flex items-center justify-center w-full min-h-[48px] bg-sageDark hover:bg-sageDeep text-white font-bold py-3 rounded-xl transition-colors cursor-pointer">
                  {t('drawer.view_cart')}
                </Link>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

export function FavoritesDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { items, toggle } = useFavStore()
  const { t, lang } = useLangStore()
  const add = useCartStore(s => s.add)

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 top-0 left-0 right-0 bottom-0 w-screen h-screen h-[100dvh] bg-black/40 z-50 backdrop-blur-sm" />
          <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', stiffness: 290, damping: 28 }} className="fixed right-0 top-0 bottom-0 h-screen h-[100dvh] w-full max-w-sm bg-white z-50 flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="font-bold text-lg text-textMain font-headline flex items-center gap-2">
                ❤️ {t('drawer.favs')} <span className="text-sm font-normal text-gray-400">({items.length})</span>
              </h2>
              <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-full"><X size={18} /></button>
            </div>
            <div className="flex-grow overflow-y-auto px-4 py-3 space-y-3">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-16">
                  <div className="text-5xl">🤍</div>
                  <p className="text-textMuted font-medium">{t('drawer.no_favs')}</p>
                  <p className="text-sm text-gray-400">{t('drawer.tap_heart')}</p>
                </div>
              ) : (
                <AnimatePresence>
                  {items.map(item => (
                    <motion.div key={item.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, x: -20 }} className="flex gap-3 p-3 bg-[#FFF8E7] rounded-xl border border-[#E5E7EB]/50">
                      <img src={item.image} alt={item.name} onError={(e) => { (e.target as HTMLImageElement).src = PRODUCT_PLACEHOLDER }} className="w-14 h-14 object-cover rounded-lg shrink-0" loading="lazy" />
                      <div className="flex-grow min-w-0">
                        <h4 className="font-bold text-sm text-textMain truncate">
                          {lang === 'ta' && item.nameTa ? item.nameTa : item.name}
                        </h4>
                        <p className="text-xs text-sageDark font-bold">{t('cat.' + item.category)}</p>
                        <div className="flex items-center justify-between mt-2">
                          <span className="font-bold text-textMain">{item.unitLabel} • {formatCurrency(item.offerPrice || item.price)}</span>
                          <button onClick={() => { add(item); onClose() }} className="flex items-center gap-1 bg-sageDark hover:bg-sageDeep text-white text-xs font-bold px-2.5 py-1.5 rounded-lg transition-colors">
                            <ShoppingBag size={11} /> {t('drawer.add')}
                          </button>
                        </div>
                      </div>
                      <button onClick={() => toggle(item)} className="self-start p-1 text-rose-400 hover:text-rose-600"><X size={14} /></button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
