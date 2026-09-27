import { useEffect } from 'react'
import { useProductStore, useVariantStore, useSettingsStore } from '../store/store'
import { useAlarmStore, type LowStockItem } from '../store/alarmStore'

const isExcludedCategory = (category: string | undefined | null, categoryId: unknown) =>
  String(category || '').trim().toLowerCase() === 'unregistered' || String(categoryId ?? '') === '4'

export function useLowStockMonitor(enabled: boolean = true, role?: string | null) {
  const setLowStockItems = useAlarmStore((state) => state.setLowStockItems)
  const products = useProductStore((state) => state.products)
  const fetchProducts = useProductStore((state) => state.fetchProducts)
  const variantsMap = useVariantStore((state) => state.variantsMap)
  const refetchVariants = useVariantStore((state) => state.refetchVariants)
  const defaultThreshold = useSettingsStore((state) => state.settings?.lowStockThreshold ?? 5)

  // Recompute whenever the shared product/variant stores change (e.g. after
  // a sale or a stock edit elsewhere already triggers a refetch) or the
  // default threshold in Settings changes.
  useEffect(() => {
    if (!enabled) {
      setLowStockItems([])
      return
    }

    const flagged: LowStockItem[] = []

    for (const p of products) {
      if (p.isActive === false || p.hasVariants || p.itemType === 'service') continue
      if (isExcludedCategory(p.category, p.categoryId)) continue

      const threshold = Number(p.lowStockAlert) > 0 ? Number(p.lowStockAlert) : defaultThreshold
      const currentStock = Number(p.stockQuantity) || 0
      if (currentStock <= threshold) {
        flagged.push({
          id: `p-${p.id}`,
          name: p.name,
          stock: currentStock,
          alertThreshold: threshold,
          barcode: p.barcode,
          category: p.category,
        })
      }
    }

    for (const [productId, variants] of Object.entries(variantsMap)) {
      const parent = products.find((p) => String(p.id) === productId)
      if (parent?.isActive === false || parent?.itemType === 'service') continue
      if (isExcludedCategory(parent?.category, parent?.categoryId)) continue

      for (const v of variants) {
        if (!v.isActive) continue
        const currentStock = Number(v.stock) || 0
        if (currentStock <= defaultThreshold) {
          flagged.push({
            id: `v-${v.id}`,
            name: parent?.name || 'Product Variant',
            variantName: v.variantName,
            stock: currentStock,
            alertThreshold: defaultThreshold,
            barcode: v.barcode || undefined,
            category: parent?.category,
          })
        }
      }
    }

    setLowStockItems(flagged)
  }, [enabled, products, variantsMap, defaultThreshold, setLowStockItems])

  // Periodic refresh of the underlying data (no realtime subscriptions on
  // this Neon-backed setup) so stock changes made elsewhere still surface
  // here within ~15s.
  useEffect(() => {
    if (!enabled) return
    const interval = setInterval(() => {
      void fetchProducts(true)
      void refetchVariants()
    }, 15000)
    return () => clearInterval(interval)
  }, [enabled, role, fetchProducts, refetchVariants])
}
