/**
 * Shared scroll lock helper to ensure body scroll is locked when modals are open,
 * and always unlocked on close, cancel, error, or route change.
 * Uses a reference counter so multiple stacked modals don't prematurely unlock scroll.
 */

let lockCount = 0
let originalOverflow = ''
let originalPaddingRight = ''

export function lockScroll() {
  if (typeof document === 'undefined') return

  if (lockCount === 0) {
    originalOverflow = document.body.style.overflow
    originalPaddingRight = document.body.style.paddingRight

    // Calculate scrollbar width to prevent layout shift on desktop
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`
    }

    document.body.style.overflow = 'hidden'
    document.body.style.touchAction = 'none'
  }
  lockCount++
}

export function unlockScroll() {
  if (typeof document === 'undefined') return

  lockCount = Math.max(0, lockCount - 1)
  if (lockCount === 0) {
    document.body.style.overflow = originalOverflow || ''
    document.body.style.paddingRight = originalPaddingRight || ''
    document.body.style.touchAction = ''
  }
}

/**
 * React hook to lock scroll while component is mounted / condition is true
 */
import { useEffect } from 'react'

export function useScrollLock(active: boolean = true) {
  useEffect(() => {
    if (!active) return

    lockScroll()
    return () => {
      unlockScroll()
    }
  }, [active])
}
