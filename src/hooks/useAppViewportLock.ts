import { useEffect } from 'react'

/**
 * Pins the document to the visible viewport while a full-height app shell
 * (POS, admin dashboard) is mounted. Content then scrolls only inside the
 * shell, so Android browsers (Chrome, POCO/MIUI) never scroll the page itself,
 * the address bar stays put, and the bottom footer does not jump.
 */
export function useAppViewportLock(active: boolean = true) {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return
    const root = document.documentElement
    root.classList.add('app-viewport-locked')
    window.scrollTo(0, 0)
    return () => {
      root.classList.remove('app-viewport-locked')
    }
  }, [active])
}
