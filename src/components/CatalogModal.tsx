import React, { useState, useMemo, useEffect, useRef } from 'react'
import { X, Search, ShoppingBag, Edit2, Trash2, Check } from 'lucide-react'
import { useProductStore, type Product } from '../store/store'
import { neonApi } from '../lib/neonApi'

interface CatalogModalProps {
  isOpen: boolean
  onClose: () => void
  onAdd: (product: Product) => void
}

type CategoryOption = { id: string | number; name_en: string; is_active?: boolean; sort_order?: number }

export default function CatalogModal({ isOpen, onClose, onAdd }: CatalogModalProps) {
  const { fetchProducts, products, loading, error } = useProductStore()
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('All')
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [editForm, setEditForm] = useState({ name: '', category: '', price: '' })
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError] = useState('')
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([])

  useEffect(() => {
    if (isOpen) void fetchProducts(true)
  }, [isOpen, fetchProducts])

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    const loadCategories = async () => {
      const { data } = await neonApi.get<CategoryOption[]>('/categories')
      if (!cancelled) setCategoryOptions(data || [])
    }
    void loadCategories()
    return () => { cancelled = true }
  }, [isOpen])

  const categories = useMemo(() => {
    // Only show active categories, in dashboard sort_order
    const activeCats = categoryOptions
      .filter(c => c.is_active !== false)
      .map(c => c.name_en.trim())
      .filter(Boolean)

    // Ensure any category attached to active products (such as Unregistered) is available
    products.forEach(p => {
      const catName = (p.category || '').trim()
      if (p.isActive && catName && !activeCats.includes(catName)) {
        activeCats.push(catName)
      }
    })

    return ['All', ...activeCats]
  }, [categoryOptions, products])

  const allCategoryOptions = useMemo(() => {
    const merged = new Map<string, CategoryOption>()
    categoryOptions
      .filter(category => category.name_en.trim().toLowerCase() !== 'manual')
      .forEach(category => merged.set(category.name_en.trim().toLowerCase(), category))
    products.filter(product => product.isActive && product.category.trim()).forEach(product => {
      const key = product.category.trim().toLowerCase()
      if (key === 'manual') return
      if (!merged.has(key)) merged.set(key, { id: product.categoryId || `product-category-${key}`, name_en: product.category.trim() })
    })
    return Array.from(merged.values()).sort((a, b) => a.name_en.localeCompare(b.name_en))
  }, [categoryOptions, products])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let src = products.filter(p => p.isActive)
    if (activeCategory !== 'All') src = src.filter(p => p.category === activeCategory)
    if (q) src = src.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.nameTa || '').toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q)
    )
    return src
  }, [products, search, activeCategory])

  const lastAddRef = useRef<number>(0)
  const [toastMessage, setToastMessage] = useState('')

  const handleCardClick = (product: Product) => {
    const now = Date.now()
    if (now - lastAddRef.current < 250) return // Prevent duplicate execution on fast taps
    lastAddRef.current = now
    onAdd(product)
    setToastMessage(`Added "${product.name}" to bill`)
  }

  useEffect(() => {
    if (!toastMessage) return
    const timer = setTimeout(() => setToastMessage(''), 2000)
    return () => clearTimeout(timer)
  }, [toastMessage])

  const startEdit = (p: Product) => {
    setEditingProduct(p)
    setEditForm({ name: p.name, category: p.category, price: String(p.price) })
    setEditError('')
  }

  const cancelEdit = () => {
    setEditingProduct(null)
    setEditError('')
  }

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingProduct) return
    if (!editForm.name.trim()) { setEditError('Name is required'); return }
    setEditLoading(true)
    setEditError('')
    const selectedCategory = allCategoryOptions.find(c => c.name_en.trim().toLowerCase() === editForm.category.trim().toLowerCase())
    if (!selectedCategory) { setEditError('Select a valid category'); setEditLoading(false); return }
    const categoryName = selectedCategory.name_en.trim()
    const newPrice = Number(editForm.price)
    const { error } = await neonApi.put(`/products/${editingProduct.id}`, {
      name: editForm.name.trim(),
      category: categoryName,
      category_id: selectedCategory.id,
      price: newPrice,
      offer_price: newPrice,
    })
    if (error) { setEditError(error.message); setEditLoading(false); return }
    await fetchProducts(true)
    setEditLoading(false)
    cancelEdit()
  }

  const handleDelete = async (p: Product) => {
    if (!window.confirm(`Delete "${p.name}"? This will deactivate it.`)) return
    await neonApi.put(`/products/${p.id}`, { is_active: false })
    await fetchProducts(true)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-2 min-[360px]:p-3 sm:p-4">
      <div className="bg-white rounded-2xl sm:rounded-3xl w-full max-w-5xl flex min-h-0 flex-col shadow-2xl overflow-hidden border border-[#E5E7EB]/40 max-h-[calc(100dvh-1rem)] sm:max-h-[85vh]">

        {editingProduct ? (
          <>
            <div className="flex items-center justify-between p-6 border-b border-[#E5E7EB]/40 bg-[#F9FAFB]">
              <h2 className="text-xl font-black text-[#111111]">Edit Product</h2>
              <button onClick={cancelEdit} className="p-2 rounded-xl hover:bg-black/5 text-[#374151]">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={saveEdit} className="p-6 flex flex-col gap-4">
              {editError && <div className="text-red-500 text-sm font-bold bg-red-50 p-3 rounded-xl">{editError}</div>}
              <div>
                <label className="block text-[10px] font-black text-[#374151] tracking-wider uppercase mb-1.5">Product Name</label>
                <input type="text" value={editForm.name}
                  onChange={e => setEditForm({...editForm, name: e.target.value})}
                  className="w-full px-4 py-3 bg-[#F9FAFB] border border-[#E5E7EB]/60 rounded-xl focus:outline-none focus:border-[#7daa8f] text-[13px] font-bold" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-[#374151] tracking-wider uppercase mb-1.5">Category</label>
                  <select value={editForm.category}
                    onChange={e => setEditForm({...editForm, category: e.target.value})}
                    className="w-full min-w-0 h-12 px-4 py-3 bg-[#F9FAFB] border border-[#E5E7EB]/60 rounded-xl focus:outline-none focus:border-[#7daa8f] text-[13px] font-bold touch-manipulation">
                    <option value="">Select category</option>
                    {allCategoryOptions.map(category => <option key={category.id} value={category.name_en}>{category.name_en}</option>)}
                    {!allCategoryOptions.some(category => category.name_en === editForm.category) && editForm.category && (
                      <option value={editForm.category}>{editForm.category}</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-[#374151] tracking-wider uppercase mb-1.5">Price (₹)</label>
                  <input type="number" value={editForm.price}
                    onChange={e => setEditForm({...editForm, price: e.target.value})}
                    className="w-full px-4 py-3 bg-[#F9FAFB] border border-[#E5E7EB]/60 rounded-xl focus:outline-none focus:border-[#7daa8f] text-[13px] font-bold text-right" placeholder="0" />
                </div>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="flex-1 py-3.5 border border-gray-300 text-gray-700 hover:bg-gray-100 rounded-xl text-[13px] font-black uppercase tracking-wider transition-colors min-h-[48px] flex items-center justify-center cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="flex-[1.5] py-3.5 bg-[#7daa8f] hover:bg-[#065F46] text-white rounded-xl text-[13px] font-black uppercase tracking-wider transition-colors disabled:opacity-50 min-h-[48px] flex items-center justify-center cursor-pointer"
                >
                  {editLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between p-5 border-b border-[#E5E7EB]/40 bg-[#F9FAFB]">
              <h2 className="text-[18px] font-black text-[#111111] flex items-center gap-2">
                <Search size={18} className="text-[#7daa8f]" />
                Search Catalog
              </h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-1.5 rounded-xl bg-[#7daa8f] hover:bg-[#065F46] text-white text-xs font-black transition-colors cursor-pointer"
                >
                  Done
                </button>
                <button onClick={onClose} className="p-2 rounded-xl hover:bg-black/5 text-[#374151] cursor-pointer" title="Close">
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="p-3 sm:p-4 border-b border-[#E5E7EB]/40 bg-white space-y-3">
              <div className="relative">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#374151]" />
                <input type="text" value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search by product name, Tamil name, or category..."
                  className="w-full pl-10 pr-4 py-3 bg-[#FAFAFA] border border-[#E5E7EB]/60 rounded-xl focus:outline-none focus:border-[#7daa8f] text-[13px] font-bold text-[#111111]" />
              </div>
              <div className="relative">
                <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar pr-8 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible sm:pr-0 sm:pb-0">
                  {categories.map(cat => (
                    <button key={cat} onClick={() => setActiveCategory(cat)}
                      className={`px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider whitespace-nowrap shrink-0 transition-colors ${activeCategory === cat ? 'bg-[#7daa8f] text-white' : 'bg-[#FAFAFA] text-[#374151] hover:bg-[#F9FAFB] border border-[#E5E7EB]/60'}`}>
                      {cat}
                    </button>
                  ))}
                </div>
                {/* Visual fade on right edge indicating scrollability */}
                <div className="pointer-events-none absolute right-0 top-0 bottom-1 w-8 bg-gradient-to-l from-white via-white/80 to-transparent sm:hidden" />
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2.5 sm:p-4 bg-[#FAFAFA] relative">
              {loading ? (
                <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-[#374151]/70">
                  <span className="h-7 w-7 animate-spin rounded-full border-2 border-[#E5E7EB] border-t-[#7daa8f]" />
                  <p className="text-[13px] font-bold">Loading catalog...</p>
                </div>
              ) : error ? (
                <div className="flex min-h-48 flex-col items-center justify-center gap-2 px-4 text-center text-red-500">
                  <p className="text-[13px] font-bold">Unable to load catalog items.</p>
                  <button type="button" onClick={() => void fetchProducts(true)} className="rounded-lg bg-[#7daa8f] px-3 py-2 text-[11px] font-black text-white">Try again</button>
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-[#374151]/60 py-12">
                  <ShoppingBag size={48} className="mb-4 opacity-20" />
                  <p className="text-[14px] font-bold">No products found</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 min-[360px]:grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2.5 sm:gap-4 items-stretch">
                  {filtered.map(product => (
                    <div
                      key={product.id}
                      onClick={() => handleCardClick(product)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          handleCardClick(product)
                        }
                      }}
                      className="bg-white border border-[#E5E7EB]/80 rounded-2xl p-2.5 min-[390px]:p-3 sm:p-3.5 flex flex-col justify-between gap-2.5 sm:gap-3 hover:border-[#7daa8f] hover:shadow-md active:scale-[0.98] transition-all cursor-pointer touch-manipulation select-none group min-h-[96px] h-full"
                    >
                      {/* Row 1: Item name (wraps to 2 lines if long, never overlapped) & secondary text */}
                      <div className="w-full">
                        <h4 className="text-[13px] font-black text-[#111111] leading-snug group-hover:text-[#7daa8f] transition-colors break-words line-clamp-2" title={product.name}>
                          {product.name}
                        </h4>
                        {product.nameTa && (
                          <p className="text-[10px] font-bold text-[#374151] mt-0.5 line-clamp-1 break-words">
                            {product.nameTa}
                          </p>
                        )}
                      </div>

                      {/* MOBILE (screens under 640px): 3-Row Layout with Row 2 & Row 3 */}
                      <div className="flex flex-col gap-2 pt-2 border-t border-[#E5E7EB]/40 sm:hidden">
                        {/* Row 2: Price on left, edit & delete buttons on right */}
                        <div className="flex items-center justify-between gap-2 min-w-0">
                          <div className="min-w-0 flex-1">
                            <span className="text-[13px] min-[390px]:text-[14px] font-black text-[#111111] tabular-nums block truncate">
                              ₹{product.price}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); startEdit(product) }}
                              title="Edit product"
                              className="w-9 h-9 min-h-[36px] min-w-[36px] p-2 flex items-center justify-center rounded-xl bg-white border border-[#E5E7EB]/80 text-[#374151] hover:text-[#7daa8f] hover:border-[#7daa8f]/40 active:scale-95 shadow-xs transition-all cursor-pointer shrink-0"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); void handleDelete(product) }}
                              title="Delete product"
                              className="w-9 h-9 min-h-[36px] min-w-[36px] p-2 flex items-center justify-center rounded-xl bg-white border border-[#E5E7EB]/80 text-red-400 hover:text-red-600 hover:border-red-300 active:scale-95 shadow-xs transition-all cursor-pointer shrink-0"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        {/* Row 3: Badges full-width row with flex-wrap and small gap */}
                        <div className="flex items-center gap-1.5 flex-wrap w-full">
                          <span className="text-[10px] font-bold text-[#374151] uppercase tracking-wider bg-[#F9FAFB] px-2 py-0.5 rounded border border-[#E5E7EB]/40 whitespace-nowrap">
                            {product.category}
                          </span>
                          {product.itemType === 'service' && (
                            <span className="text-[10px] font-black uppercase tracking-wider bg-purple-100 text-purple-800 px-2 py-0.5 rounded border border-purple-200 whitespace-nowrap">
                              Service
                            </span>
                          )}
                        </div>
                      </div>

                      {/* DESKTOP (screens >= 640px): 3-Row Layout */}
                      <div className="hidden sm:flex flex-col gap-2.5 pt-2.5 border-t border-[#E5E7EB]/40 w-full">
                        {/* Row 2: Price on left, edit & delete buttons on right */}
                        <div className="flex items-center justify-between gap-2 w-full min-w-0">
                          <div className="min-w-0 flex-1">
                            <span className="text-[14px] font-black text-[#111111] tabular-nums block truncate">
                              ₹{product.price}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 static" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); startEdit(product) }}
                              title="Edit product"
                              className="w-[35px] h-[35px] min-w-[35px] min-h-[35px] max-w-[35px] max-h-[35px] p-0 flex items-center justify-center rounded-xl bg-white border border-[#E5E7EB]/80 text-[#374151] hover:text-[#7daa8f] hover:border-[#7daa8f]/40 active:scale-95 shadow-xs transition-all cursor-pointer shrink-0 static"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); void handleDelete(product) }}
                              title="Delete product"
                              className="w-[35px] h-[35px] min-w-[35px] min-h-[35px] max-w-[35px] max-h-[35px] p-0 flex items-center justify-center rounded-xl bg-white border border-[#E5E7EB]/80 text-red-400 hover:text-red-600 hover:border-red-300 active:scale-95 shadow-xs transition-all cursor-pointer shrink-0 static"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        {/* Row 3: Badges full-width row with flex-wrap and 6px gap */}
                        <div className="flex items-center gap-[6px] flex-wrap w-full">
                          <span className="text-[10px] sm:text-[11px] font-bold text-[#374151] uppercase tracking-wider bg-[#F9FAFB] px-2 py-0.5 rounded border border-[#E5E7EB]/40 whitespace-nowrap">
                            {product.category}
                          </span>
                          {product.itemType === 'service' && (
                            <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider bg-purple-100 text-purple-800 px-2 py-0.5 rounded border border-purple-200 whitespace-nowrap">
                              Service
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {toastMessage && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[110] bg-emerald-800 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 pointer-events-none animate-in fade-in slide-in-from-bottom-2">
                  <Check size={16} className="text-emerald-300 shrink-0" />
                  <span>{toastMessage}</span>
                </div>
              )}
            </div>
          </>
        )}

      </div>
    </div>
  )
}
