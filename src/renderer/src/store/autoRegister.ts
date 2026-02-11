import { create } from 'zustand'

export interface RegisterAccount {
  id: string
  email: string
  password: string
  refreshToken: string
  clientId: string
  clientSecret?: string
  status: 'pending' | 'activating' | 'registering' | 'getting_code' | 'success' | 'failed' | 'exists'
  awsName?: string
  ssoToken?: string
  error?: string
}

interface AutoRegisterState {
  // Registration account list
  accounts: RegisterAccount[]
  // Is running
  isRunning: boolean
  // Logs
  logs: string[]
  // Concurrency
  concurrency: number
  // Skip Outlook activation
  skipOutlookActivation: boolean
  // Stop flag
  shouldStop: boolean
  // Delay between registrations (seconds)
  delayBetweenRegistrations: number
}

interface AutoRegisterActions {
  // Add accounts
  addAccounts: (accounts: RegisterAccount[]) => void
  // Clear accounts
  clearAccounts: () => void
  // Update account status
  updateAccountStatus: (id: string, updates: Partial<RegisterAccount>) => void
  // Add log
  addLog: (message: string) => void
  // Clear logs
  clearLogs: () => void
  // Set running state
  setIsRunning: (running: boolean) => void
  // Set concurrency
  setConcurrency: (concurrency: number) => void
  // Set skip Outlook activation
  setSkipOutlookActivation: (skip: boolean) => void
  // Set delay between registrations
  setDelayBetweenRegistrations: (delay: number) => void
  // Request stop
  requestStop: () => void
  // Reset stop flag
  resetStop: () => void
  // Get statistics
  getStats: () => {
    total: number
    pending: number
    running: number
    success: number
    failed: number
    exists: number
  }
}

type AutoRegisterStore = AutoRegisterState & AutoRegisterActions

export const useAutoRegisterStore = create<AutoRegisterStore>()((set, get) => ({
  // Initial state
  accounts: [],
  isRunning: false,
  logs: [],
  concurrency: 1,
  skipOutlookActivation: false,
  shouldStop: false,
  delayBetweenRegistrations: 30,

  // Add accounts
  addAccounts: (newAccounts) => {
    set((state) => ({
      accounts: [...state.accounts, ...newAccounts]
    }))
  },

  // Clear accounts
  clearAccounts: () => {
    if (get().isRunning) return
    set({ accounts: [], logs: [] })
  },

  // Update account status
  updateAccountStatus: (id, updates) => {
    set((state) => ({
      accounts: state.accounts.map(acc =>
        acc.id === id ? { ...acc, ...updates } : acc
      )
    }))
  },

  // Add log
  addLog: (message) => {
    const timestamp = new Date().toLocaleTimeString()
    set((state) => ({
      logs: [...state.logs, `[${timestamp}] ${message}`]
    }))
  },

  // Clear logs
  clearLogs: () => {
    set({ logs: [] })
  },

  // Set running state
  setIsRunning: (running) => {
    set({ isRunning: running })
  },

  // Set concurrency
  setConcurrency: (concurrency) => {
    set({ concurrency: Math.min(10, Math.max(1, concurrency)) })
  },

  // Set skip Outlook activation
  setSkipOutlookActivation: (skip) => {
    set({ skipOutlookActivation: skip })
  },

  // Set delay between registrations
  setDelayBetweenRegistrations: (delay) => {
    set({ delayBetweenRegistrations: Math.max(0, delay) })
  },

  // Request stop
  requestStop: () => {
    set({ shouldStop: true })
  },

  // Reset stop flag
  resetStop: () => {
    set({ shouldStop: false })
  },

  // Get statistics
  getStats: () => {
    const accounts = get().accounts
    return {
      total: accounts.length,
      pending: accounts.filter(a => a.status === 'pending').length,
      running: accounts.filter(a => a.status === 'registering' || a.status === 'activating').length,
      success: accounts.filter(a => a.status === 'success').length,
      failed: accounts.filter(a => a.status === 'failed').length,
      exists: accounts.filter(a => a.status === 'exists').length
    }
  }
}))
