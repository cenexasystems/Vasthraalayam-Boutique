import { create } from 'zustand'
import { alarmSound } from '../lib/alarmAudio'

export interface LowStockItem {
  id: string | number
  name: string
  variantName?: string
  stock: number
  alertThreshold: number
  barcode?: string
  category?: string
}

interface AlarmState {
  lowStockItems: LowStockItem[]
  isAlarmActive: boolean
  isAcknowledged: boolean
  setLowStockItems: (items: LowStockItem[]) => void
  triggerLowStockAlert: (force?: boolean) => void
  silenceAlarm: () => void
  clearAcknowledged: () => void
  dismissAlert: () => void
  // Backward compatibility aliases
  triggerAlarm: (reason?: 'login' | 'stock_management') => void
  resetSilencedState: () => void
}

export const useAlarmStore = create<AlarmState>((set, get) => ({
  lowStockItems: [],
  isAlarmActive: false,
  // On fresh app start or reload while logged in, default isAcknowledged to true so reload never fires alert
  isAcknowledged: typeof window !== 'undefined' && sessionStorage.getItem('just_logged_in') !== '1',

  setLowStockItems: (items) => {
    // Only update the items array. Never trigger sounds on data polling/re-renders.
    set({ lowStockItems: items })
    if (items.length === 0) {
      alarmSound.stopAlert()
      set({ isAlarmActive: false })
    }
  },

  triggerLowStockAlert: (force = false) => {
    const { lowStockItems, isAlarmActive, isAcknowledged } = get()

    // 1. Must have at least 1 low-stock item
    if (!lowStockItems || lowStockItems.length === 0) return

    // 2. Never play two sounds or stack popups if already active
    if (isAlarmActive) return

    // 3. Do not re-trigger if already acknowledged for this visit (unless explicitly forced)
    if (!force && isAcknowledged) return

    // Start alarm sound and activate visual popup TOGETHER in the same call
    alarmSound.startAlert()
    set({ isAlarmActive: true, isAcknowledged: false })
  },

  silenceAlarm: () => {
    // Only stops sound and closes popup for this visit; does not block future logins/entries
    alarmSound.stopAlert()
    set({
      isAlarmActive: false,
      isAcknowledged: true,
    })
  },

  clearAcknowledged: () => {
    set({ isAcknowledged: false })
  },

  dismissAlert: () => {
    alarmSound.stopAlert()
    set({
      isAlarmActive: false,
      isAcknowledged: false,
    })
  },

  // Backward compatibility aliases
  triggerAlarm: () => {
    get().triggerLowStockAlert(true)
  },

  resetSilencedState: () => {
    get().dismissAlert()
  },
}))

