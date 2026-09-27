import './index.css'
import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuthStore, useProductStore, useVariantStore, useAdminAuthStore, useSettingsStore } from './store/store'
import { BRAND_EN } from './lib/brand'
import { clearLocalOrders } from './lib/ordersFallback'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { LowStockAlarmModal } from './components/dashboard/LowStockAlarmModal'
import { useLowStockMonitor } from './hooks/useLowStockMonitor'
import { applyCachedThemeColor } from './lib/theme'

// Paint the last-known theme color immediately, before the settings API call
// resolves (avoids a flash of the default bottle green on load).
applyCachedThemeColor()

function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      return await factory()
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      if (
        errMsg.includes('Failed to fetch dynamically imported module') ||
        errMsg.includes('Importing a module script failed') ||
        errMsg.includes('MIME type') ||
        errMsg.includes('error loading dynamically imported module')
      ) {
        const lastReload = sessionStorage.getItem('chunk_reload_ts')
        const now = Date.now()
        if (!lastReload || now - Number(lastReload) > 10000) {
          sessionStorage.setItem('chunk_reload_ts', String(now))
          window.location.reload()
          return new Promise(() => {}) // Hold suspense while reloading
        }
      }
      throw err
    }
  })
}

const Dashboard = lazyWithRetry(() => import('./pages/Dashboard'))
const Pos = lazyWithRetry(() => import('./pages/Pos'))
const DigitalInvoice = lazyWithRetry(() => import('./pages/DigitalInvoice'))
const Login = lazyWithRetry(() => import('./pages/Login'))
const AdminLogin = lazyWithRetry(() => import('./pages/AdminLogin'))

function LoadingSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bgMain">
      <span className="h-10 w-10 animate-spin rounded-full border-4 border-[#E5E7EB] border-t-[#7daa8f]" />
    </div>
  )
}

function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((state) => state.user)
  const loading = useAuthStore((state) => state.loading)

  if (loading) return <LoadingSpinner />
  return user ? <Navigate to="/dashboard" replace /> : <>{children}</>
}

function AdminGuard({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, role } = useAdminAuthStore()
  const location = useLocation()
  if (!isLoggedIn || (role !== 'admin' && role !== 'staff')) {
    return <Navigate to="/admin-login" state={{ from: location }} replace />
  }
  return <>{children}</>
}

function AdminOnlyGuard({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, role } = useAdminAuthStore()
  const location = useLocation()
  if (!isLoggedIn) {
    return <Navigate to="/admin-login" state={{ from: location }} replace />
  }
  if (role !== 'admin') {
    return <Navigate to="/dashboard" replace />
  }
  return <>{children}</>
}

function PosGuard({ children }: { children: React.ReactNode }) {
  const { isLoggedIn } = useAdminAuthStore()
  const location = useLocation()
  if (!isLoggedIn) {
    return <Navigate to="/admin-login" state={{ from: location }} replace />
  }
  return <>{children}</>
}

function AppShell() {
  const initialize = useAuthStore((state) => state.initialize)
  const fetchProducts = useProductStore((state) => state.fetchProducts)
  const fetchVariants = useVariantStore((state) => state.fetchVariants)
  const { isLoggedIn, role } = useAdminAuthStore()

  const hasStaffOrAdminAccess = Boolean(isLoggedIn && (role === 'admin' || role === 'staff'))
  useLowStockMonitor(hasStaffOrAdminAccess, role)

  useEffect(() => {
    document.title = BRAND_EN
  }, [])

  useEffect(() => {
    void useSettingsStore.getState().fetchSettings()
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured) {
      void initialize()
      return
    }

    clearLocalOrders()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        void initialize()
      }
    })

    void initialize()

    return () => subscription.unsubscribe()
  }, [initialize])

  useEffect(() => {
    void fetchProducts()
    void fetchVariants()

    if (!isSupabaseConfigured) {
      return
    }

    const productChannel = supabase
      .channel('admin-products-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        void fetchProducts()
      })
      .subscribe()

    return () => {
      void supabase.removeChannel(productChannel)
    }
  }, [fetchProducts, fetchVariants])

  return (
    <div className="ios-app-shell w-full max-w-[100vw] bg-bgMain print:block print:h-auto print:overflow-visible">
      <main className="h-full print:block print:h-auto print:min-h-0 print:overflow-visible">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route
            path="/login"
            element={
              <PublicOnlyRoute>
                <Suspense fallback={<LoadingSpinner />}>
                  <Login />
                </Suspense>
              </PublicOnlyRoute>
            }
          />
          <Route
            path="/admin-login"
            element={
              <Suspense fallback={<LoadingSpinner />}>
                <AdminLogin />
              </Suspense>
            }
          />
          {/* Common Admin & Staff Portal Routes */}
          <Route
            element={
              <AdminGuard>
                <Suspense fallback={<LoadingSpinner />}>
                  <Dashboard />
                </Suspense>
              </AdminGuard>
            }
          >
            <Route path="/admin" element={<Dashboard />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/advance-orders" element={<Dashboard />} />
          </Route>

          {/* Admin-Only Dedicated Routes */}
          <Route
            element={
              <AdminOnlyGuard>
                <Suspense fallback={<LoadingSpinner />}>
                  <Dashboard />
                </Suspense>
              </AdminOnlyGuard>
            }
          >
            <Route path="/whatsapp-center" element={<Dashboard />} />
            <Route path="/pos-analytics" element={<Dashboard />} />
            <Route path="/expenses" element={<Dashboard />} />
            <Route path="/dashboard/expenses" element={<Dashboard />} />
          </Route>
          <Route
            path="/pos"
            element={
              <PosGuard>
                <Suspense fallback={<LoadingSpinner />}>
                  <Pos />
                </Suspense>
              </PosGuard>
            }
          />
          <Route
            path="/invoice/:id"
            element={
              <Suspense fallback={<LoadingSpinner />}>
                <DigitalInvoice />
              </Suspense>
            }
          />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>

      {/* Global Low Stock Sound & Visual Alarm for Admin and Staff Panels */}
      {hasStaffOrAdminAccess && <LowStockAlarmModal />}
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  )
}

