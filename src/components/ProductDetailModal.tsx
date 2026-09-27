import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown, Flower2, Heart, Leaf, Minus, Plus, ShieldCheck, ShoppingCart, Sparkles, Star, X } from 'lucide-react'
import { useCartStore, useFavStore, useVariantStore, type Product } from '../store/store'
import { useLangStore } from '../store/langStore'
import type { ProductVariant } from '../services/variantService'
import {
  calculateLineTotal,
  formatCompactQuantity,
  formatCurrency,
  variantLineTotal,
  type QuantityOption,
} from '../lib/retail'
import { onImgError, resolveProductImage } from '../lib/productImages'


const buildUsageNote = (product: Product) => {
  if (product.unitType === 'weight' || product.unitType === 'volume') {
    return 'Use as per traditional practice. Store in a cool, dry place away from moisture.'
  }
  return 'Use as per traditional practice. Store in a clean, dry place.'
}

const accordionClass = 'rounded-[22px] border border-[#ead7b7]/60 bg-white px-4 py-3 shadow-sm'

function variantToProduct(base: Product, v: ProductVariant): Product {
  return {
    ...base,
    id: v.id,
    name: `${base.name}${v.sizeLabel || v.variantName !== base.name ? ` - ${v.variantName}` : ''}`,
    price: v.price,
    offerPrice: null,
    stock: v.stock,
    stockQuantity: v.stock,
    // Treat variants as independent SKUs for pricing/quantity logic
    hasVariants: false,
    unitType: 'unit',
    unitLabel: v.sizeLabel || base.unitLabel,
    baseQuantity: 1,
  }
}

const getCompactPackOptions = (product: Product) => {
  if (product.predefinedOptions.length > 0) return product.predefinedOptions
  if (product.unitType === 'weight') {
    return [
      { quantity: 100, unit: 'g', label: '100g' },
      { quantity: 250, unit: 'g', label: '250g' },
      { quantity: 500, unit: 'g', label: '500g' },
    ]
  }
  if (product.unitType === 'volume') {
    return [
      { quantity: 500, unit: 'ml', label: '500ml' },
      { quantity: 1000, unit: 'ml', label: '1L' },
    ]
  }
  return []
}

export default function ProductDetailModal({
  product,
  open,
  onClose,
  onSelectProduct,
  relatedProducts,
}: {
  product: Product | null
  open: boolean
  onClose: () => void
  onSelectProduct?: (product: Product) => void
  relatedProducts: Product[]
}) {
  const { addItem, removeItem, updateQuantity } = useCartStore()
  const { toggle, isFav } = useFavStore()
  const { getVariants, getDefaultVariant, fetchVariants } = useVariantStore()
  const { t } = useLangStore()
  const [selectedPackOption, setSelectedPackOption] = useState<QuantityOption | null>(null)
  const [mobileQty, setMobileQty] = useState(0)
  const [mobilePack, setMobilePack] = useState<QuantityOption | null>(null)
  const [toast, setToast] = useState(false)
  // Desktop variant selection
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null)
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)
  const [desktopVariantQty, setDesktopVariantQty] = useState(1)

  useEffect(() => {
    if (!open) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = original
      document.removeEventListener('keydown', handleKey)
    }
  }, [open, onClose])

  useEffect(() => {
    void fetchVariants()
  }, [fetchVariants])

  useEffect(() => {
    if (!open || !product) return
    const id = window.setTimeout(() => {
      setMobileQty(0)
      const packOpts = getCompactPackOptions(product)
      setMobilePack(packOpts[0] ?? null)
      setSelectedPackOption(packOpts[0] ?? null)
      if (product.hasVariants) {
        const defaultVar = getDefaultVariant(String(product.id))
        setSelectedVariant(defaultVar)
        setSelectedGroup(defaultVar?.groupName ?? null)
        setDesktopVariantQty(1)
      } else {
        setSelectedVariant(null)
        setSelectedGroup(null)
        setDesktopVariantQty(1)
      }
    }, 0)
    return () => window.clearTimeout(id)
  }, [open, product, fetchVariants, getDefaultVariant])

  // Reference optional props to avoid ESLint unused-var errors without changing API
  void onSelectProduct
  void relatedProducts

  const basePrice = product
    ? (product.offerPrice && product.offerPrice < product.price ? product.offerPrice : product.price)
    : 0

  const effectivePrice = product && product.hasVariants && selectedVariant ? selectedVariant.price : basePrice
    const effectiveUnitLabel = product && product.hasVariants && selectedVariant ? (selectedVariant.sizeLabel || selectedVariant.variantName || product.unitLabel) : (product?.unitLabel ?? '')

  const hasDiscount = !!(product && product.offerPrice && product.offerPrice < product.price)
  const discount = product && hasDiscount
    ? Math.round(((product.price - product.offerPrice!) / product.price) * 100)
    : 0

  const compactPackOptions = useMemo(() => (product ? getCompactPackOptions(product) : []), [product])

  // qty = number of packs/units; weight/volume labels are display-only
  const mobileLineTotal = product && mobileQty > 0
    ? calculateLineTotal(Math.max(1, mobileQty), product.unitType, 1, effectivePrice)
    : effectivePrice
  const mobileSummary = mobilePack
    ? (mobileQty > 0 ? `${mobileQty} × ${mobilePack.label}` : mobilePack.label)
    : formatCompactQuantity(mobileQty > 0 ? mobileQty : 1, product?.unitLabel ?? '')
  // desktop non-variant line total: selectedPackOption is display-only, qty = 1 pack
  const desktopPackLineTotal = calculateLineTotal(1, product?.unitType ?? 'unit', 1, basePrice)

  if (!open || !product) return null

  const tamilName = product.nameTa || product.tamilName
  const favorite = isFav(product.id)
  const selectedSummary = selectedPackOption?.label ?? product.unitLabel

  const handleAdd = () => {
    if (product.hasVariants && selectedVariant) {
      const synthetic = variantToProduct(product, selectedVariant)
      addItem(
        synthetic,
        desktopVariantQty,
        synthetic.unitLabel,
        selectedVariant.id,
        selectedVariant.variantName,
        String(product.id),
      )
    } else {
      // qty = 1 pack; pack label is the unit label for display
      addItem(product, 1, selectedPackOption?.label ?? product.unitLabel)
    }
    setToast(true)
    window.setTimeout(() => setToast(false), 1800)
  }

  const handleMobileAdd = () => {
    const pack = mobilePack ?? compactPackOptions[0] ?? null
    addItem(product, 1, pack?.label ?? product.unitLabel)
    setMobileQty(1)
  }

  const handleMobileChangeQty = (nextQty: number) => {
    if (nextQty <= 0) {
      removeItem(product.id)
      setMobileQty(0)
      return
    }
    const pack = mobilePack ?? compactPackOptions[0] ?? null
    const unit = pack?.label ?? product.unitLabel
    if (mobileQty <= 0) {
      addItem(product, nextQty, unit)
    } else {
      updateQuantity(product.id, nextQty)
    }
    setMobileQty(nextQty)
  }

  const handleMobilePackChange = (option: QuantityOption) => {
    if (option.label === mobilePack?.label) return
    const currentQty = mobileQty
    setMobilePack(option)
    if (currentQty > 0) {
      removeItem(product.id)
      addItem(product, currentQty, option.label)
    }
  }

  // Priority: variant's own imageUrl → resolver(product+variant) → resolver(product) → empty
  const heroImage =
    selectedVariant?.imageUrl
    ?? (selectedVariant ? resolveProductImage(product.name, selectedVariant.variantName) : null)
    ?? resolveProductImage(product.name)
    ?? ''

  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-[80]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <button
          type="button"
          aria-label="Close modal backdrop"
          onClick={onClose}
          className="absolute inset-0 bg-[#0d140f]/45 backdrop-blur-[6px]"
        />

        <div className="relative z-10 flex h-full min-h-0 items-end justify-center p-0 sm:p-3 lg:hidden">
          <motion.div
            initial={{ opacity: 0, scale: 0.985, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.99, y: 18 }}
            transition={{ type: 'spring', stiffness: 130, damping: 20, mass: 0.9 }}
            className="relative flex h-full max-h-[100dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-[28px] bg-[#fbfaf6] shadow-[0_-10px_42px_rgba(22,35,20,0.16)] sm:max-h-[min(94dvh,900px)] sm:rounded-[32px]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex shrink-0 justify-center pt-2.5">
              <div className="h-1 w-10 rounded-full bg-[#d4cfc6]" />
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto pb-[calc(5rem+env(safe-area-inset-bottom))]">
              <section className="px-0 pt-2">
                <div className="relative overflow-hidden bg-[#efe9dd]">
                  <button
                    type="button"
                    onClick={onClose}
                    className="absolute right-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-white/70 bg-white/90 text-brand-black shadow-[0_6px_18px_rgba(45,60,35,0.12)] backdrop-blur"
                    aria-label="Close"
                  >
                    <X size={15} />
                  </button>

                  <div className="absolute left-4 top-4 z-10 rounded-full bg-white/85 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-[#5f6d59] shadow-sm backdrop-blur">
                    Premium focus
                  </div>

                  <div className="relative aspect-[4/3] min-h-[38svh] max-h-[44svh] sm:aspect-[16/10] sm:min-h-[26rem] sm:max-h-[30rem]">
                    <img
                      src={heroImage}
                      alt={product.name}
                      loading="lazy"
                      decoding="async"
                      onError={onImgError}
                      className="h-full w-full object-contain"
                    />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#fbfaf6] to-transparent" />
                  </div>
                </div>
              </section>

              <section className="px-4 pt-3 sm:px-6 sm:pt-4">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#7daa8f]">{t('cat.' + product.category)}</p>
                <h2 className="mt-1 text-[1.68rem] leading-[1.08] font-black text-brand-black sm:text-[2.3rem]">{product.name}</h2>
                {tamilName && <p className="mt-1 text-[0.98rem] font-bold text-[#5f6d59] ta-text sm:text-[1.05rem]">{tamilName}</p>}
              </section>

              <section className="px-4 pt-3 sm:px-6">
                <div className="flex items-end justify-between gap-3 rounded-[24px] bg-white/85 px-4 py-3 shadow-sm ring-1 ring-[#ead7b7]/45 backdrop-blur">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f7f4ed] px-3 py-1.5 text-[11px] font-black text-brand-black ring-1 ring-[#ead7b7]/40">
                        <Star size={12} className="fill-amber-400 text-amber-400" />
                        {(product.rating || 4.7).toFixed(1)}
                      </span>
                      {discount > 0 && <span className="rounded-full bg-brand-black px-3 py-1.5 text-[11px] font-black text-white">{discount}% OFF</span>}
                    </div>
                    <p className="mt-1.5 text-[11px] font-bold text-[#95a28f]">
                      {selectedVariant ? selectedVariant.variantName : mobileSummary}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7daa8f]">Price</p>
                    <p className="text-[1.45rem] font-black leading-none text-brand-black">
                      {formatCurrency(selectedVariant ? selectedVariant.price : basePrice)}
                    </p>
                    {hasDiscount && !selectedVariant && <p className="mt-1 text-[10px] font-bold text-[#b0a89a] line-through">{formatCurrency(product.price)}</p>}
                  </div>
                </div>
              </section>

              {product.hasVariants ? (
                <section className="px-4 pt-3 sm:px-6">
                  {(() => {
                    const variants = getVariants(String(product.id))
                    const groups = [...new Set(variants.filter(v => v.groupName).map(v => v.groupName!))]
                    const isGrouped = groups.length > 0
                    const activeGroupVariants = isGrouped && selectedGroup
                      ? variants.filter(v => v.groupName === selectedGroup)
                      : isGrouped ? [] : variants

                    return (
                      <div className="rounded-[24px] bg-white/80 px-4 py-3 shadow-sm ring-1 ring-[#ead7b7]/45 backdrop-blur space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#7daa8f]">
                            {isGrouped ? 'Brand' : variants.some(v => v.sizeLabel) ? 'Pack Size' : 'Variant'}
                          </p>
                          <button
                            type="button"
                            onClick={() => void toggle(product)}
                            className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${
                              favorite ? 'border-rose-200 bg-rose-50 text-rose-600' : 'border-[#ead7b7]/60 bg-white text-[#5f6d59]'
                            }`}
                            aria-label={favorite ? 'Remove from favourites' : 'Add to favourites'}
                          >
                            <Heart size={13} className={favorite ? 'fill-rose-500 text-rose-500' : 'text-current'} />
                          </button>
                        </div>

                        {/* Step 1: Group/Brand selector */}
                        {isGrouped && (
                          <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1 hide-scrollbar">
                            {groups.map((g) => {
                              const isSel = selectedGroup === g
                              return (
                                <button
                                  key={g}
                                  type="button"
                                  onClick={() => {
                                    setSelectedGroup(g)
                                    const first = variants.find(v => v.groupName === g && v.stock > 0)
                                      ?? variants.find(v => v.groupName === g)
                                    setSelectedVariant(first ?? null)
                                    setDesktopVariantQty(1)
                                  }}
                                  className={[
                                    'shrink-0 rounded-full border px-4 py-2 text-[12px] font-black transition-all whitespace-nowrap',
                                    isSel ? 'border-[#111111] bg-[#111111] text-white'
                                          : 'border-[#ead7b7]/80 bg-[#f7f4ed] text-[#111111]',
                                  ].join(' ')}
                                >
                                  {g}
                                </button>
                              )
                            })}
                          </div>
                        )}

                        {/* Step 2: Weight/Size selector (or flat list for non-grouped) */}
                        {(isGrouped ? (selectedGroup !== null) : true) && (
                          <>
                            {isGrouped && (
                              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#7daa8f]">Size</p>
                            )}
                            <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1 hide-scrollbar">
                              {activeGroupVariants.map((v) => {
                                const isSel = selectedVariant?.id === v.id
                                const oos = v.stock <= 0
                                return (
                                  <button
                                    key={v.id}
                                    type="button"
                                    disabled={oos}
                                    onClick={() => { if (!oos) { setSelectedVariant(v); setDesktopVariantQty(1) } }}
                                    className={[
                                      'shrink-0 rounded-full border px-3.5 py-2 text-[12px] font-black transition-all whitespace-nowrap',
                                      isSel
                                        ? 'border-[#111111] bg-[#111111] text-white'
                                        : oos
                                        ? 'cursor-not-allowed opacity-40 border-gray-200 text-[#999]'
                                        : 'border-[#ead7b7]/80 bg-[#f7f4ed] text-[#111111]',
                                    ].join(' ')}
                                  >
                                    {v.variantName}
                                    {!isSel && <span className="ml-1 text-[11px] font-bold opacity-70">{formatCurrency(v.price)}</span>}
                                  </button>
                                )
                              })}
                            </div>
                          </>
                        )}
                      </div>
                    )
                  })()}
                </section>
              ) : (
                <section className="px-4 pt-3 sm:px-6">
                  <div className="rounded-[24px] bg-white/80 px-4 py-3 shadow-sm ring-1 ring-[#ead7b7]/45 backdrop-blur">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#7daa8f]">Quantity</p>
                        <p className="mt-1 text-[11px] font-bold text-[#95a28f]">{mobileQty > 0 ? 'Tap +/- to adjust' : 'Tap Add to start'}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void toggle(product)}
                        className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition-colors ${
                          favorite ? 'border-rose-200 bg-rose-50 text-rose-600' : 'border-[#ead7b7]/60 bg-white text-[#5f6d59]'
                        }`}
                        aria-label={favorite ? 'Remove from favourites' : 'Add to favourites'}
                      >
                        <Heart size={14} className={favorite ? 'fill-rose-500 text-rose-500' : 'text-current'} />
                      </button>
                    </div>

                    <AnimatePresence mode="wait">
                      {mobileQty > 0 && (
                        <motion.div
                          key="mobile-stepper"
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 6 }}
                          transition={{ duration: 0.18 }}
                          className="mt-3 space-y-3"
                        >
                          {compactPackOptions.length > 0 && (product.unitType === 'weight' || product.unitType === 'volume') && (
                            <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
                              {compactPackOptions.map((option) => (
                                <button
                                  key={option.label}
                                  type="button"
                                  onClick={() => handleMobilePackChange(option)}
                                  className={`shrink-0 rounded-full border px-3 py-2 text-[11px] font-black transition-colors ${
                                    mobilePack?.label === option.label
                                      ? 'border-brand-black bg-brand-black text-white'
                                      : 'border-[#ead7b7]/70 bg-[#f7f4ed] text-[#5f6d59]'
                                  }`}
                                >
                                  {option.label}
                                </button>
                              ))}
                            </div>
                          )}

                          <div className="inline-flex w-full items-center justify-between gap-2 rounded-full bg-white px-2 py-1.5 shadow-sm ring-1 ring-[#ead7b7]/55">
                            <button
                              type="button"
                              onClick={() => handleMobileChangeQty(mobileQty - 1)}
                              className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f7f4ed] text-[#5f6d59] transition-colors hover:bg-[#ead7b7]/35"
                            >
                              <Minus size={13} />
                            </button>
                            <span className="min-w-[2rem] text-center text-[14px] font-black text-brand-black">{mobileQty}</span>
                            <button
                              type="button"
                              onClick={() => handleMobileChangeQty(mobileQty + 1)}
                              className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f7f4ed] text-[#5f6d59] transition-colors hover:bg-[#ead7b7]/35"
                            >
                              <Plus size={13} />
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </section>
              )}
            </div>

            <div className="shrink-0 z-20 border-t border-[#ead7b7]/45 bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3">
              {product.hasVariants ? (
                <div className="mx-auto flex max-w-xl items-center gap-3">
                  <div className="flex items-center gap-1 rounded-xl border border-[#D5DAD0] bg-[#F9FAFB] overflow-hidden shrink-0">
                    <button
                      type="button"
                      onClick={() => setDesktopVariantQty(q => Math.max(1, q - 1))}
                      disabled={desktopVariantQty <= 1}
                      className="flex h-10 w-10 items-center justify-center text-brand-black hover:bg-[#E8EDE4] disabled:opacity-40 transition-colors"
                    >
                      <Minus size={13} />
                    </button>
                    <span className="w-8 text-center text-[14px] font-black text-brand-black tabular-nums">{desktopVariantQty}</span>
                    <button
                      type="button"
                      onClick={() => setDesktopVariantQty(q => q + 1)}
                      disabled={!selectedVariant || desktopVariantQty >= selectedVariant.stock}
                      className="flex h-10 w-10 items-center justify-center text-brand-black hover:bg-[#E8EDE4] disabled:opacity-40 transition-colors"
                    >
                      <Plus size={13} />
                    </button>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold text-[#7daa8f]">Total</p>
                    <p className="text-[1rem] font-black leading-tight text-brand-black">
                      {selectedVariant ? formatCurrency(variantLineTotal(selectedVariant.price, desktopVariantQty)) : formatCurrency(basePrice)}
                    </p>
                  </div>

                  <AnimatePresence mode="wait">
                    {toast ? (
                      <motion.div
                        key="added"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="flex h-[46px] shrink-0 items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 text-[13px] font-black text-white"
                      >
                        <Check size={15} strokeWidth={3} />
                        <span>Added!</span>
                      </motion.div>
                    ) : (
                      <motion.button
                        key="add-btn"
                        whileTap={{ scale: 0.98 }}
                        onClick={handleAdd}
                        type="button"
                        disabled={!selectedVariant}
                        className="flex h-[46px] shrink-0 items-center justify-center rounded-2xl bg-brand-black px-4 text-[13px] font-black text-white shadow-[0_14px_28px_rgba(44,57,42,0.2)] disabled:opacity-50"
                      >
                        <ShoppingCart size={15} />
                        <span className="ml-2">Add to Cart</span>
                      </motion.button>
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                <div className="mx-auto flex max-w-xl items-center gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-[#7daa8f]">{mobileQty > 0 ? 'Selected total' : 'Total price'}</p>
                    <p className="text-[1rem] font-black leading-tight text-brand-black">{formatCurrency(mobileQty > 0 ? mobileLineTotal : basePrice)}</p>
                    <p className="truncate text-[10px] font-bold text-[#95a28f]">{mobileQty > 0 ? mobileSummary : 'Premium quick view'}</p>
                  </div>

                  {mobileQty === 0 ? (
                    <motion.button
                      whileTap={{ scale: 0.98 }}
                      onClick={handleMobileAdd}
                      type="button"
                      className="ml-auto flex h-[46px] flex-1 items-center justify-center rounded-2xl bg-brand-black px-4 text-[13px] font-black text-white shadow-[0_14px_28px_rgba(44,57,42,0.2)]"
                    >
                      <ShoppingCart size={15} />
                      <span className="ml-2">Add to Cart</span>
                    </motion.button>
                  ) : (
                    <div className="ml-auto flex flex-1 items-center justify-end gap-2">
                      <div className="inline-flex items-center gap-1 rounded-full bg-white px-1.5 py-1 shadow-sm ring-1 ring-[#ead7b7]/55">
                        <button
                          type="button"
                          onClick={() => handleMobileChangeQty(mobileQty - 1)}
                          className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f7f4ed] text-[#5f6d59] transition-colors hover:bg-[#ead7b7]/35"
                        >
                          <Minus size={13} />
                        </button>
                        <span className="min-w-[2rem] text-center text-[13px] font-black text-brand-black">{mobileQty}</span>
                        <button
                          type="button"
                          onClick={() => handleMobileChangeQty(mobileQty + 1)}
                          className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f7f4ed] text-[#5f6d59] transition-colors hover:bg-[#ead7b7]/35"
                        >
                          <Plus size={13} />
                        </button>
                      </div>

                      <AnimatePresence mode="wait">
                        {toast ? (
                          <motion.div
                            key="added"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="flex h-[46px] items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 text-[13px] font-black text-white"
                          >
                            <Check size={15} strokeWidth={3} />
                            <span>Added!</span>
                          </motion.div>
                        ) : (
                          <motion.button
                            key="add-btn"
                            whileTap={{ scale: 0.98 }}
                            onClick={handleAdd}
                            type="button"
                            className="flex h-[46px] items-center justify-center rounded-2xl bg-brand-black px-4 text-[13px] font-black text-white shadow-[0_14px_28px_rgba(44,57,42,0.2)]"
                          >
                            <ShoppingCart size={15} />
                            <span className="ml-2">Add to Cart</span>
                          </motion.button>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </div>

        <div className="hidden lg:flex relative z-10 h-full min-h-0 items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.985, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.99, y: 18 }}
            transition={{ type: 'spring', stiffness: 130, damping: 20, mass: 0.9 }}
            className="relative flex h-[min(92dvh,920px)] w-full max-w-[1180px] overflow-hidden rounded-[34px] bg-[#fbfaf6] shadow-[0_26px_80px_rgba(22,35,20,0.22)]"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-white/70 bg-white/90 text-brand-black shadow-[0_6px_18px_rgba(45,60,35,0.12)] backdrop-blur transition-transform hover:scale-[1.03]"
              aria-label="Close product details"
            >
              <X size={16} />
            </button>

            <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,1.06fr)_minmax(0,0.94fr)]">
              <div className="flex h-full min-h-0 flex-col overflow-hidden border-b border-[#ead7b7]/40 bg-[#f7f2ea] px-5 pb-6 pt-5 lg:border-b-0 lg:border-r lg:px-6 lg:pb-[7.5rem] lg:pt-6 xl:px-8">
                <div className="flex shrink-0 items-center justify-between gap-3 pb-4">
                  <div className="rounded-full bg-white/85 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-[#5f6d59] shadow-sm backdrop-blur">
                    Premium pooja item
                  </div>
                  <div className="rounded-full bg-white/85 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-[#7daa8f] shadow-sm backdrop-blur">
                    Pooja items
                  </div>
                </div>

                <div className="relative flex-1 overflow-hidden rounded-[34px] border border-white/70 bg-gradient-to-b from-[#f2ede2] via-white to-[#edf3ea] shadow-[0_24px_60px_rgba(45,60,35,0.12)]">
                  <div className="absolute left-4 top-4 z-10 rounded-full bg-white/80 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-[#5f6d59] shadow-sm backdrop-blur">
                    Premium focus
                  </div>

                  <div className="relative flex h-full items-center justify-center px-4 py-6 sm:px-6 sm:py-8">
                    <img
                      src={heroImage}
                      alt={product.name}
                      loading="lazy"
                      decoding="async"
                      onError={onImgError}
                      className="max-h-full w-full object-contain"
                    />
                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.42),transparent_56%)]" />
                  </div>
                </div>

              </div>

              <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-[#fbfaf6] px-5 pb-[7.75rem] pt-5 lg:px-6 lg:pb-[7.5rem] lg:pt-6 xl:px-8">
                <section>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#7daa8f]">{t('cat.' + product.category)}</p>
                  <h2 className="mt-1 text-[2rem] leading-[1.02] font-black text-brand-black sm:text-[2.5rem]">{product.name}</h2>
                  {tamilName && <p className="mt-1.5 text-[1rem] font-bold text-[#5f6d59] ta-text sm:text-[1.08rem]">{tamilName}</p>}

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f7f4ed] px-3 py-1.5 text-[11px] font-black text-brand-black ring-1 ring-[#ead7b7]/40">
                      <Star size={12} className="fill-amber-400 text-amber-400" />
                      {(product.rating || 4.7).toFixed(1)}
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-[11px] font-black text-[#5f6d59] shadow-sm ring-1 ring-[#ead7b7]/45">
                      Trusted by 1000+ devotees
                    </span>
                    {discount > 0 && <span className="rounded-full bg-brand-black px-3 py-1.5 text-[11px] font-black text-white">{discount}% OFF</span>}
                  </div>
                </section>

                <section className="mt-5 rounded-[26px] bg-white/88 px-4 py-4 shadow-sm ring-1 ring-[#ead7b7]/45 backdrop-blur sm:px-5">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#7daa8f]">
                        {product.hasVariants && !selectedVariant ? 'Starting From' : 'Price'}
                      </p>
                      <p className="mt-1 text-[2rem] font-black leading-none text-brand-black">
                        {formatCurrency(selectedVariant ? selectedVariant.price : basePrice)}
                      </p>
                      {hasDiscount && !selectedVariant && <p className="mt-1 text-[11px] font-bold text-[#b0a89a] line-through">{formatCurrency(product.price)}</p>}
                    </div>
                    <p className="max-w-[12rem] text-right text-[11px] font-bold text-[#95a28f]">Inclusive of taxes</p>
                  </div>
                </section>

                {/* Variant selector (desktop) — supports Type D (Brand+Weight) 2-level flow */}
                {product.hasVariants ? (
                  <section className="mt-5 rounded-[26px] bg-white/88 px-4 py-4 shadow-sm ring-1 ring-[#ead7b7]/45 backdrop-blur sm:px-5">
                    {(() => {
                      const variants = getVariants(String(product.id))
                      const groups = [...new Set(variants.filter(v => v.groupName).map(v => v.groupName!))]
                      const isGrouped = groups.length > 0
                      const activeGroupVariants = isGrouped && selectedGroup
                        ? variants.filter(v => v.groupName === selectedGroup)
                        : isGrouped ? [] : variants

                      return (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#7daa8f]">
                              {isGrouped ? 'Select Brand' : 'Select Variant'}
                            </p>
                            <button
                              type="button"
                              onClick={() => void toggle(product)}
                              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-black transition-colors ${
                                favorite ? 'border-rose-200 bg-rose-50 text-rose-600' : 'border-[#ead7b7]/70 bg-white text-[#5f6d59]'
                              }`}
                              aria-label={favorite ? 'Remove from favourites' : 'Add to favourites'}
                            >
                              <Heart size={12} className={favorite ? 'fill-rose-500 text-rose-500' : 'text-current'} />
                              {favorite ? 'Saved' : 'Save'}
                            </button>
                          </div>

                          {/* Step 1: Brand/Group selector */}
                          {isGrouped && (
                            <div className="flex flex-wrap gap-2">
                              {groups.map((g) => {
                                const isSel = selectedGroup === g
                                return (
                                  <button
                                    key={g}
                                    type="button"
                                    onClick={() => {
                                      setSelectedGroup(g)
                                      const first = variants.find(v => v.groupName === g && v.stock > 0)
                                        ?? variants.find(v => v.groupName === g)
                                      setSelectedVariant(first ?? null)
                                      setDesktopVariantQty(1)
                                    }}
                                    className={[
                                      'rounded-full border px-4 py-2 text-[12px] font-black transition-all whitespace-nowrap',
                                      isSel ? 'border-[#111111] bg-[#111111] text-white'
                                            : 'border-[#ead7b7]/80 bg-[#f7f4ed] text-[#111111] hover:border-[#7daa8f]',
                                    ].join(' ')}
                                  >
                                    {g}
                                  </button>
                                )
                              })}
                            </div>
                          )}

                          {/* Step 2: Size/Weight chips */}
                          {(isGrouped ? (selectedGroup !== null) : true) && activeGroupVariants.length > 0 && (
                            <div>
                              {isGrouped && (
                                <p className="mb-2 text-[10px] font-black uppercase tracking-[0.22em] text-[#7daa8f]">Select Size</p>
                              )}
                              <div className="flex flex-wrap gap-2">
                                {activeGroupVariants.map((v) => {
                                  const isSel = selectedVariant?.id === v.id
                                  const oos = v.stock <= 0
                                  return (
                                    <button
                                      key={v.id}
                                      type="button"
                                      disabled={oos}
                                      onClick={() => { if (!oos) { setSelectedVariant(v); setDesktopVariantQty(1) } }}
                                      className={[
                                        'rounded-full border px-4 py-2 text-[12px] font-black transition-all whitespace-nowrap',
                                        isSel
                                          ? 'border-[#111111] bg-[#111111] text-white'
                                          : oos
                                          ? 'cursor-not-allowed opacity-40 border-gray-200 text-[#999]'
                                          : 'border-[#ead7b7]/80 bg-[#f7f4ed] text-[#111111] hover:border-[#7daa8f]',
                                      ].join(' ')}
                                    >
                                      {v.variantName}
                                      {!isSel && <span className="ml-1 text-[11px] font-semibold opacity-60">{formatCurrency(v.price)}</span>}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          )}

                          {/* Qty stepper */}
                          {selectedVariant && (
                            <div className="flex items-center gap-2 pt-2 border-t border-[#ead7b7]/40">
                              <span className="text-[11px] font-bold text-[#5f6d59]">Quantity</span>
                              <div className="ml-auto inline-flex items-center gap-1 rounded-xl border border-[#D5DAD0] bg-[#F9FAFB] overflow-hidden">
                                <button type="button"
                                  onClick={() => setDesktopVariantQty(q => Math.max(1, q - 1))}
                                  disabled={desktopVariantQty <= 1}
                                  className="flex h-8 w-8 items-center justify-center text-brand-black hover:bg-[#E8EDE4] disabled:opacity-40 transition-colors"
                                >
                                  <Minus size={12} />
                                </button>
                                <span className="w-8 text-center text-[13px] font-black text-brand-black tabular-nums">{desktopVariantQty}</span>
                                <button type="button"
                                  onClick={() => setDesktopVariantQty(q => Math.min(q + 1, selectedVariant.stock))}
                                  disabled={desktopVariantQty >= selectedVariant.stock}
                                  className="flex h-8 w-8 items-center justify-center text-brand-black hover:bg-[#E8EDE4] disabled:opacity-40 transition-colors"
                                >
                                  <Plus size={12} />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </section>
                ) : (
                  <section className="mt-5 rounded-[26px] bg-white/88 px-4 py-4 shadow-sm ring-1 ring-[#ead7b7]/45 backdrop-blur sm:px-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#7daa8f]">Pack size</p>
                        <p className="mt-1 text-[11px] font-bold text-[#95a28f]">{selectedSummary}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void toggle(product)}
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[11px] font-black transition-colors ${
                          favorite ? 'border-rose-200 bg-rose-50 text-rose-600' : 'border-[#ead7b7]/70 bg-white text-[#5f6d59]'
                        }`}
                        aria-label={favorite ? 'Remove from favourites' : 'Add to favourites'}
                      >
                        <Heart size={12} className={favorite ? 'fill-rose-500 text-rose-500' : 'text-current'} />
                        {favorite ? 'Saved' : 'Save'}
                      </button>
                    </div>

                    {compactPackOptions.length > 0 && (
                      <div className="mt-3 flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
                        {compactPackOptions.map((option) => (
                          <button
                            key={option.label}
                            type="button"
                            onClick={() => setSelectedPackOption(option)}
                            className={`shrink-0 rounded-full border px-3 py-2 text-[11px] font-black transition-colors ${
                              selectedPackOption?.label === option.label
                                ? 'border-brand-black bg-brand-black text-white'
                                : 'border-[#ead7b7]/70 bg-[#f7f4ed] text-[#5f6d59]'
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="mt-3 text-[11px] font-bold text-[#7daa8f]">
                      {effectiveUnitLabel} • {formatCurrency(effectivePrice)}
                    </div>
                  </section>
                )}

                <section className="mt-5 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    { icon: Leaf, title: '100% Natural', subtitle: 'Pure & Handpicked' },
                    { icon: Sparkles, title: 'Fresh & Fragrant', subtitle: 'Daily Selection' },
                    { icon: Flower2, title: 'Pooja Ready', subtitle: 'Temple Quality' },
                    { icon: ShieldCheck, title: 'Safe Packaging', subtitle: 'Hygienically Packed' },
                  ].map((item) => {
                    const Icon = item.icon
                    return (
                      <div key={item.title} className="rounded-[22px] border border-[#ead7b7]/45 bg-white/90 px-3 py-3 shadow-sm">
                        <div className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#f7f4ed] text-[#5f6d59] ring-1 ring-[#ead7b7]/45">
                          <Icon size={16} />
                        </div>
                        <p className="mt-2 text-[12px] font-black text-brand-black">{item.title}</p>
                        <p className="mt-0.5 text-[10px] font-bold text-[#95a28f]">{item.subtitle}</p>
                      </div>
                    )
                  })}
                </section>

                <section className="mt-5 grid gap-2.5">
                  <details className={accordionClass}>
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-black text-brand-black">
                      <span>Product Details</span>
                      <ChevronDown size={16} className="text-[#7daa8f] transition-transform group-open:rotate-180" />
                    </summary>
                    <p className="mt-3 text-sm leading-relaxed text-[#5f6d59]">{product.description || 'Carefully selected herbal product made for daily use.'}</p>
                  </details>

                  <details className={accordionClass}>
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-black text-brand-black">
                      <span>Benefits</span>
                      <ChevronDown size={16} className="text-[#7daa8f] transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="mt-3 space-y-2 text-sm leading-relaxed text-[#5f6d59]">
                      <p className="whitespace-pre-line">{product.benefits || "Crafted with care by VASTHRAALAYAM BOUTIQUE."}</p>
                      <p>{buildUsageNote(product)}</p>
                    </div>
                  </details>

                  <details className={accordionClass}>
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-black text-brand-black">
                      <span>How to Use</span>
                      <ChevronDown size={16} className="text-[#7daa8f] transition-transform group-open:rotate-180" />
                    </summary>
                    <p className="mt-3 text-sm leading-relaxed text-[#5f6d59]">Use as per traditional practice. Store in a cool, dry place away from moisture.</p>
                  </details>
                </section>
              </div>

            </div>

            <div className="absolute inset-x-0 bottom-0 z-20 border-t border-[#ead7b7]/50 bg-white/95 px-4 py-3 backdrop-blur pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
              <div className="mx-auto flex max-w-5xl items-center gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-[#7daa8f]">Total</p>
                  {product.hasVariants && selectedVariant ? (
                    <>
                      <p className="text-base font-black leading-tight text-brand-black">
                        {formatCurrency(variantLineTotal(selectedVariant.price, desktopVariantQty))}
                      </p>
                      <p className="truncate text-[10px] font-bold text-[#95a28f]">
                        {selectedVariant.variantName}{selectedVariant.sizeLabel && selectedVariant.sizeLabel !== selectedVariant.variantName ? ` · ${selectedVariant.sizeLabel}` : ''}
                      </p>
                    </>
                  ) : product.hasVariants ? (
                    <>
                      <p className="text-base font-black leading-tight text-brand-black">{formatCurrency(basePrice)}</p>
                      <p className="truncate text-[10px] font-bold text-[#95a28f]">Select a variant</p>
                    </>
                  ) : (
                    <>
                      <p className="text-base font-black leading-tight text-brand-black">{formatCurrency(desktopPackLineTotal)}</p>
                    </>
                  )}
                </div>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleAdd}
                  type="button"
                  disabled={product.hasVariants && !selectedVariant}
                  className="flex-1 rounded-2xl bg-brand-black py-3.5 text-sm font-black text-white shadow-[0_16px_30px_rgba(44,57,42,0.28)] transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="inline-flex items-center justify-center gap-2">
                    <ShoppingCart size={16} />
                    {product.hasVariants ? 'Add Variant to Cart' : 'Add to Cart'}
                  </span>
                </motion.button>
              </div>
            </div>

            <AnimatePresence>
              {toast && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute right-4 top-4 rounded-full bg-brand-black px-4 py-2 text-[11px] font-black text-white shadow-lg"
                >
                  Added to cart
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
