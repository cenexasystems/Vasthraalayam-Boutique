import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Heart, Minus, Plus, ShoppingCart, Star, ArrowLeft } from 'lucide-react'
import { useCartStore, useFavStore, useProductStore, type Product } from '../store/store'
import { useLangStore } from '../store/langStore'
import {
  calculateLineTotal,
  formatCurrency,
} from '../lib/retail'
import { getProductImage, onImgError } from '../lib/productImages'

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



const buildUsageNote = (product: Product) => {
  if (product.unitType === 'weight' || product.unitType === 'volume') {
    return 'Use as per traditional practice. Store in a cool, dry place away from moisture.'
  }
  return 'Use as per traditional practice. Store in a clean, dry place.'
}

const accordionClass = 'rounded-[22px] border border-[#ead7b7]/60 bg-white px-4 py-3 shadow-sm'

export default function ProductDetails() {
  const { id } = useParams()
  const navigate = useNavigate()
  const addItem = useCartStore((state) => state.addItem)
  const removeItem = useCartStore((state) => state.removeItem)
  const updateQuantity = useCartStore((state) => state.updateQuantity)
  const fetchProducts = useProductStore((state) => state.fetchProducts)
  const allProducts = useProductStore((state) => state.products)
  const { t, lang } = useLangStore()
  const { toggle, isFav } = useFavStore()
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedPackOption, setSelectedPackOption] = useState<{ quantity: number; unit: string; label: string } | null>(null)
  const [mobileQty, setMobileQty] = useState(0)
  const [mobilePack, setMobilePack] = useState<{ quantity: number; unit: string; label: string } | null>(null)

  useEffect(() => {
    async function load() {
      if (!id) {
        setError('Product not found')
        setLoading(false)
        return
      }

      setLoading(true)
      setError('')

      try {
        let localProduct = useProductStore.getState().products.find((item) => String(item.id) === id)

        if (!localProduct) {
          await fetchProducts()
          localProduct = useProductStore.getState().products.find((item) => String(item.id) === id)
        }

        if (localProduct && localProduct.isActive) {
          setProduct(localProduct)
          return
        }

        throw new Error('Product not available')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [id, fetchProducts])

  useEffect(() => {
    if (!product) return
    const packOpts = getCompactPackOptions(product)
    setSelectedPackOption(packOpts[0] ?? null)
    setMobileQty(0)
    setMobilePack(packOpts[0] ?? null)
  }, [product])

  const displayName = lang === 'ta' && product?.nameTa ? product.nameTa : product?.name ?? ''
  const displayDesc = lang === 'ta' && product?.descriptionTa ? product.descriptionTa : product?.description ?? ''
  const displayBen = lang === 'ta' && product?.benefitsTa ? product.benefitsTa : product?.benefits ?? ''

  const basePrice = product
    ? (product.offerPrice && product.offerPrice < product.price ? product.offerPrice : product.price)
    : 0
  // qty = 1 pack; lineTotal = price × 1
  const lineTotal = calculateLineTotal(1, product?.unitType ?? 'unit', 1, basePrice)
  const hasDiscount = !!(product && product.offerPrice && product.offerPrice < product.price)
  const discount = product && hasDiscount
    ? Math.round(((product.price - product.offerPrice!) / product.price) * 100)
    : 0

  const relatedProducts = useMemo(() => {
    if (!product) return []
    const related = allProducts.filter((item) => {
      if (String(item.id) === String(product.id) || !item.isActive) return false
      if (item.category === product.category) return true
      return Boolean(item.remedy?.some((remedy) => product.remedy?.includes(remedy)))
    })

    return related.slice(0, 10)
  }, [allProducts, product])

  if (loading) return <div className="min-h-screen bg-[#fbfaf6] p-10 text-center font-bold text-brand-black">Loading...</div>
  if (error || !product) return <div className="min-h-screen bg-[#fbfaf6] p-10 text-center font-bold text-red-500">{error || 'Product not found'}</div>

  const favorite = isFav(product.id)
  const handleAdd = () => {
    addItem(product, 1, selectedPackOption?.label ?? product.unitLabel)
  }

  const handleMobileAdd = () => {
    const pack = mobilePack ?? getCompactPackOptions(product)[0] ?? null
    addItem(product, 1, pack?.label ?? product.unitLabel)
    setMobileQty(1)
  }

  const handleMobileChangeQty = (nextQty: number) => {
    if (nextQty <= 0) {
      removeItem(product.id)
      setMobileQty(0)
      return
    }
    const pack = mobilePack ?? getCompactPackOptions(product)[0] ?? null
    const unit = pack?.label ?? product.unitLabel
    if (mobileQty <= 0) {
      addItem(product, nextQty, unit)
    } else {
      updateQuantity(product.id, nextQty)
    }
    setMobileQty(nextQty)
  }

  const handleMobilePackChange = (option: { quantity: number; unit: string; label: string }) => {
    if (option.label === mobilePack?.label) return
    const currentQty = mobileQty
    setMobilePack(option)
    if (currentQty > 0) {
      removeItem(product.id)
      addItem(product, currentQty, option.label)
    }
  }

  const heroImage = getProductImage(product.name, product.category, product.imageUrl, 'detail')

  return (
    <div className="min-h-screen bg-[#fbfaf6] pb-[calc(7.75rem+env(safe-area-inset-bottom))]">
      <div className="lg:hidden sticky top-0 z-30 border-b border-white/60 bg-[#fbfaf6]/92 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <Link
            to="/products"
            className="inline-flex items-center gap-2 rounded-full border border-[#ead7b7]/60 bg-white px-3 py-2 text-[11px] font-black text-brand-black shadow-sm"
          >
            <ArrowLeft size={14} /> Products
          </Link>
          <button
            type="button"
            onClick={() => void toggle(product)}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[11px] font-black shadow-sm ${
              favorite ? 'border-rose-200 bg-rose-50 text-rose-600' : 'border-[#ead7b7]/60 bg-white text-[#5f6d59]'
            }`}
            aria-label={favorite ? 'Remove from favourites' : 'Add to favourites'}
          >
            <Heart size={14} className={favorite ? 'fill-rose-500 text-rose-500' : 'text-current'} />
            {favorite ? 'Saved' : 'Save'}
          </button>
        </div>
      </div>

      <div className="lg:hidden mx-auto flex max-w-3xl flex-col gap-0 px-0 sm:px-6 lg:px-8">
        <section className="px-4 pt-4 sm:px-0 sm:pt-6">
          <div className="relative overflow-hidden rounded-[30px] border border-white/70 bg-gradient-to-b from-[#f2ede2] via-white to-[#edf3ea] shadow-[0_20px_50px_rgba(45,60,35,0.14)]">
            <div className="absolute left-3 top-3 z-10 rounded-full bg-white/80 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-[#5f6d59] shadow-sm backdrop-blur">
              Premium focus
            </div>
            <div className="relative aspect-[4/3] min-h-[24svh] max-h-[34svh] sm:aspect-[16/11] sm:min-h-[22rem] sm:max-h-[24rem]">
              <img
                src={heroImage}
                alt={product.name}
                loading="lazy"
                decoding="async"
                onError={onImgError}
                className="h-full w-full object-contain p-4 sm:p-6"
              />
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.45),transparent_56%)]" />
            </div>
          </div>
        </section>

        <section className="px-4 pt-4 sm:px-0 sm:pt-5">
          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#7daa8f]">{t('cat.' + product.category)}</p>
            <h1 className="text-[1.55rem] leading-tight font-black text-brand-black sm:text-4xl">{displayName}</h1>
            {product.nameTa && <p className="text-base font-bold text-[#5f6d59] ta-text sm:text-lg">{product.nameTa}</p>}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11px] font-black text-brand-black shadow-sm ring-1 ring-[#ead7b7]/50">
                <Star size={12} className="fill-amber-400 text-amber-400" />
                {(product.rating || 4.7).toFixed(1)}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-[#f7f4ed] px-3 py-1.5 text-[11px] font-black text-[#5f6d59] shadow-sm ring-1 ring-[#ead7b7]/45">
                <span className="text-[#7daa8f]">{formatCurrency(basePrice)}</span>
                {hasDiscount && <span className="text-[#b0a89a] line-through">{formatCurrency(product.price)}</span>}
              </span>
              {discount > 0 && <span className="rounded-full bg-brand-black px-3 py-1.5 text-[11px] font-black text-white">{discount}% OFF</span>}
            </div>
          </div>
        </section>

        <section className="px-4 pt-4 sm:px-0">
          <div className="rounded-[24px] bg-white/95 p-3.5 shadow-sm ring-1 ring-[#ead7b7]/55 sm:p-4">
            <AnimatePresence mode="wait">
              {mobileQty === 0 ? (
                <motion.button
                  key="mobile-add"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  transition={{ duration: 0.18 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleMobileAdd}
                  type="button"
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-black py-3 text-sm font-black text-white shadow-[0_16px_30px_rgba(44,57,42,0.22)]"
                >
                  <ShoppingCart size={16} /> Add
                </motion.button>
              ) : (
                <motion.div
                  key="mobile-stepper"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  transition={{ duration: 0.18 }}
                  className="space-y-3"
                >
                  {(product.predefinedOptions.length > 0 && (product.unitType === 'weight' || product.unitType === 'volume')) ? (
                    <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
                      {getCompactPackOptions(product).map((option) => (
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
                  ) : null}

                  <div className="inline-flex w-full items-center justify-between gap-2 rounded-full bg-white px-2 py-1 shadow-sm ring-1 ring-[#ead7b7]/55">
                    <button
                      type="button"
                      onClick={() => handleMobileChangeQty(mobileQty - 1)}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f7f4ed] text-[#5f6d59]"
                    >
                      <Minus size={13} />
                    </button>
                    <span className="min-w-[2rem] text-center text-[14px] font-black text-brand-black">{mobileQty}</span>
                    <button
                      type="button"
                      onClick={() => handleMobileChangeQty(mobileQty + 1)}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f7f4ed] text-[#5f6d59]"
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>
      </div>

      <div className="hidden lg:block mx-auto flex max-w-3xl flex-col gap-0 px-0 sm:px-6 lg:px-8">
        <section className="px-4 pt-4 sm:px-0 sm:pt-6">
          <div className="relative overflow-hidden rounded-[34px] border border-white/70 bg-gradient-to-b from-[#f2ede2] via-white to-[#edf3ea] shadow-[0_24px_60px_rgba(45,60,35,0.14)]">
            <div className="absolute left-3 top-3 z-10 rounded-full bg-white/80 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-[#5f6d59] shadow-sm backdrop-blur">
              Premium focus
            </div>
            <div className="relative aspect-[4/5] min-h-[64svh] sm:aspect-[16/13] sm:min-h-[54svh]">
              <img
                src={heroImage}
                alt={product.name}
                loading="lazy"
                decoding="async"
                onError={onImgError}
                className="h-full w-full object-contain p-4 sm:p-6"
              />
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.45),transparent_56%)]" />
            </div>
          </div>
        </section>

        <section className="px-4 pt-4 sm:px-0 sm:pt-5">
          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#7daa8f]">{t('cat.' + product.category)}</p>
            <h1 className="text-[1.8rem] leading-tight font-black text-brand-black sm:text-4xl">{displayName}</h1>
            {product.nameTa && <p className="text-base font-bold text-[#5f6d59] ta-text sm:text-lg">{product.nameTa}</p>}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11px] font-black text-brand-black shadow-sm ring-1 ring-[#ead7b7]/50">
                <Star size={12} className="fill-amber-400 text-amber-400" />
                {(product.rating || 4.7).toFixed(1)}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-[#f7f4ed] px-3 py-1.5 text-[11px] font-black text-[#5f6d59] shadow-sm ring-1 ring-[#ead7b7]/45">
                <span className="text-[#7daa8f]">{formatCurrency(basePrice)}</span>
                {hasDiscount && <span className="text-[#b0a89a] line-through">{formatCurrency(product.price)}</span>}
              </span>
              {discount > 0 && <span className="rounded-full bg-brand-black px-3 py-1.5 text-[11px] font-black text-white">{discount}% OFF</span>}
            </div>
          </div>
        </section>

        <section className="px-4 pt-4 sm:px-0">
          <div className="rounded-[24px] bg-white/95 p-3.5 shadow-sm ring-1 ring-[#ead7b7]/55 sm:p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#7daa8f]">Pack size</p>
                <p className="mt-1 text-[11px] font-bold text-[#95a28f]">{selectedPackOption?.label ?? product.unitLabel}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-[#7daa8f]">Price</p>
                <p className="text-lg font-black text-brand-black">{formatCurrency(lineTotal)}</p>
              </div>
            </div>

            {getCompactPackOptions(product).length > 0 ? (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
                {getCompactPackOptions(product).map((option) => (
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
            ) : null}

            <div className="mt-3 text-[11px] font-bold text-[#7daa8f]">
              {selectedPackOption?.label ?? product.unitLabel} • {formatCurrency(basePrice)}
            </div>
          </div>
        </section>

        <section className="px-4 pt-4 sm:px-0">
          <div className="grid gap-2.5">
            <details className={accordionClass}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-black text-brand-black">
                <span>Description</span>
                <ChevronDown size={16} className="text-[#7daa8f] transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-[#5f6d59]">{displayDesc || 'Carefully selected herbal product made for daily use.'}</p>
            </details>

            <details className={accordionClass}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-black text-brand-black">
                <span>Benefits & care</span>
                <ChevronDown size={16} className="text-[#7daa8f] transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-3 space-y-2 text-sm leading-relaxed text-[#5f6d59]">
                <p className="whitespace-pre-line">{displayBen || "Crafted with care by VASTHRAALAYAM BOUTIQUE."}</p>
                <p>{buildUsageNote(product)}</p>
              </div>
            </details>
          </div>
        </section>

        <section className="px-4 pt-4 sm:px-0">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[11px] font-black uppercase tracking-[0.24em] text-[#7daa8f]">Related products</h3>
            <span className="text-[11px] font-bold text-[#9aa893]">Swipe for more</span>
          </div>
          <div className="mt-3 flex gap-3 overflow-x-auto pb-2 hide-scrollbar">
            {relatedProducts.length === 0 && <div className="text-sm text-[#7a8672]">No related items yet.</div>}
            {relatedProducts.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(`/product/${item.id}`)}
                className="group min-w-[124px] overflow-hidden rounded-[20px] bg-white text-left shadow-sm ring-1 ring-[#ead7b7]/55 transition-transform hover:-translate-y-0.5"
              >
                <div className="aspect-square bg-[#f2f0e8]">
                  <img
                    src={getProductImage(item.name, item.category, item.imageUrl, 'tile')}
                    alt={item.name}
                    loading="lazy"
                    decoding="async"
                    onError={onImgError}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                </div>
                <div className="space-y-1.5 p-2.5">
                  <p className="line-clamp-2 text-[11px] font-bold leading-snug text-brand-black">{item.name}</p>
                  <p className="text-[10px] font-black text-[#7daa8f]">{formatCurrency(item.offerPrice || item.price)}</p>
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#ead7b7]/50 bg-white/95 px-4 py-3 backdrop-blur pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-[#7daa8f]">Total</p>
            <p className="text-base font-black leading-tight text-brand-black">{formatCurrency(lineTotal)}</p>
          </div>
          <button
            onClick={handleAdd}
            className="flex-1 rounded-2xl bg-brand-black py-3.5 text-sm font-black text-white shadow-[0_16px_30px_rgba(44,57,42,0.28)]"
            type="button"
          >
            <span className="inline-flex items-center justify-center gap-2">
              <ShoppingCart size={16} /> Add to Cart
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
