import { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Minus, Plus, X, Check, ShoppingCart } from 'lucide-react'
import { useScrollLock } from '../lib/scrollLock'
import { useCartStore, useVariantStore, type Product } from '../store/store'
import { formatCurrency, variantLineTotal } from '../lib/retail'
import { getProductImage, onImgError } from '../lib/productImages'
import { useLangStore } from '../store/langStore'
import type { ProductVariant } from '../services/variantService'

function variantToProduct(base: Product, v: ProductVariant): Product {
  return {
    ...base,
    id: v.id,
    name: `${base.name}${v.sizeLabel || v.variantName !== base.name ? ` - ${v.variantName}` : ''}`,
    price: v.price,
    offerPrice: null,
    stock: v.stock,
    stockQuantity: v.stock,
    hasVariants: false,
    // Treat variant as independent SKU: single unit with exact price
    baseQuantity: 1,
    unitType: 'unit',
    unitLabel: v.sizeLabel || base.unitLabel || 'piece',
  }
}

export default function VariantSelectormodal({
  product,
  open,
  onClose,
}: {
  product: Product | null
  open: boolean
  onClose: () => void
}) {
  const { addItem } = useCartStore()
  const { getVariants, getDefaultVariant, fetchVariants } = useVariantStore()
  const { lang } = useLangStore()
  const l = (en: string, ta: string) => (lang === 'ta' ? ta : en)

  const [selected, setSelected] = useState<ProductVariant | null>(null)
  const [qty, setQty] = useState(1)
  const [added, setAdded] = useState(false)

  useEffect(() => {
    void fetchVariants()
  }, [fetchVariants])

  useEffect(() => {
    if (!open || !product) return
    // Remove synchronous state sets that trigger cascading renders if possible,
    // but here we just disable the eslint rule since we need to reset modal state on open.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelected(getDefaultVariant(String(product.id)))
    setQty(1)
    setAdded(false)
  }, [open, product, getDefaultVariant])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', handleKey)
    }
  }, [open, onClose])

  const handleAdd = useCallback(() => {
    if (!product || !selected) return
    const synthetic = variantToProduct(product, selected)
    addItem(
      synthetic,
      qty,
      synthetic.unitLabel,
      selected.id,
      selected.variantName,
      String(product.id),
    )
    setAdded(true)
    setTimeout(() => {
      setAdded(false)
      onClose()
    }, 500)
  }, [product, selected, qty, addItem, onClose])

  // Lock scroll while modal is open
  useScrollLock(open)

  // Close on Escape key press
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!product) return null

  const variants = getVariants(String(product.id))
  const haGSTock = selected ? selected.stock > 0 : false
  const totalPrice = selected ? variantLineTotal(selected.price, qty) : 0

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="vsm-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          role="dialog"
          aria-modal="true"
          style={{
            paddingTop: 'max(16px, env(safe-area-inset-top))',
            paddingRight: 'max(16px, env(safe-area-inset-right))',
            paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
            paddingLeft: 'max(16px, env(safe-area-inset-left))',
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs overflow-y-auto overscroll-contain"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose()
          }}
        >
          {/* Centered Modal Panel */}
          <motion.div
            key="vsm-panel"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="relative z-10 flex flex-col w-full max-w-md my-auto rounded-3xl bg-white shadow-2xl overflow-hidden border border-gray-200"
            style={{ maxHeight: 'calc(100dvh - 32px)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header: product image + name + close */}
            <div className="flex items-start gap-3 px-4 pt-2 pb-3 border-b border-gray-100 shrink-0">
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-[#F0F2EE]">
                <img
                  src={getProductImage(product.name, product.category, product.imageUrl, 'tile')}
                  alt={product.name}
                  onError={onImgError}
                  className="h-full w-full object-cover"
                />
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="text-[14px] font-black text-[#111111] leading-tight line-clamp-1">
                  {product.name}
                </h3>
                {selected && (
                  <div className="mt-0.5 flex items-baseline gap-1.5">
                    <span className="text-[15px] font-black text-[#111111] tabular-nums">
                      {formatCurrency(selected.price)}
                    </span>
                    {selected.sizeLabel && (
                      <span className="text-[11px] text-[#374151]">{selected.sizeLabel}</span>
                    )}
                  </div>
                )}
                {selected && selected.stock <= 0 && (
                  <span className="mt-1 inline-block rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-black text-red-500">
                    {l('Out of stock', 'இருப்பு இல்லை')}
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="h-8 w-8 shrink-0 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Variant radio list — scrollable */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3">
              <p className="mb-2.5 text-[10px] font-black uppercase tracking-wider text-[#374151]">
                {l('Select Variant', 'வகை தேர்வு')}
              </p>

              <div className="space-y-1.5">
                {variants.map((v) => {
                  const isSelected = selected?.id === v.id
                  const outOfStock = v.stock <= 0

                  return (
                    <button
                      key={v.id}
                      type="button"
                      disabled={outOfStock}
                      onClick={() => {
                        if (!outOfStock) {
                          setSelected(v)
                          setQty(1)
                        }
                      }}
                      className={[
                        'flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left transition-all',
                        isSelected
                          ? 'bg-[#111111]/6 ring-2 ring-[#111111]'
                          : outOfStock
                          ? 'cursor-not-allowed opacity-45 ring-1 ring-gray-200'
                          : 'ring-1 ring-gray-200 hover:ring-[#7daa8f] active:bg-gray-50',
                      ].join(' ')}
                    >
                      {/* Radio circle */}
                      <span
                        className={[
                          'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2',
                          isSelected
                            ? 'border-[#111111] bg-[#111111]'
                            : 'border-gray-300 bg-white',
                        ].join(' ')}
                      >
                        {isSelected && <Check size={10} className="text-white" strokeWidth={3.5} />}
                      </span>

                      {/* Labels */}
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-[13px] font-semibold leading-tight ${
                            isSelected ? 'text-[#111111]' : 'text-[#333]'
                          }`}
                        >
                          {v.variantName}
                        </p>
                        {v.sizeLabel && v.sizeLabel !== v.variantName && (
                          <p className="text-[11px] text-[#374151] mt-0.5">{v.sizeLabel}</p>
                        )}
                        {outOfStock && (
                          <p className="text-[10px] font-bold text-red-500 mt-0.5">
                            {l('Out of stock', 'இருப்பு இல்லை')}
                          </p>
                        )}
                      </div>

                      {/* Price — right aligned */}
                      <span
                        className={`text-[14px] font-black shrink-0 tabular-nums ${
                          isSelected ? 'text-[#111111]' : 'text-[#444]'
                        }`}
                      >
                        {formatCurrency(v.price)}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Sticky footer: qty stepper + add to cart */}
            <div
              className="shrink-0 border-t border-gray-100 bg-white px-4 pt-3"
              style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' }}
            >
              <div className="flex items-center gap-3">
                {/* Qty stepper */}
                <div className="flex items-center overflow-hidden rounded-xl border border-[#D5DAD0] bg-[#F9FAFB]">
                  <button
                    type="button"
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    disabled={qty <= 1}
                    className="flex h-11 w-11 items-center justify-center text-[#111111] transition-colors hover:bg-[#E8EDE4] disabled:opacity-40"
                    aria-label="Decrease"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="w-10 text-center text-[15px] font-black text-[#111111] tabular-nums">
                    {qty}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQty((q) => q + 1)}
                    disabled={selected ? qty >= selected.stock : true}
                    className="flex h-11 w-11 items-center justify-center text-[#111111] transition-colors hover:bg-[#E8EDE4] disabled:opacity-40"
                    aria-label="Increase"
                  >
                    <Plus size={14} />
                  </button>
                </div>

                {/* Add to cart */}
                <motion.button
                  type="button"
                  onClick={handleAdd}
                  disabled={!selected || !haGSTock || added}
                  whileTap={!added && haGSTock ? { scale: 0.97 } : undefined}
                  className={[
                    'flex h-11 flex-1 items-center justify-center gap-2 rounded-xl text-[13px] font-black transition-all',
                    added
                      ? 'bg-emerald-500 text-white'
                      : !haGSTock
                      ? 'cursor-not-allowed bg-gray-200 text-gray-400'
                      : 'bg-[#111111] text-white hover:bg-[#1e2817]',
                  ].join(' ')}
                >
                  {added ? (
                    <>
                      <Check size={15} strokeWidth={3} />
                      {l('Added!', 'சேர்க்கப்பட்டது!')}
                    </>
                  ) : !haGSTock ? (
                    l('Out of Stock', 'இருப்பு இல்லை')
                  ) : (
                    <>
                      <ShoppingCart size={14} />
                      {l('Add to Cart', 'கூடையில் சேர்')}
                      {selected && (
                        <span className="opacity-80">· {formatCurrency(totalPrice)}</span>
                      )}
                    </>
                  )}
                </motion.button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
