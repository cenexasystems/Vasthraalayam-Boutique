import React, { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  TrendingUp,
  TrendingDown,
  PackagePlus,
  ShoppingCart,
  AlertOctagon,
  Download,
  RefreshCw,
  Search,
  CalendarRange,
} from 'lucide-react'
import {
  inventoryService,
  type InventoryAnalyticsSummary,
  type InventoryMovement,
  type InventoryStockItem,
} from '../../services/inventoryService'

type RangeMode = 'all' | 'today' | 'week' | 'month' | 'custom'

export const InventoryAnalyticsView: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const [range, setRangeState] = useState<RangeMode>(() => {
    const v = searchParams.get('range')
    return v === 'today' || v === 'week' || v === 'month' || v === 'custom' ? v : 'all'
  })
  const [customFrom, setCustomFromState] = useState(() => searchParams.get('from') || '')
  const [customTo, setCustomToState] = useState(() => searchParams.get('to') || '')
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<InventoryAnalyticsSummary>({
    incomingStock: 0,
    unitsSold: 0,
    unitsDamaged: 0,
    unitsReturned: 0,
    netDelta: 0,
    totalMovementsCount: 0,
    movements: [],
  })
  const [filterType, setFilterType] = useState<string>('all')
  const [search, setSearch] = useState('')

  // Keeps the range (and, for Custom Range, the from/to dates) in the URL —
  // the same pattern the outer Dashboard uses for ?tab=inventory — so the
  // filtered view survives a page refresh.
  const updateParams = (next: { range?: RangeMode; from?: string; to?: string }) => {
    const nextRange = next.range ?? range
    const nextFrom = next.from ?? customFrom
    const nextTo = next.to ?? customTo
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev)
      if (nextRange !== 'all') params.set('range', nextRange); else params.delete('range')
      if (nextRange === 'custom' && nextFrom) params.set('from', nextFrom); else params.delete('from')
      if (nextRange === 'custom' && nextTo) params.set('to', nextTo); else params.delete('to')
      return params
    }, { replace: true })
  }

  const setRange = (value: RangeMode) => {
    setRangeState(value)
    updateParams({ range: value })
  }
  const setCustomFrom = (value: string) => {
    setCustomFromState(value)
    updateParams({ range: 'custom', from: value })
  }
  const setCustomTo = (value: string) => {
    setCustomToState(value)
    updateParams({ range: 'custom', to: value })
  }

  const dateError = range === 'custom' && customFrom && customTo && customTo < customFrom
    ? '"To" date cannot be before "From" date.'
    : ''
  // Only apply the custom filter once both dates are set and valid — per
  // spec, a single date entered alone doesn't filter yet.
  const customRangeReady = range === 'custom' ? Boolean(customFrom && customTo && !dateError) : true

  const computeDateRange = () => {
    const now = new Date()
    if (range === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
      return { start, end: undefined }
    }
    if (range === 'week') {
      const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
      return { start, end: undefined }
    }
    if (range === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      return { start, end: undefined }
    }
    if (range === 'custom' && customRangeReady) {
      // Inclusive of the whole "To" day (local time), not just midnight.
      const start = new Date(`${customFrom}T00:00:00`).toISOString()
      const end = new Date(`${customTo}T23:59:59.999`).toISOString()
      return { start, end }
    }
    return { start: undefined, end: undefined }
  }

  const loadAnalytics = useCallback(async () => {
    if (range === 'custom' && !customRangeReady) {
      // Waiting on both dates (or the range is invalid) — don't fetch yet.
      setData({ incomingStock: 0, unitsSold: 0, unitsDamaged: 0, unitsReturned: 0, netDelta: 0, totalMovementsCount: 0, movements: [] })
      return
    }
    setLoading(true)
    try {
      const { start, end } = computeDateRange()
      const res = await inventoryService.fetchInventoryAnalytics(start, end)
      setData(res)
    } catch (err) {
      console.error('Failed to load inventory analytics:', err)
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, customFrom, customTo, customRangeReady])

  useEffect(() => {
    void loadAnalytics()
  }, [loadAnalytics])

  // Filter movements for the table
  const filteredMovements = data.movements.filter((m) => {
    if (filterType !== 'all' && m.movement_type !== filterType) return false
    if (search.trim()) {
      const q = search.toLowerCase().trim()
      const prodName = m.product?.name?.toLowerCase() || ''
      const varName = m.variant?.variant_name?.toLowerCase() || ''
      const barcode = m.barcode_id?.toLowerCase() || ''
      const user = m.created_by_name?.toLowerCase() || ''
      if (!prodName.includes(q) && !varName.includes(q) && !barcode.includes(q) && !user.includes(q)) {
        return false
      }
    }
    return true
  })

  const [exportingSnapshot, setExportingSnapshot] = useState(false)

  const exportSnapshotCsv = async () => {
    setExportingSnapshot(true)
    try {
      const items: InventoryStockItem[] = await inventoryService.fetchInventoryItems()
      if (!items || items.length === 0) return

      const headers = [
        'Product ID',
        'Product Name',
        'Tamil Name',
        'Variant ID',
        'Variant Name (Size)',
        'Category',
        'Barcode',
        'Current Stock (Units)',
        'Purchase Price (INR)',
        'Selling Price (INR)',
        'Total Valuation Cost (INR)',
        'Total Valuation Retail (INR)',
        'Stock Status',
        'Last Updated'
      ]

      const rows = items.map((it: InventoryStockItem) => {
        const costPrice = it.purchase_price ?? 0
        const sellingPrice = it.price ?? 0
        const stock = it.stock ?? 0
        const valCost = Math.round(costPrice * stock * 100) / 100
        const valRetail = Math.round(sellingPrice * stock * 100) / 100
        const status = stock <= 0 ? 'Out of Stock' : stock <= 5 ? 'Low Stock' : 'In Stock'

        return [
          it.product_id,
          `"${(it.name || '').replace(/"/g, '""')}"`,
          `"${(it.name_ta || '').replace(/"/g, '""')}"`,
          it.variant_id || '',
          `"${(it.variant_name || '').replace(/"/g, '""')}"`,
          `"${(it.category || 'General').replace(/"/g, '""')}"`,
          it.barcode || '',
          stock,
          costPrice,
          sellingPrice,
          valCost,
          valRetail,
          status,
          it.updated_at ? new Date(it.updated_at).toLocaleString() : ''
        ]
      })

      const csvContent =
        'data:text/csv;charset=utf-8,\uFEFF' +
        [headers.join(','), ...rows.map((e: (string | number)[]) => e.join(','))].join('\n')

      const encodedUri = encodeURI(csvContent)
      const link = document.createElement('a')
      link.setAttribute('href', encodedUri)
      link.setAttribute('download', `VASTHRAALAYAM_Inventory_Snapshot_${new Date().toISOString().slice(0, 10)}.csv`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (err) {
      console.error('Failed to export inventory snapshot:', err)
    } finally {
      setExportingSnapshot(false)
    }
  }

  const exportCsv = () => {
    if (filteredMovements.length === 0) return
    const headers = [
      'Date & Time',
      'Movement Type',
      'Product Name',
      'Variant',
      'Barcode',
      'Qty Delta',
      'Qty Before',
      'Qty After',
      'Created By',
      'Note',
    ]

    const rows = filteredMovements.map((m) => [
      new Date(m.created_at).toLocaleString(),
      m.movement_type,
      `"${(m.product?.name || 'Unknown').replace(/"/g, '""')}"`,
      `"${(m.variant?.variant_name || '').replace(/"/g, '""')}"`,
      m.barcode_id || '',
      m.quantity_delta,
      m.quantity_before,
      m.quantity_after,
      `"${(m.created_by_name || '').replace(/"/g, '""')}"`,
      `"${(m.note || '').replace(/"/g, '""')}"`,
    ])

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n')

    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    const rangeLabel = range === 'custom' ? `${customFrom}_to_${customTo}` : range
    link.setAttribute('download', `VASTHRAALAYAM_Inventory_Movements_${rangeLabel}_${Date.now()}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const getMovementBadge = (type: InventoryMovement['movement_type']) => {
    switch (type) {
      case 'INITIAL_BARCODE_STOCK':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-50 text-blue-800 border border-blue-200">INTAKE</span>
      case 'RESTOCK':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-800 border border-emerald-200">RESTOCK</span>
      case 'SALE':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-50 text-purple-800 border border-purple-200">SALE</span>
      case 'RETURN':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-50 text-indigo-800 border border-indigo-200">RETURN</span>
      case 'DAMAGE':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-red-50 text-red-800 border border-red-200">DAMAGE</span>
      default:
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-gray-100 text-gray-700">{type}</span>
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Controls & Date Filters */}
      <div className="bg-white border border-[#ead7b7] rounded-2xl p-4 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Date Range Selector Pills */}
        <div className="flex items-center gap-1.5 p-1 bg-[#FBFAF6] border border-gray-200 rounded-xl overflow-x-auto">
          <button
            type="button"
            onClick={() => setRange('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
              range === 'all'
                ? 'bg-brand-black text-brand-onDark shadow-xs'
                : 'text-gray-600 hover:text-black'
            }`}
          >
            All Time
          </button>
          <button
            type="button"
            onClick={() => setRange('today')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
              range === 'today'
                ? 'bg-brand-black text-brand-onDark shadow-xs'
                : 'text-gray-600 hover:text-black'
            }`}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setRange('week')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
              range === 'week'
                ? 'bg-brand-black text-brand-onDark shadow-xs'
                : 'text-gray-600 hover:text-black'
            }`}
          >
            This Week
          </button>
          <button
            type="button"
            onClick={() => setRange('month')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
              range === 'month'
                ? 'bg-brand-black text-brand-onDark shadow-xs'
                : 'text-gray-600 hover:text-black'
            }`}
          >
            This Month
          </button>
          <button
            type="button"
            onClick={() => setRange('custom')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              range === 'custom'
                ? 'bg-brand-black text-brand-onDark shadow-xs'
                : 'text-gray-600 hover:text-black'
            }`}
          >
            <CalendarRange size={13} /> Custom Range
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={loadAnalytics}
            className="w-9 h-9 rounded-xl border border-gray-300 flex items-center justify-center text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer shrink-0"
            title="Refresh"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>

          {/* Export Current Inventory Snapshot CSV */}
          <button
            type="button"
            onClick={exportSnapshotCsv}
            disabled={exportingSnapshot}
            className="px-3.5 py-2 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-black hover:bg-emerald-100 transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-40 whitespace-nowrap"
            title="Export complete current stock snapshot with valuations"
          >
            {exportingSnapshot ? (
              <span className="w-3.5 h-3.5 border-2 border-emerald-800/30 border-t-emerald-800 rounded-full animate-spin inline-block" />
            ) : (
              <Download size={13} className="text-emerald-700" />
            )}
            <span>Export Snapshot CSV</span>
          </button>

          {/* Export Movements Ledger CSV */}
          <button
            type="button"
            onClick={exportCsv}
            disabled={filteredMovements.length === 0}
            className="px-3.5 py-2 rounded-xl bg-brand-black border border-[#7daa8f] text-brand-onDark text-xs font-black hover:bg-[#1e2817] transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-40 whitespace-nowrap"
            title="Export audit movements log"
          >
            <Download size={13} />
            <span>Export Movements CSV</span>
          </button>
        </div>
      </div>

      {/* Custom Range date inputs — revealed only when Custom Range is active */}
      {range === 'custom' && (
        <div className="bg-white border border-[#ead7b7] rounded-2xl p-4 shadow-sm flex flex-col gap-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:max-w-md">
            <div className="flex items-center border border-[#E7E7E7] rounded-xl px-3 py-2 bg-white min-w-0">
              <span className="text-[10px] uppercase font-bold text-[#6B7280] mr-2">From:</span>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="w-full min-w-0 text-[12px] font-semibold text-[#111111] bg-transparent outline-none"
              />
            </div>
            <div className="flex items-center border border-[#E7E7E7] rounded-xl px-3 py-2 bg-white min-w-0">
              <span className="text-[10px] uppercase font-bold text-[#6B7280] mr-2">To:</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="w-full min-w-0 text-[12px] font-semibold text-[#111111] bg-transparent outline-none"
              />
            </div>
          </div>
          {dateError ? (
            <p className="text-[11px] font-bold text-red-600">{dateError}</p>
          ) : !customRangeReady ? (
            <p className="text-[11px] font-semibold text-[#6B7280]">Select both a From and To date to apply the filter.</p>
          ) : null}
        </div>
      )}

      {/* KPI Cards (Exact Stock Math) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {/* Incoming / Restocked Stock */}
        <div className="bg-white border border-[#ead7b7] rounded-2xl p-4 shadow-sm flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center font-black">
            <PackagePlus size={20} />
          </div>
          <div>
            <div className="text-[10px] font-black uppercase tracking-wider text-gray-500">
              Incoming Stock
            </div>
            <div className="text-xl font-black text-emerald-700">
              +{data.incomingStock} Units
            </div>
          </div>
        </div>

        {/* Units Sold */}
        <div className="bg-white border border-[#ead7b7] rounded-2xl p-4 shadow-sm flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-purple-50 text-purple-700 border border-purple-200 flex items-center justify-center font-black">
            <ShoppingCart size={20} />
          </div>
          <div>
            <div className="text-[10px] font-black uppercase tracking-wider text-gray-500">
              Units Sold (POS)
            </div>
            <div className="text-xl font-black text-purple-700">
              {data.unitsSold} Units
            </div>
          </div>
        </div>

        {/* Units Damaged / Lost */}
        <div className="bg-white border border-[#ead7b7] rounded-2xl p-4 shadow-sm flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-red-50 text-red-700 border border-red-200 flex items-center justify-center font-black">
            <AlertOctagon size={20} />
          </div>
          <div>
            <div className="text-[10px] font-black uppercase tracking-wider text-gray-500">
              Lost / Damaged
            </div>
            <div className="text-xl font-black text-red-700">
              {data.unitsDamaged} Units
            </div>
          </div>
        </div>

        {/* Net Movement Delta */}
        <div className="bg-white border border-[#ead7b7] rounded-2xl p-4 shadow-sm flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-brand-black text-brand-onDark flex items-center justify-center font-black">
            {data.netDelta >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
          </div>
          <div>
            <div className="text-[10px] font-black uppercase tracking-wider text-gray-500">
              Net Stock Delta
            </div>
            <div className={`text-xl font-black ${data.netDelta >= 0 ? 'text-black' : 'text-amber-700'}`}>
              {data.netDelta > 0 ? `+${data.netDelta}` : data.netDelta} Units
            </div>
          </div>
        </div>
      </div>

      {/* Movement Ledger Table Section */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm flex flex-col">
        {/* Table Filter Bar */}
        <div className="p-4 border-b border-gray-200 bg-[#FAFAFA] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-black uppercase tracking-wider text-gray-800">
              Movement Audit Ledger ({filteredMovements.length})
            </h4>
          </div>

          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative flex-1 sm:w-56">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search ledger..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-gray-300 bg-white text-xs font-bold text-gray-900 outline-none focus:border-brand-black"
              />
            </div>

            {/* Type Filter */}
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="h-8 px-2.5 rounded-lg border border-gray-300 bg-white text-xs font-bold text-gray-800 outline-none"
            >
              <option value="all">All Types</option>
              <option value="INITIAL_BARCODE_STOCK">Intake</option>
              <option value="RESTOCK">Restock</option>
              <option value="SALE">Sale</option>
              <option value="RETURN">Return</option>
              <option value="DAMAGE">Damage</option>
            </select>
          </div>
        </div>

        {/* Ledger Rows */}
        {filteredMovements.length === 0 ? (
          <div className="p-12 text-center text-gray-400 text-xs font-bold">
            No stock movements recorded for the selected period.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FBFAF6] border-b border-gray-200 text-[10px] font-black uppercase tracking-wider text-gray-600">
                <tr>
                  <th className="p-3">Date &amp; Time</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Product / Variant</th>
                  <th className="p-3 whitespace-nowrap">Barcode</th>
                  <th className="p-3 text-center">Qty Delta</th>
                  <th className="p-3 text-center">Before → After</th>
                  <th className="p-3">User</th>
                  <th className="p-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredMovements.map((m) => (
                  <tr key={m.id} className="hover:bg-[#FBFAF6] transition-colors">
                    <td className="p-3 font-mono text-[11px] text-gray-500 whitespace-nowrap">
                      {new Date(m.created_at).toLocaleString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {getMovementBadge(m.movement_type)}
                    </td>
                    <td className="p-3">
                      <div className="font-bold text-gray-900 truncate max-w-xs">
                        {m.product?.name || `Product #${m.product_id}`}
                      </div>
                      {m.variant?.variant_name && (
                        <div className="text-[10px] font-semibold text-gray-500">
                          Size / Variant: {m.variant.variant_name}
                        </div>
                      )}
                    </td>
                    <td className="p-3 font-mono text-xs font-bold text-gray-700 whitespace-nowrap">
                      {m.barcode_id || '—'}
                    </td>
                    <td className="p-3 text-center font-black">
                      <span
                        className={
                          m.quantity_delta > 0
                            ? 'text-emerald-700'
                            : m.quantity_delta < 0
                            ? 'text-red-600'
                            : 'text-gray-500'
                        }
                      >
                        {m.quantity_delta > 0 ? `+${m.quantity_delta}` : m.quantity_delta}
                      </span>
                    </td>
                    <td className="p-3 text-center font-mono text-xs text-gray-600 whitespace-nowrap">
                      {m.quantity_before} → <strong className="text-black">{m.quantity_after}</strong>
                    </td>
                    <td className="p-3 text-gray-600 font-semibold text-[11px]">
                      {m.created_by_name || 'Admin'}
                    </td>
                    <td className="p-3 text-gray-500 text-[11px] truncate max-w-xs">
                      {m.note || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
