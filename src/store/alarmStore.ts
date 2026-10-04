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
  hasAcknowledgedForVisit: boolean
  hasTriggeredOnLogin: boolean
  setLowStockItems: (items: LowStockItem[]) => void
  triggerAlarm: (reason: 'login' | 'stock_management') => void
  silenceAlarm: () => void
  resetSilencedState: () => void
}

export const useAlarmStore = create<AlarmState>((set, get) => ({
  lowStockItems: [],
  isAlarmActive: false,
  hasAcknowledgedForVisit: false,
  hasTriggeredOnLogin: false,

  setLowStockItems: (items) => {
    // Only update the items array. Never trigger sounds on data polling/re-renders.
    set({ lowStockItems: items })
    if (items.length === 0) {
      alarmSound.stopAlert()
      set({ isAlarmActive: false })
    }
  },

  triggerAlarm: (reason: 'login' | 'stock_management') => {
    const { lowStockItems, isAlarmActive, hasAcknowledgedForVisit, hasTriggeredOnLogin } = get()

    // 1. Must have at least 1 low-stock item
    if (lowStockItems.length === 0) return

    // 2. Never play two sounds or stack popups if already active
    if (isAlarmActive) return

    // 3. For login: only once per login session, and not if already acknowledged
    if (reason === 'login') {
      if (hasTriggeredOnLogin || hasAcknowledgedForVisit) return
      set({ hasTriggeredOnLogin: true })
    }

    // 4. For stock_management: play again as requested
    if (reason === 'stock_management') {
      set({ hasAcknowledgedForVisit: false })
    }

    // Play alarm sound and activate visual popup
    alarmSound.startAlert()
    set({ isAlarmActive: true })
  },

  silenceAlarm: () => {
    alarmSound.stopAlert()
    set({
      isAlarmActive: false,
      hasAcknowledgedForVisit: true,
    })
  },

  resetSilencedState: () => {
    alarmSound.stopAlert()
    set({
      isAlarmActive: false,
      hasAcknowledgedForVisit: false,
      hasTriggeredOnLogin: false,
    })
  },
}))

