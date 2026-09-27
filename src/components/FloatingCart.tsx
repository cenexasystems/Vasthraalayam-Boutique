import { Link, useLocation } from 'react-router-dom'
import { ShoppingCart, ArrowRight } from 'lucide-react'
import { useCartStore, useAuthStore } from '../store/store'
import { formatCurrency } from '../lib/retail'
import { motion, AnimatePresence } from 'framer-motion'

export default function FloatingCart() {
  const { total, count } = useCartStore()
  const { user } = useAuthStore()
  const location = useLocation()

  const isCartOrCheckout = location.pathname === '/cart' || location.pathname === '/checkout'
  const subtotal = total()
  const itemCount = count()

  return (
    <AnimatePresence>
      {itemCount > 0 && !isCartOrCheckout && (
        <motion.div
          initial={{ y: 72, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 72, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 340, damping: 28 }}
          className="fixed bottom-3 left-1/2 z-50 -translate-x-1/2 pointer-events-none"
        >
          <Link
            to={user ? '/cart' : '/login'}
            className="pointer-events-auto flex items-center gap-2.5 rounded-full border border-white/10 bg-[#1e2f1c]/95 px-4 py-2 text-white shadow-[0_8px_28px_rgba(30,47,28,0.45)] backdrop-blur-xl transition-transform hover:scale-[1.02] active:scale-[0.98] sm:gap-3 sm:px-5 sm:py-2.5"
          >
            {/* Icon + badge */}
            <div className="relative shrink-0">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/12 sm:h-8 sm:w-8">
                <ShoppingCart size={14} className="text-white sm:size-[16px]" />
              </div>
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#7daa8f] text-[9px] font-black text-white">
                {itemCount}
              </span>
            </div>

            {/* Price */}
            <span className="text-sm font-black tracking-tight leading-none sm:text-base">
              {formatCurrency(subtotal)}
            </span>

            {/* Divider */}
            <span className="h-4 w-px bg-white/15" />

            {/* CTA */}
            <span className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-white/70 sm:text-[12px]">
              {user ? 'View Cart' : 'Sign in'}
              <ArrowRight size={12} className="sm:size-[13px]" />
            </span>
          </Link>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
