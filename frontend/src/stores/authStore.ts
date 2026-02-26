import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthState {
  isUnlocked: boolean
  unlock: () => void
  lock: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isUnlocked: false,
      unlock: () => set({ isUnlocked: true }),
      lock: () => set({ isUnlocked: false }),
    }),
    {
      name: 'holz-erp-auth',
    }
  )
)