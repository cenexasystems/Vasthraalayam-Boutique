import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useScrollLock } from '../../lib/scrollLock'

export interface ModalProps {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
  /** Maximum width of the modal panel (default: max-w-lg) */
  maxWidth?: string
  /** Custom panel className additions (e.g. background, border) */
  className?: string
  /** Custom overlay className additions */
  overlayClassName?: string
  /** Whether clicking the backdrop closes the modal (default: true) */
  closeOnBackdrop?: boolean
  /** Whether pressing Escape closes the modal (default: true) */
  closeOnEscape?: boolean
  /** Optional aria-label or title */
  ariaLabel?: string
  /** Optional role (default: dialog) */
  role?: string
  /** Z-index override (default: z-[9999]) */
  zIndex?: number | string
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  children,
  maxWidth = 'max-w-lg',
  className = '',
  overlayClassName = '',
  closeOnBackdrop = true,
  closeOnEscape = true,
  ariaLabel,
  role = 'dialog',
  zIndex = 9999,
}) => {
  const panelRef = useRef<HTMLDivElement>(null)

  // Lock body scroll while open
  useScrollLock(isOpen)

  // Close on Escape key press
  useEffect(() => {
    if (!isOpen || !closeOnEscape) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, closeOnEscape, onClose])

  if (!isOpen) return null

  // Ensure rendered through portal at document.body
  return createPortal(
    <div
      role={role}
      aria-modal="true"
      aria-label={ariaLabel}
      style={{
        zIndex: typeof zIndex === 'number' ? zIndex : undefined,
        paddingTop: 'max(16px, env(safe-area-inset-top))',
        paddingRight: 'max(16px, env(safe-area-inset-right))',
        paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
        paddingLeft: 'max(16px, env(safe-area-inset-left))',
      }}
      className={`fixed inset-0 flex items-center justify-center bg-black/70 backdrop-blur-xs overflow-y-auto overscroll-contain animate-in fade-in duration-150 ${overlayClassName}`}
      onClick={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          maxHeight: 'calc(100dvh - 32px)',
        }}
        className={`w-full ${maxWidth} my-auto flex flex-col rounded-3xl bg-white shadow-2xl overflow-hidden border border-[#ead7b7]/60 animate-in zoom-in-95 duration-150 ${className}`}
      >
        {children}
      </div>
    </div>,
    document.body
  )
}

export default Modal
