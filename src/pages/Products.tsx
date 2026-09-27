import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Search, SlidersHorizontal, Filter, CheckCircle2 } from 'lucide-react'
import ProductCard from '../components/ProductCard'
import { useLangStore } from '../store/langStore'
import { useProductStore, useVariantStore } from '../store/store'

type FilterSideBlockProps = {
  t: (key: string) => string
  categories: string[]
  activeCategory: string
  setActiveCategory: Dispatch<SetStateAction<string>>
  healthConcerns: string[]
  activeRem: string[]
  setActiveRem: Dispatch<SetStateAction<string[]>>
  toggle: (arr: string[], setArr: (value: string[]) => void, val: string) => void
}

function FilterSideBlock({
  t,
  categories,
  activeCategory,
  setActiveCategory,
  healthConcerns,
  activeRem,
  setActiveRem,
  toggle,
}: FilterSideBlockProps) {
  return (
    <div className="space-y-10">
      <div>
        <div className="flex items-center gap-2 mb-4">
           <div className="w-1 h-4 bg-sageDark rounded-full"></div>
           <h3 className="text-[13px] font-black text-textMain uppercase tracking-wider">
              {t('cat.title')}
           </h3>
        </div>
        <div className="space-y-1">
           {categories.map(cat => (
             <button
               key={cat}
               onClick={() => setActiveCategory(cat)}
               className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-between group ${activeCategory === cat ? 'bg-sageDark text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50 hover:text-sageDark'}`}
             >
              <span>{cat === 'All' ? t('cat.view_all') : t('cat.' + cat)}</span>
              <div className={`w-1.5 h-1.5 rounded-full transition-all ${activeCategory === cat ? 'bg-white' : 'bg-transparent group-hover:bg-sage/40'}`}></div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-4">
           <div className="w-1 h-4 bg-sageDark rounded-full"></div>
           <h3 className="text-[13px] font-black text-textMain uppercase tracking-wider">
              {t('remedy.title')}
           </h3>
        </div>
        <div className="flex flex-col gap-1.5">
          {healthConcerns.map(rem => (
            <label key={rem} className={`flex items-center gap-3 p-2 rounded-xl cursor-pointer transition-colors border ${activeRem.includes(rem) ? 'bg-sage/10 border-sage/20' : 'border-transparent hover:bg-gray-50'}`}>
              <input
                type="checkbox"
                checked={activeRem.includes(rem)}
                onChange={() => toggle(activeRem, setActiveRem, rem)}
                className="w-4 h-4 rounded border-gray-300 text-sageDark focus:ring-sage"
              />
              <span className={`text-[13px] font-bold transition-colors ${activeRem.includes(rem) ? 'text-sageDark' : 'text-gray-500'}`}>
                {t('remedy.' + rem)}
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function Products() {
  const [params] = useSearchParams()
  const [search, setSearch] = useState(params.get('search') || '')
  const [activeCategory, setActiveCategory] = useState(params.get('cat') || 'All')
  const [activeRem, setActiveRem] = useState<string[]>(params.get('remedy') ? [params.get('remedy')!] : [])
  const [sort, setSort] = useState(params.get('sort') || 'default')
  const [showFilters, setShowFilters] = useState(false)
  const { t } = useLangStore()
  const { products, fetchProducts, loading, error } = useProductStore()
  const variantsMap = useVariantStore(state => state.variantsMap)

  useEffect(() => {
    void fetchProducts()
  }, [fetchProducts])

  // Dynamically derive categories and remedies from actual product data
  const categories = useMemo(() => {
    const live = Array.from(new Set(products.filter((p) => p.isActive).map(p => p.category))).filter(Boolean)
    return ['All', ...live]
  }, [products])

  const healthConcerns = useMemo(() => {
    const live = Array.from(new Set(products.filter((p) => p.isActive).flatMap(p => p.remedy || []))).filter(Boolean)
    return live
  }, [products])

  const toggle = (arr: string[], setArr: (value: string[]) => void, val: string) => {
    setArr(arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val])
  }

  const clear = () => {
    setSearch('')
    setActiveCategory('All')
    setActiveRem([])
    setSort('default')
  }

  const filtered = useMemo(() => {
    let out = products.filter((p) => p.isActive)

    if (search) {
      const q = search.toLowerCase()
      // Build set of product IDs whose variants match the query
      const variantMatchIds = new Set<string>()
      for (const [productId, variants] of Object.entries(variantsMap)) {
        if (variants.some(v =>
          v.variantName.toLowerCase().includes(q) ||
          (v.sizeLabel && v.sizeLabel.toLowerCase().includes(q))
        )) {
          variantMatchIds.add(productId)
        }
      }
      out = out.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.nameTa && p.nameTa.toLowerCase().includes(q)) ||
        p.category.toLowerCase().includes(q) ||
        (p.remedy || []).some(r => r.toLowerCase().includes(q)) ||
        variantMatchIds.has(String(p.id))
      )
    }

    if (activeCategory !== 'All') {
      out = out.filter(p => p.category === activeCategory)
    }

    if (activeRem.length > 0) {
      out = out.filter(p => p.remedy.some(r => activeRem.includes(r)))
    }

    if (sort === 'price-asc') out.sort((a, b) => a.price - b.price)
    else if (sort === 'price-desc') out.sort((a, b) => b.price - a.price)
    else if (sort === 'rating') out.sort((a, b) => b.rating - a.rating)

    return out
  }, [products, search, activeCategory, activeRem, sort, variantsMap])

  const SkeletonCard = () => (
    <div className="rounded-2xl border border-[#E5E7EB]/50 bg-white overflow-hidden animate-pulse">
      <div className="aspect-square bg-[#E5E7EB]/30" />
      <div className="p-3 space-y-2">
        <div className="h-2 bg-[#E5E7EB]/40 rounded w-1/2" />
        <div className="h-3 bg-[#E5E7EB]/40 rounded w-4/5" />
        <div className="h-3 bg-[#E5E7EB]/30 rounded w-3/5" />
        <div className="flex gap-1 mt-2">
          {[1,2,3,4].map(i => <div key={i} className="h-5 bg-[#E5E7EB]/30 rounded-lg w-10" />)}
        </div>
        <div className="flex justify-between items-center pt-2 border-t border-[#E5E7EB]/30 mt-2">
          <div className="h-5 bg-[#E5E7EB]/40 rounded w-14" />
          <div className="h-8 bg-[#E5E7EB]/40 rounded-xl w-16" />
        </div>
      </div>
    </div>
  )

  return (
    <div className="bg-bgMain min-h-screen">
      {/* Header Panel */}
      <div className="bg-white border-b border-[#E5E7EB]/30">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:py-10 text-center">
          <motion.h1 initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            className="text-2xl sm:text-4xl font-black font-headline text-[#111111] mb-2">{t('products.title')}</motion.h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
            className="text-sm sm:text-base text-[#374151] font-medium">{t('products.sub')}</motion.p>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 flex flex-col lg:flex-row gap-8">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:block w-64 shrink-0">
           <div className="sticky top-24 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
              <div className="flex justify-between items-center mb-6">
                 <h2 className="font-black text-lg flex items-center gap-2"><Filter size={18}/> Filters</h2>
                 {(search || activeCategory !== 'All' || activeRem.length > 0) && (
                   <button onClick={clear} className="text-xs font-bold text-red-500 hover:underline">{t('products.clear')}</button>
                 )}
              </div>
              <FilterSideBlock
                t={t}
                categories={categories}
                activeCategory={activeCategory}
                setActiveCategory={setActiveCategory}
                healthConcerns={healthConcerns}
                activeRem={activeRem}
                setActiveRem={setActiveRem}
                toggle={toggle}
              />
           </div>
        </aside>

        {/* main list */}
        <div className="flex-grow">
          {/* Controls */}
          <div className="flex flex-col sm:flex-row gap-4 mb-8">
            <div className="relative flex-grow">
               <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
               <input
                 value={search}
                 onChange={e => setSearch(e.target.value)}
                 className="w-full h-10 sm:h-12 pl-12 pr-4 bg-white border border-gray-200 rounded-2xl focus:ring-2 focus:ring-sage focus:border-transparent outline-none shadow-sm transition-all"
                 placeholder={t('nav.search_placeholder')}
               />
            </div>
            <div className="flex gap-2">
               <select
                 value={sort}
                 onChange={e => setSort(e.target.value)}
                 className="h-10 sm:h-12 px-4 bg-white border border-gray-200 rounded-2xl text-sm font-bold shadow-sm outline-none cursor-pointer"
               >
                 <option value="default">{t('products.sort.default')}</option>
                 <option value="price-asc">{t('products.sort.price_low')}</option>
                 <option value="price-desc">{t('products.sort.price_high')}</option>
                 <option value="rating">{t('products.sort.rating')}</option>
               </select>
              <button onClick={() => setShowFilters(!showFilters)} className="lg:hidden h-10 w-10 sm:h-12 sm:w-12 flex items-center justify-center bg-white border border-gray-200 rounded-2xl shadow-sm">
                  <SlidersHorizontal size={20}/>
               </button>
            </div>
          </div>

          <AnimatePresence>
            {showFilters && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="lg:hidden mb-6 overflow-hidden">
                 <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-md">
                   <FilterSideBlock
                     t={t}
                     categories={categories}
                     activeCategory={activeCategory}
                     setActiveCategory={setActiveCategory}
                     healthConcerns={healthConcerns}
                     activeRem={activeRem}
                     setActiveRem={setActiveRem}
                     toggle={toggle}
                   />
                 </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Results Summary */}
          <div className="flex items-center justify-between mb-6">
             <div className="flex items-center gap-2 text-sm font-bold text-gray-500">
                {loading ? (
                  <div className="flex items-center gap-2"><div className="w-4 h-4 border-2 border-sage border-t-transparent animate-spin rounded-full"></div> Loading...</div>
                ) : (
                  <>Showing <span className="text-gray-900">{filtered.length}</span> results</>
                )}
             </div>
             {error && <div className="text-xs font-bold text-red-500">Error: {error}</div>}
          </div>

          {/* Grid */}
          {loading ? (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 12 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : !loading && filtered.length === 0 ? (
            <div className="bg-white border border-[#E5E7EB]/40 rounded-3xl p-10 sm:p-20 text-center flex flex-col items-center">
               <div className="w-20 h-20 bg-[#F9FAFB] rounded-full flex items-center justify-center mb-6">
                 <Search className="text-[#E5E7EB]" size={32}/>
               </div>
               <h3 className="text-xl font-black mb-2 text-[#111111]">{t('products.none')}</h3>
               <p className="text-[#374151] max-w-xs mx-auto mb-6 text-sm">No products found matching your filters.</p>
               <button onClick={clear} className="text-sm font-black text-[#7daa8f] hover:underline">Clear all filters</button>
            </div>
          ) : (
            <motion.div layout className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4 items-stretch">
              <AnimatePresence mode="popLayout">
                {filtered.map(p => (
                  <motion.div key={p.id} layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="flex flex-col">
                     <ProductCard product={p} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          )}

          {/* Info Banner */}
          <div className="mt-12 p-6 sm:p-8 bg-green-50 border border-green-100 rounded-3xl flex flex-col sm:flex-row items-center gap-6">
             <div className="w-16 h-16 rounded-2xl bg-white shadow-sm flex items-center justify-center shrink-0">
                <CheckCircle2 size={32} className="text-green-600" />
             </div>
             <div>
                <h4 className="font-black text-lg text-brand-black leading-tight">VASTHRAALAYAM Premium Quality</h4>
                <p className="text-sm text-gray-700 mt-1">Every garment and product in our collection is curated with premium fabric and verified for quality excellence.</p>
             </div>
          </div>
        </div>
      </div>
    </div>
  )
}
