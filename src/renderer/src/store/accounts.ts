import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import type {
  Account,
  AccountGroup,
  AccountTag,
  AccountFilter,
  AccountSort,
  AccountStatus,
  AccountStats,
  AccountExportData,
  AccountImportItem,
  BatchOperationResult,
  AccountSubscription,
  SubscriptionType,
  IdpType
} from '../types/account'

// ============================================
// Account Management Store
// ============================================

// Auto Token refresh timer
let tokenRefreshTimer: ReturnType<typeof setInterval> | null = null
const TOKEN_REFRESH_BEFORE_EXPIRY = 5 * 60 * 1000 // Refresh 5 minutes before expiry

// Auto-switch timer
let autoSwitchTimer: ReturnType<typeof setInterval> | null = null

// Auto-save timer (prevent data loss)
let autoSaveTimer: ReturnType<typeof setInterval> | null = null
const AUTO_SAVE_INTERVAL = 30 * 1000 // Auto-save every 30 seconds
let lastSaveHash = '' // Used to detect data changes

interface AccountsState {
  // App version
  appVersion: string

  // Data
  accounts: Map<string, Account>
  groups: Map<string, AccountGroup>
  tags: Map<string, AccountTag>

  // Current active account
  activeAccountId: string | null

  // Filter and sort
  filter: AccountFilter
  sort: AccountSort

  // Selected accounts (for batch operations)
  selectedIds: Set<string>

  // Loading state
  isLoading: boolean
  isSyncing: boolean

  // Auto-refresh settings
  autoRefreshEnabled: boolean
  autoRefreshInterval: number // minutes
  autoRefreshConcurrency: number // Auto-refresh concurrency
  statusCheckInterval: number // minutes

  // Privacy mode
  privacyMode: boolean

  // Proxy settings
  proxyEnabled: boolean
  proxyUrl: string // Format: http://host:port or socks5://host:port

  // Auto-switch settings
  autoSwitchEnabled: boolean
  autoSwitchThreshold: number // Balance threshold, auto-switch when below this value
  autoSwitchInterval: number // Check interval (minutes)

  // Kiro path settings
  kiroPath: string // Kiro executable path
  autoLaunchKiro: boolean // Auto-launch Kiro after switching accounts

  // Batch import settings
  batchImportConcurrency: number // Batch import concurrency

  // Kiro server settings
  kiroServerUrl: string // Kiro unlimited refill server address
  kiroServerPassword: string // Server admin password

  // Theme settings
  theme: string // Theme name: default, purple, emerald, orange, rose, cyan, amber
  darkMode: boolean // Dark mode

  // Machine ID management
  machineIdConfig: {
    autoSwitchOnAccountChange: boolean // Auto-change machine ID when switching accounts
    bindMachineIdToAccount: boolean // Bind machine ID to account
    useBindedMachineId: boolean // Use bound machine ID (otherwise generate random)
  }
  currentMachineId: string // Current machine ID
  originalMachineId: string | null // Backed up original machine ID
  originalBackupTime: number | null // Original machine ID backup time
  accountMachineIds: Record<string, string> // Account-bound machine ID mapping
  machineIdHistory: Array<{
    id: string
    machineId: string
    timestamp: number
    action: 'initial' | 'manual' | 'auto_switch' | 'restore' | 'bind'
    accountId?: string
    accountEmail?: string
  }>
}

interface AccountsActions {
  // Account CRUD
  addAccount: (account: Omit<Account, 'id' | 'createdAt' | 'isActive'>) => string
  updateAccount: (id: string, updates: Partial<Account>) => void
  removeAccount: (id: string) => void
  removeAccounts: (ids: string[]) => BatchOperationResult

  // Active account
  setActiveAccount: (id: string | null) => void
  getActiveAccount: () => Account | null

  // Group operations
  addGroup: (group: Omit<AccountGroup, 'id' | 'createdAt' | 'order'>) => string
  updateGroup: (id: string, updates: Partial<AccountGroup>) => void
  removeGroup: (id: string) => void
  moveAccountsToGroup: (accountIds: string[], groupId: string | undefined) => void

  // Tag operations
  addTag: (tag: Omit<AccountTag, 'id'>) => string
  updateTag: (id: string, updates: Partial<AccountTag>) => void
  removeTag: (id: string) => void
  addTagToAccounts: (accountIds: string[], tagId: string) => void
  removeTagFromAccounts: (accountIds: string[], tagId: string) => void

  // Filter and sort
  setFilter: (filter: AccountFilter) => void
  clearFilter: () => void
  setSort: (sort: AccountSort) => void
  getFilteredAccounts: () => Account[]

  // Selection operations
  selectAccount: (id: string) => void
  deselectAccount: (id: string) => void
  selectAll: () => void
  deselectAll: () => void
  toggleSelection: (id: string) => void
  getSelectedAccounts: () => Account[]

  // Import/Export
  exportAccounts: (ids?: string[]) => AccountExportData
  importAccounts: (items: AccountImportItem[]) => BatchOperationResult
  importFromExportData: (data: AccountExportData) => BatchOperationResult
  importSingleAccount: (data: { version: string; account: Account }) => { success: boolean; error?: string }

  // Status management
  updateAccountStatus: (id: string, status: AccountStatus, error?: string) => void
  refreshAccountToken: (id: string) => Promise<boolean>
  batchRefreshTokens: (ids: string[]) => Promise<BatchOperationResult>
  checkAccountStatus: (id: string) => Promise<void>
  batchCheckStatus: (ids: string[]) => Promise<BatchOperationResult>

  // Statistics
  getStats: () => AccountStats

  // Persistence
  loadFromStorage: () => Promise<void>
  saveToStorage: () => Promise<void>

  // Settings
  setAutoRefresh: (enabled: boolean, interval?: number) => void
  setAutoRefreshConcurrency: (concurrency: number) => void
  setStatusCheckInterval: (interval: number) => void

  // Privacy mode
  setPrivacyMode: (enabled: boolean) => void
  maskEmail: (email: string) => string
  maskNickname: (nickname: string | undefined) => string

  // Proxy settings
  setProxy: (enabled: boolean, url?: string) => void

  // Theme settings
  setTheme: (theme: string) => void
  setDarkMode: (enabled: boolean) => void
  applyTheme: () => void

  // Auto-switch
  setAutoSwitch: (enabled: boolean, threshold?: number, interval?: number) => void

  // Kiro path settings
  setKiroPath: (path: string) => void
  setAutoLaunchKiro: (enabled: boolean) => void

  // Batch import concurrency
  setBatchImportConcurrency: (concurrency: number) => void

  // Kiro server settings
  setKiroServer: (url: string, password?: string) => void

  startAutoSwitch: () => void
  stopAutoSwitch: () => void
  checkAndAutoSwitch: () => Promise<void>

  // Auto Token refresh
  startAutoTokenRefresh: () => void
  stopAutoTokenRefresh: () => void
  checkAndRefreshExpiringTokens: () => Promise<void>
  refreshExpiredTokensOnly: () => Promise<void>
  triggerBackgroundRefresh: () => Promise<void>
  handleBackgroundRefreshResult: (data: { id: string; success: boolean; data?: unknown; error?: string }) => void
  handleBackgroundCheckResult: (data: { id: string; success: boolean; data?: unknown; error?: string }) => void

  // Auto-save timer (prevent data loss)
  startAutoSave: () => void
  stopAutoSave: () => void

  // Machine ID management
  setMachineIdConfig: (config: Partial<{
    autoSwitchOnAccountChange: boolean
    bindMachineIdToAccount: boolean
    useBindedMachineId: boolean
  }>) => void
  refreshCurrentMachineId: () => Promise<void>
  changeMachineId: (newMachineId?: string) => Promise<boolean>
  restoreOriginalMachineId: () => Promise<boolean>
  bindMachineIdToAccount: (accountId: string, machineId?: string) => void
  getMachineIdForAccount: (accountId: string) => string | null
  backupOriginalMachineId: () => void
  clearMachineIdHistory: () => void
}

type AccountsStore = AccountsState & AccountsActions

// Default sort
const defaultSort: AccountSort = { field: 'lastUsedAt', order: 'desc' }

// Default filter
const defaultFilter: AccountFilter = {}

export const useAccountsStore = create<AccountsStore>()((set, get) => ({
  // Initial state
  appVersion: '1.0.0',
  accounts: new Map(),
  groups: new Map(),
  tags: new Map(),
  activeAccountId: null,
  filter: defaultFilter,
  sort: defaultSort,
  selectedIds: new Set(),
  isLoading: false,
  isSyncing: false,
  autoRefreshEnabled: true,
  autoRefreshInterval: 5,
  autoRefreshConcurrency: 100,
  statusCheckInterval: 60,
  privacyMode: false,
  proxyEnabled: false,
  proxyUrl: '',
  autoSwitchEnabled: false,
  autoSwitchThreshold: 0,
  autoSwitchInterval: 5,
  kiroPath: '',
  autoLaunchKiro: true,
  batchImportConcurrency: 100,
  kiroServerUrl: '',
  kiroServerPassword: '',
  theme: 'default',
  darkMode: false,

  machineIdConfig: {
    autoSwitchOnAccountChange: false,
    bindMachineIdToAccount: false,
    useBindedMachineId: true
  },
  currentMachineId: '',
  originalMachineId: null,
  originalBackupTime: null,
  accountMachineIds: {},
  machineIdHistory: [],

  // ==================== Account CRUD ====================

  addAccount: (accountData) => {
    const id = uuidv4()
    const now = Date.now()

    const account: Account = {
      ...accountData,
      id,
      createdAt: now,
      lastUsedAt: now,
      isActive: false,
      tags: accountData.tags || []
    }

    set((state) => {
      const accounts = new Map(state.accounts)
      accounts.set(id, account)
      return { accounts }
    })

    get().saveToStorage()
    return id
  },

  updateAccount: (id, updates) => {
    set((state) => {
      const accounts = new Map(state.accounts)
      const account = accounts.get(id)
      if (account) {
        accounts.set(id, { ...account, ...updates })
      }
      return { accounts }
    })
    get().saveToStorage()
  },

  removeAccount: (id) => {
    set((state) => {
      const accounts = new Map(state.accounts)
      accounts.delete(id)

      const selectedIds = new Set(state.selectedIds)
      selectedIds.delete(id)

      const activeAccountId = state.activeAccountId === id ? null : state.activeAccountId

      return { accounts, selectedIds, activeAccountId }
    })
    get().saveToStorage()
  },

  removeAccounts: (ids) => {
    const result: BatchOperationResult = { success: 0, failed: 0, errors: [] }

    set((state) => {
      const accounts = new Map(state.accounts)
      const selectedIds = new Set(state.selectedIds)
      let activeAccountId = state.activeAccountId

      for (const id of ids) {
        if (accounts.has(id)) {
          accounts.delete(id)
          selectedIds.delete(id)
          if (activeAccountId === id) activeAccountId = null
          result.success++
        } else {
          result.failed++
          result.errors.push({ id, error: 'Account not found' })
        }
      }

      return { accounts, selectedIds, activeAccountId }
    })

    get().saveToStorage()
    return result
  },

  // ==================== Active Account ====================

  setActiveAccount: async (id) => {
    const state = get()
    
    set((s) => {
      const accounts = new Map(s.accounts)

      // Cancel previous active status
      if (s.activeAccountId) {
        const prev = accounts.get(s.activeAccountId)
        if (prev) {
          accounts.set(s.activeAccountId, { ...prev, isActive: false })
        }
      }

      // Set new active status
      if (id) {
        const account = accounts.get(id)
        if (account) {
          accounts.set(id, { ...account, isActive: true, lastUsedAt: Date.now() })
        }
      }

      return { accounts, activeAccountId: id }
    })
    
    // Auto-change machine ID when switching accounts (if enabled)
    if (id && state.machineIdConfig.autoSwitchOnAccountChange) {
      try {
        const account = state.accounts.get(id)
        
        if (state.machineIdConfig.bindMachineIdToAccount) {
          // Use account-bound machine ID
          let boundMachineId = state.accountMachineIds[id]
          
          if (!boundMachineId) {
            // If no bound machine ID, generate one for this account
            boundMachineId = await window.api.machineIdGenerateRandom()
            get().bindMachineIdToAccount(id, boundMachineId)
          }
          
          if (state.machineIdConfig.useBindedMachineId) {
            // Use bound machine ID
            await get().changeMachineId(boundMachineId)
          } else {
            // Generate random new machine ID
            await get().changeMachineId()
          }
        } else {
          // Generate random new machine ID each time
          await get().changeMachineId()
        }
        
        // Update history
        const newMachineId = get().currentMachineId
        set((s) => ({
          machineIdHistory: [
            ...s.machineIdHistory,
            {
              id: crypto.randomUUID(),
              machineId: newMachineId,
              timestamp: Date.now(),
              action: 'auto_switch' as const,
              accountId: id,
              accountEmail: account?.email
            }
          ]
        }))
        
        console.log(`[MachineId] Auto-switched machine ID for account: ${account?.email}`)
      } catch (error) {
        console.error('[MachineId] Failed to auto-switch machine ID:', error)
      }
    }
    
    get().saveToStorage()
    
    // Check and launch Kiro after switching accounts
    if (id && state.autoLaunchKiro && state.kiroPath) {
      try {
        const { running } = await window.api.checkKiroRunning()
        if (!running) {
          console.log('[Kiro] Not running, launching...')
          const result = await window.api.launchKiro(state.kiroPath)
          if (result.success) {
            console.log('[Kiro] Launched successfully')
          } else {
            console.error('[Kiro] Launch failed:', result.error)
          }
        } else {
          console.log('[Kiro] Already running')
        }
      } catch (error) {
        console.error('[Kiro] Error checking/launching:', error)
      }
    }
  },

  getActiveAccount: () => {
    const { accounts, activeAccountId } = get()
    return activeAccountId ? accounts.get(activeAccountId) ?? null : null
  },

  // ==================== Group Operations ====================

  addGroup: (groupData) => {
    const id = uuidv4()
    const { groups } = get()

    const group: AccountGroup = {
      ...groupData,
      id,
      order: groups.size,
      createdAt: Date.now()
    }

    set((state) => {
      const groups = new Map(state.groups)
      groups.set(id, group)
      return { groups }
    })

    get().saveToStorage()
    return id
  },

  updateGroup: (id, updates) => {
    set((state) => {
      const groups = new Map(state.groups)
      const group = groups.get(id)
      if (group) {
        groups.set(id, { ...group, ...updates })
      }
      return { groups }
    })
    get().saveToStorage()
  },

  removeGroup: (id) => {
    set((state) => {
      const groups = new Map(state.groups)
      groups.delete(id)

      // Remove account group references
      const accounts = new Map(state.accounts)
      for (const [accountId, account] of accounts) {
        if (account.groupId === id) {
          accounts.set(accountId, { ...account, groupId: undefined })
        }
      }

      return { groups, accounts }
    })
    get().saveToStorage()
  },

  moveAccountsToGroup: (accountIds, groupId) => {
    set((state) => {
      const accounts = new Map(state.accounts)
      for (const id of accountIds) {
        const account = accounts.get(id)
        if (account) {
          accounts.set(id, { ...account, groupId })
        }
      }
      return { accounts }
    })
    get().saveToStorage()
  },

  // ==================== Tag Operations ====================

  addTag: (tagData) => {
    const id = uuidv4()

    const tag: AccountTag = { ...tagData, id }

    set((state) => {
      const tags = new Map(state.tags)
      tags.set(id, tag)
      return { tags }
    })

    get().saveToStorage()
    return id
  },

  updateTag: (id, updates) => {
    set((state) => {
      const tags = new Map(state.tags)
      const tag = tags.get(id)
      if (tag) {
        tags.set(id, { ...tag, ...updates })
      }
      return { tags }
    })
    get().saveToStorage()
  },

  removeTag: (id) => {
    set((state) => {
      const tags = new Map(state.tags)
      tags.delete(id)

      // Remove account tag references
      const accounts = new Map(state.accounts)
      for (const [accountId, account] of accounts) {
        if (account.tags.includes(id)) {
          accounts.set(accountId, {
            ...account,
            tags: account.tags.filter((t) => t !== id)
          })
        }
      }

      return { tags, accounts }
    })
    get().saveToStorage()
  },

  addTagToAccounts: (accountIds, tagId) => {
    set((state) => {
      const accounts = new Map(state.accounts)
      for (const id of accountIds) {
        const account = accounts.get(id)
        if (account && !account.tags.includes(tagId)) {
          accounts.set(id, { ...account, tags: [...account.tags, tagId] })
        }
      }
      return { accounts }
    })
    get().saveToStorage()
  },

  removeTagFromAccounts: (accountIds, tagId) => {
    set((state) => {
      const accounts = new Map(state.accounts)
      for (const id of accountIds) {
        const account = accounts.get(id)
        if (account) {
          accounts.set(id, {
            ...account,
            tags: account.tags.filter((t) => t !== tagId)
          })
        }
      }
      return { accounts }
    })
    get().saveToStorage()
  },

  // ==================== Filter and Sort ====================

  setFilter: (filter) => {
    set({ filter })
  },

  clearFilter: () => {
    set({ filter: defaultFilter })
  },

  setSort: (sort) => {
    set({ sort })
  },

  getFilteredAccounts: () => {
    const { accounts, filter, sort } = get()

    let result = Array.from(accounts.values())

    // Apply filter
    if (filter.search) {
      const search = filter.search.toLowerCase()
      result = result.filter(
        (a) =>
          a.email.toLowerCase().includes(search) ||
          a.nickname?.toLowerCase().includes(search)
      )
    }

    if (filter.subscriptionTypes?.length) {
      result = result.filter((a) => filter.subscriptionTypes!.includes(a.subscription.type))
    }

    if (filter.statuses?.length) {
      result = result.filter((a) => filter.statuses!.includes(a.status))
    }

    if (filter.idps?.length) {
      result = result.filter((a) => filter.idps!.includes(a.idp))
    }

    if (filter.groupIds?.length) {
      result = result.filter((a) => a.groupId && filter.groupIds!.includes(a.groupId))
    }

    if (filter.tagIds?.length) {
      result = result.filter((a) => filter.tagIds!.some((t) => a.tags.includes(t)))
    }

    if (filter.usageMin !== undefined) {
      result = result.filter((a) => a.usage.percentUsed >= filter.usageMin!)
    }

    if (filter.usageMax !== undefined) {
      result = result.filter((a) => a.usage.percentUsed <= filter.usageMax!)
    }

    if (filter.daysRemainingMin !== undefined) {
      result = result.filter(
        (a) => a.subscription.daysRemaining !== undefined &&
               a.subscription.daysRemaining >= filter.daysRemainingMin!
      )
    }

    if (filter.daysRemainingMax !== undefined) {
      result = result.filter(
        (a) => a.subscription.daysRemaining !== undefined &&
               a.subscription.daysRemaining <= filter.daysRemainingMax!
      )
    }

    // Apply sort
    result.sort((a, b) => {
      let cmp = 0

      switch (sort.field) {
        case 'email':
          cmp = a.email.localeCompare(b.email)
          break
        case 'nickname':
          cmp = (a.nickname ?? '').localeCompare(b.nickname ?? '')
          break
        case 'subscription':
          cmp = a.subscription.type.localeCompare(b.subscription.type)
          break
        case 'usage':
          cmp = a.usage.percentUsed - b.usage.percentUsed
          break
        case 'daysRemaining':
          cmp = (a.subscription.daysRemaining ?? 999) - (b.subscription.daysRemaining ?? 999)
          break
        case 'lastUsedAt':
          cmp = a.lastUsedAt - b.lastUsedAt
          break
        case 'createdAt':
          cmp = a.createdAt - b.createdAt
          break
        case 'status':
          cmp = a.status.localeCompare(b.status)
          break
      }

      return sort.order === 'desc' ? -cmp : cmp
    })

    return result
  },

  // ==================== Selection Operations ====================

  selectAccount: (id) => {
    set((state) => {
      const selectedIds = new Set(state.selectedIds)
      selectedIds.add(id)
      return { selectedIds }
    })
  },

  deselectAccount: (id) => {
    set((state) => {
      const selectedIds = new Set(state.selectedIds)
      selectedIds.delete(id)
      return { selectedIds }
    })
  },

  selectAll: () => {
    const filtered = get().getFilteredAccounts()
    set({ selectedIds: new Set(filtered.map((a) => a.id)) })
  },

  deselectAll: () => {
    set({ selectedIds: new Set() })
  },

  toggleSelection: (id) => {
    set((state) => {
      const selectedIds = new Set(state.selectedIds)
      if (selectedIds.has(id)) {
        selectedIds.delete(id)
      } else {
        selectedIds.add(id)
      }
      return { selectedIds }
    })
  },

  getSelectedAccounts: () => {
    const { accounts, selectedIds } = get()
    return Array.from(selectedIds)
      .map((id) => accounts.get(id))
      .filter((a): a is Account => a !== undefined)
  },

  // ==================== Import/Export ====================

  exportAccounts: (ids) => {
    const { accounts, groups, tags } = get()

    let exportAccounts: Account[]
    if (ids?.length) {
      exportAccounts = ids
        .map((id) => accounts.get(id))
        .filter((a): a is Account => a !== undefined)
    } else {
      exportAccounts = Array.from(accounts.values())
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const data: AccountExportData = {
      version: get().appVersion,
      exportedAt: Date.now(),
      accounts: exportAccounts.map(({ isActive, ...rest }) => rest),
      groups: Array.from(groups.values()),
      tags: Array.from(tags.values())
    }

    return data
  },

  importAccounts: (items) => {
    const result: BatchOperationResult = { success: 0, failed: 0, errors: [] }

    // Validate idp
    const validIdps = ['Google', 'Github', 'BuilderId'] as const
    const normalizeIdp = (idp?: string): IdpType => {
      if (!idp) return 'Google'
      const normalized = validIdps.find(v => v.toLowerCase() === idp.toLowerCase())
      return normalized || 'Google'
    }

    for (const item of items) {
      try {
        const now = Date.now()

        const account: Omit<Account, 'id' | 'createdAt' | 'isActive'> = {
          email: item.email,
          nickname: item.nickname,
          idp: normalizeIdp(item.idp as string),
          credentials: {
            accessToken: item.accessToken || '',
            csrfToken: item.csrfToken || '',
            refreshToken: item.refreshToken,
            clientId: item.clientId,
            clientSecret: item.clientSecret,
            region: item.region || 'us-east-1',
            expiresAt: now + 3600 * 1000
          },
          subscription: {
            type: 'Free'
          },
          usage: {
            current: 0,
            limit: 25,
            percentUsed: 0,
            lastUpdated: now
          },
          groupId: item.groupId,
          tags: item.tags ?? [],
          status: 'unknown',
          lastUsedAt: now
        }

        get().addAccount(account)
        result.success++
      } catch (error) {
        result.failed++
        result.errors.push({
          id: item.email,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    return result
  },

  importFromExportData: (data) => {
    const result: BatchOperationResult = { success: 0, failed: 0, errors: [] }
    const { accounts: existingAccounts } = get()
    
    // Check if account exists (by email or userId)
    const isAccountExists = (email: string, userId?: string): boolean => {
      return Array.from(existingAccounts.values()).some(
        acc => acc.email === email || (userId && acc.userId === userId)
      )
    }
    
    // Deduplicate: internal file deduplication
    const seenEmails = new Set<string>()
    const seenUserIds = new Set<string>()
    const uniqueAccounts = data.accounts.filter(acc => {
      if (seenEmails.has(acc.email) || (acc.userId && seenUserIds.has(acc.userId))) {
        return false
      }
      seenEmails.add(acc.email)
      if (acc.userId) seenUserIds.add(acc.userId)
      return true
    })

    // Import groups
    for (const group of data.groups) {
      set((state) => {
        const groups = new Map(state.groups)
        groups.set(group.id, group)
        return { groups }
      })
    }

    // Import tags
    for (const tag of data.tags) {
      set((state) => {
        const tags = new Map(state.tags)
        tags.set(tag.id, tag)
        return { tags }
      })
    }

    // Import accounts (skip existing ones)
    let skipped = 0
    for (const accountData of uniqueAccounts) {
      // Check if exists locally
      if (isAccountExists(accountData.email, accountData.userId)) {
        skipped++
        continue
      }
      
      try {
        set((state) => {
          const accounts = new Map(state.accounts)
          accounts.set(accountData.id, { ...accountData, isActive: false })
          return { accounts }
        })
        result.success++
      } catch (error) {
        result.failed++
        result.errors.push({
          id: accountData.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }
    
    // Record skipped count
    if (skipped > 0) {
      result.errors.push({
        id: 'skipped',
        error: `Skipped ${skipped} existing accounts`
      })
    }

    get().saveToStorage()
    return result
  },

  // Import single account JSON
  importSingleAccount: (data) => {
    const { accounts: existingAccounts } = get()
    const account = data.account
    
    // Check if account exists
    const exists = Array.from(existingAccounts.values()).some(
      acc => acc.email === account.email || (account.userId && acc.userId === account.userId)
    )
    
    if (exists) {
      return { success: false, error: 'Account already exists' }
    }
    
    try {
      set((state) => {
        const accounts = new Map(state.accounts)
        accounts.set(account.id, { ...account, isActive: false })
        return { accounts }
      })
      get().saveToStorage()
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Import failed' }
    }
  },

  // ==================== Status Management ====================

  updateAccountStatus: (id, status, error) => {
    set((state) => {
      const accounts = new Map(state.accounts)
      const account = accounts.get(id)
      if (account) {
        accounts.set(id, {
          ...account,
          status,
          lastError: error,
          lastCheckedAt: Date.now()
        })
      }
      return { accounts }
    })
    get().saveToStorage()
  },

  refreshAccountToken: async (id) => {
    const { accounts, updateAccountStatus } = get()
    const account = accounts.get(id)

    if (!account) return false

    updateAccountStatus(id, 'refreshing')

    try {
      // Call Kiro API via main process to refresh token (avoid CORS)
      const result = await window.api.refreshAccountToken(account)

      if (result.success && result.data) {
        set((state) => {
          const accounts = new Map(state.accounts)
          const acc = accounts.get(id)
          if (acc) {
            accounts.set(id, {
              ...acc,
              credentials: {
                ...acc.credentials,
                accessToken: result.data!.accessToken,
                // If new refreshToken returned, update it
                refreshToken: result.data!.refreshToken || acc.credentials.refreshToken,
                expiresAt: Date.now() + result.data!.expiresIn * 1000
              },
              status: 'active',
              lastError: undefined,
              lastCheckedAt: Date.now()
            })
          }
          return { accounts }
        })
        get().saveToStorage()
        return true
      } else {
        updateAccountStatus(id, 'error', result.error?.message)
        return false
      }
    } catch (error) {
      updateAccountStatus(id, 'error', error instanceof Error ? error.message : 'Unknown error')
      return false
    }
  },

  batchRefreshTokens: async (ids) => {
    const { accounts, autoRefreshConcurrency } = get()
    
    // Collect accounts to refresh
    const accountsToRefresh: Array<{
      id: string
      email: string
      credentials: {
        refreshToken: string
        clientId?: string
        clientSecret?: string
        region?: string
        authMethod?: string
        accessToken?: string
      }
    }> = []

    for (const id of ids) {
      const account = accounts.get(id)
      if (!account?.credentials.refreshToken) continue
      
      accountsToRefresh.push({
        id,
        email: account.email,
        credentials: {
          refreshToken: account.credentials.refreshToken,
          clientId: account.credentials.clientId,
          clientSecret: account.credentials.clientSecret,
          region: account.credentials.region,
          authMethod: account.credentials.authMethod,
          accessToken: account.credentials.accessToken
        }
      })
    }

    if (accountsToRefresh.length === 0) {
      return { success: 0, failed: 0, errors: [] }
    }

    console.log(`[BatchRefresh] Triggering background refresh for ${accountsToRefresh.length} accounts...`)
    
    // Use background refresh API (doesn't block UI)
    const result = await window.api.backgroundBatchRefresh(accountsToRefresh, autoRefreshConcurrency)
    
    return { 
      success: result.successCount, 
      failed: result.failedCount, 
      errors: [] 
    }
  },

  checkAccountStatus: async (id) => {
    const { accounts, updateAccountStatus } = get()
    const account = accounts.get(id)

    if (!account) return

    try {
      // Call Kiro API via main process to get status (avoid CORS)
      const result = await window.api.checkAccountStatus(account)

      if (result.success && result.data) {
        set((state) => {
          const accounts = new Map(state.accounts)
          const acc = accounts.get(id)
          if (acc) {
            // If token was refreshed, update credentials
            const updatedCredentials = result.data!.newCredentials 
              ? {
                  ...acc.credentials,
                  accessToken: result.data!.newCredentials.accessToken,
                  refreshToken: result.data!.newCredentials.refreshToken ?? acc.credentials.refreshToken,
                  expiresAt: result.data!.newCredentials.expiresAt ?? acc.credentials.expiresAt
                }
              : acc.credentials

            // Merge usage data, ensure all required fields are included
            const apiUsage = result.data!.usage
            const mergedUsage = apiUsage ? {
              current: apiUsage.current ?? acc.usage.current,
              limit: apiUsage.limit ?? acc.usage.limit,
              percentUsed: apiUsage.limit > 0 ? apiUsage.current / apiUsage.limit : 0,
              lastUpdated: apiUsage.lastUpdated ?? Date.now(),
              baseLimit: apiUsage.baseLimit,
              baseCurrent: apiUsage.baseCurrent,
              freeTrialLimit: apiUsage.freeTrialLimit,
              freeTrialCurrent: apiUsage.freeTrialCurrent,
              freeTrialExpiry: apiUsage.freeTrialExpiry,
              bonuses: apiUsage.bonuses,
              nextResetDate: apiUsage.nextResetDate,
              resourceDetail: apiUsage.resourceDetail
            } : acc.usage

            // Merge subscription info
            const apiSub = result.data!.subscription
            const mergedSubscription = apiSub ? {
              ...acc.subscription,
              ...apiSub
            } : acc.subscription

            // Convert IDP type
            const apiIdp = result.data!.idp
            let idpType = acc.idp
            if (apiIdp) {
              if (apiIdp === 'BuilderId') idpType = 'BuilderId'
              else if (apiIdp === 'Google') idpType = 'Google'
              else if (apiIdp === 'Github') idpType = 'Github'
              else if (apiIdp === 'AWSIdC') idpType = 'AWSIdC'
              else idpType = 'Internal'
            }

            accounts.set(id, {
              ...acc,
              // Update email (if API returned it)
              email: result.data!.email ?? acc.email,
              userId: result.data!.userId ?? acc.userId,
              idp: idpType,
              status: result.data!.status as AccountStatus,
              usage: mergedUsage,
              subscription: mergedSubscription as AccountSubscription,
              credentials: updatedCredentials,
              lastCheckedAt: Date.now(),
              lastError: undefined
            })
          }
          return { accounts }
        })
        get().saveToStorage()
        
        // If token was refreshed, log it
        if (result.data.newCredentials) {
          console.log(`[Account] Token refreshed for ${account?.email}`)
        }
      } else {
        updateAccountStatus(id, 'error', result.error?.message)
      }
    } catch (error) {
      updateAccountStatus(id, 'error', error instanceof Error ? error.message : 'Unknown error')
    }
  },

  batchCheckStatus: async (ids) => {
    const { accounts, autoRefreshConcurrency } = get()
    
    // Collect accounts to check (use batch check API, don't refresh token)
    const accountsToCheck: Array<{
      id: string
      email: string
      credentials: {
        accessToken: string
        refreshToken?: string
        clientId?: string
        clientSecret?: string
        region?: string
        authMethod?: string
        provider?: string
      }
      idp?: string
    }> = []

    for (const id of ids) {
      const account = accounts.get(id)
      if (!account?.credentials.accessToken) continue
      
      accountsToCheck.push({
        id,
        email: account.email,
        credentials: {
          accessToken: account.credentials.accessToken,
          refreshToken: account.credentials.refreshToken,
          clientId: account.credentials.clientId,
          clientSecret: account.credentials.clientSecret,
          region: account.credentials.region,
          authMethod: account.credentials.authMethod,
          provider: account.credentials.provider
        },
        idp: account.idp
      })
    }

    if (accountsToCheck.length === 0) {
      return { success: 0, failed: 0, errors: [] }
    }

    console.log(`[BatchCheck] Triggering background check for ${accountsToCheck.length} accounts...`)
    
    // Use background check API (only check status, don't refresh token)
    const result = await window.api.backgroundBatchCheck(accountsToCheck, autoRefreshConcurrency)
    
    return { 
      success: result.successCount, 
      failed: result.failedCount, 
      errors: [] 
    }
  },

  // ==================== Statistics ====================

  getStats: () => {
    const { accounts } = get()
    const accountList = Array.from(accounts.values())

    const stats: AccountStats = {
      total: accountList.length,
      byStatus: {
        active: 0,
        expired: 0,
        error: 0,
        refreshing: 0,
        unknown: 0
      },
      bySubscription: {
        Free: 0,
        Pro: 0,
        Pro_Plus: 0,
        Enterprise: 0,
        Teams: 0
      },
      byIdp: {
        Google: 0,
        Github: 0,
        BuilderId: 0,
        AWSIdC: 0,
        Internal: 0
      },
      activeCount: 0,
      expiringSoonCount: 0
    }

    for (const account of accountList) {
      stats.byStatus[account.status]++
      stats.bySubscription[account.subscription.type]++
      stats.byIdp[account.idp]++

      if (account.isActive) stats.activeCount++
      if (account.subscription.daysRemaining !== undefined &&
          account.subscription.daysRemaining <= 7) {
        stats.expiringSoonCount++
      }
    }

    return stats
  },

  // ==================== Persistence ====================

  loadFromStorage: async () => {
    set({ isLoading: true })

    try {
      // Get app version
      const appVersion = await window.api.getAppVersion()
      set({ appVersion })

      const data = await window.api.loadAccounts()

      if (data) {
        const accounts = new Map(Object.entries(data.accounts ?? {}) as [string, Account][])
        let activeAccountId = data.activeAccountId ?? null

        // Fix: Ensure only one account has isActive = true
        // First set all accounts' isActive to false
        for (const [id, account] of accounts) {
          accounts.set(id, { ...account, isActive: false })
        }

        // Sync account status from local SSO cache
        try {
          const localResult = await window.api.getLocalActiveAccount()
          if (localResult.success && localResult.data?.refreshToken) {
            const localRefreshToken = localResult.data.refreshToken
            // Find matching account
            let foundAccountId: string | null = null
            for (const [id, account] of accounts) {
              if (account.credentials.refreshToken === localRefreshToken) {
                foundAccountId = id
                break
              }
            }
            // If matching account found, set as current
            if (foundAccountId) {
              activeAccountId = foundAccountId
              const account = accounts.get(foundAccountId)
              if (account) {
                accounts.set(foundAccountId, { ...account, isActive: true })
              }
              console.log('[Store] Synced active account from local SSO cache:', foundAccountId)
            } else {
              // If no matching account found, auto-import
              console.log('[Store] Local account not found in app, importing...')
              const importResult = await window.api.loadKiroCredentials()
              if (importResult.success && importResult.data) {
                // Verify and get account info
                const verifyResult = await window.api.verifyAccountCredentials({
                  refreshToken: importResult.data.refreshToken,
                  clientId: importResult.data.clientId || '',
                  clientSecret: importResult.data.clientSecret || '',
                  region: importResult.data.region,
                  authMethod: importResult.data.authMethod,
                  provider: importResult.data.provider
                })
                if (verifyResult.success && verifyResult.data) {
                  const now = Date.now()
                  const newId = `${verifyResult.data.email}-${now}`
                  const newAccount: Account = {
                    id: newId,
                    email: verifyResult.data.email,
                    userId: verifyResult.data.userId,
                    nickname: verifyResult.data.email ? verifyResult.data.email.split('@')[0] : undefined,
                    idp: (importResult.data.provider || 'BuilderId') as 'BuilderId' | 'Google' | 'Github',
                    credentials: {
                      accessToken: verifyResult.data.accessToken,
                      csrfToken: '',
                      refreshToken: verifyResult.data.refreshToken,
                      clientId: importResult.data.clientId || '',
                      clientSecret: importResult.data.clientSecret || '',
                      region: importResult.data.region || 'us-east-1',
                      expiresAt: verifyResult.data.expiresIn ? now + verifyResult.data.expiresIn * 1000 : now + 3600 * 1000,
                      authMethod: importResult.data.authMethod as 'IdC' | 'social',
                      provider: (importResult.data.provider || 'BuilderId') as 'BuilderId' | 'Github' | 'Google'
                    },
                    subscription: {
                      type: verifyResult.data.subscriptionType as SubscriptionType,
                      title: verifyResult.data.subscriptionTitle,
                      rawType: verifyResult.data.subscription?.rawType,
                      daysRemaining: verifyResult.data.daysRemaining,
                      expiresAt: verifyResult.data.expiresAt,
                      managementTarget: verifyResult.data.subscription?.managementTarget,
                      upgradeCapability: verifyResult.data.subscription?.upgradeCapability,
                      overageCapability: verifyResult.data.subscription?.overageCapability
                    },
                    usage: {
                      current: verifyResult.data.usage.current,
                      limit: verifyResult.data.usage.limit,
                      percentUsed: verifyResult.data.usage.limit > 0 
                        ? verifyResult.data.usage.current / verifyResult.data.usage.limit 
                        : 0,
                      lastUpdated: now,
                      baseLimit: verifyResult.data.usage.baseLimit,
                      baseCurrent: verifyResult.data.usage.baseCurrent,
                      freeTrialLimit: verifyResult.data.usage.freeTrialLimit,
                      freeTrialCurrent: verifyResult.data.usage.freeTrialCurrent,
                      freeTrialExpiry: verifyResult.data.usage.freeTrialExpiry,
                      bonuses: verifyResult.data.usage.bonuses,
                      nextResetDate: verifyResult.data.usage.nextResetDate,
                      resourceDetail: verifyResult.data.usage.resourceDetail
                    },
                    status: 'active',
                    createdAt: now,
                    lastUsedAt: now,
                    tags: [],
                    isActive: true
                  }
                  accounts.set(newId, newAccount)
                  activeAccountId = newId
                  console.log('[Store] Auto-imported account from local SSO cache:', verifyResult.data.email)
                }
              }
            }
          } else if (activeAccountId) {
            // If no local active account but storage has activeAccountId, set that account as active
            const account = accounts.get(activeAccountId)
            if (account) {
              accounts.set(activeAccountId, { ...account, isActive: true })
            }
          }
        } catch (e) {
          console.warn('[Store] Failed to sync local active account:', e)
          // If sync failed, use activeAccountId from storage
          if (activeAccountId) {
            const account = accounts.get(activeAccountId)
            if (account) {
              accounts.set(activeAccountId, { ...account, isActive: true })
            }
          }
        }

        set({
          accounts,
          groups: new Map(Object.entries(data.groups ?? {}) as [string, AccountGroup][]),
          tags: new Map(Object.entries(data.tags ?? {}) as [string, AccountTag][]),
          activeAccountId,
          autoRefreshEnabled: data.autoRefreshEnabled ?? true,
          autoRefreshInterval: data.autoRefreshInterval ?? 5,
          autoRefreshConcurrency: data.autoRefreshConcurrency ?? 100,
          statusCheckInterval: data.statusCheckInterval ?? 60,
          privacyMode: data.privacyMode ?? false,
          proxyEnabled: data.proxyEnabled ?? false,
          proxyUrl: data.proxyUrl ?? '',
          autoSwitchEnabled: data.autoSwitchEnabled ?? false,
          autoSwitchThreshold: data.autoSwitchThreshold ?? 0,
          autoSwitchInterval: data.autoSwitchInterval ?? 5,
          kiroPath: data.kiroPath ?? '',
          autoLaunchKiro: data.autoLaunchKiro ?? true,
          kiroServerUrl: data.kiroServerUrl ?? '',
          kiroServerPassword: data.kiroServerPassword ?? '',
          theme: data.theme ?? 'default',
          darkMode: data.darkMode ?? false,
          machineIdConfig: data.machineIdConfig ?? {
            autoSwitchOnAccountChange: false,
            bindMachineIdToAccount: false,
            useBindedMachineId: true
          },
          accountMachineIds: data.accountMachineIds ?? {},
          machineIdHistory: data.machineIdHistory ?? []
        })

        // Apply theme
        get().applyTheme()

        // If proxy is enabled, notify main process
        if (data.proxyEnabled && data.proxyUrl) {
          window.api.setProxy?.(true, data.proxyUrl)
        }

        // If auto-switch is enabled, start timer
        if (data.autoSwitchEnabled) {
          get().startAutoSwitch()
        }

        // Start auto-save timer (prevent data loss)
        get().startAutoSave()
      }
    } catch (error) {
      console.error('Failed to load accounts:', error)
    } finally {
      set({ isLoading: false })
    }
  },

  saveToStorage: async () => {
    const {
      accounts,
      groups,
      tags,
      activeAccountId,
      autoRefreshEnabled,
      autoRefreshInterval,
      autoRefreshConcurrency,
      statusCheckInterval,
      privacyMode,
      proxyEnabled,
      proxyUrl,
      autoSwitchEnabled,
      autoSwitchThreshold,
      autoSwitchInterval,
      kiroPath,
      autoLaunchKiro,
      kiroServerUrl,
      kiroServerPassword,
      theme,
      darkMode,
      machineIdConfig,
      accountMachineIds,
      machineIdHistory
    } = get()

    set({ isSyncing: true })

    try {
      await window.api.saveAccounts({
        accounts: Object.fromEntries(accounts),
        groups: Object.fromEntries(groups),
        tags: Object.fromEntries(tags),
        activeAccountId,
        autoRefreshEnabled,
        autoRefreshInterval,
        autoRefreshConcurrency,
        statusCheckInterval,
        privacyMode,
        proxyEnabled,
        proxyUrl,
        autoSwitchEnabled,
        autoSwitchThreshold,
        autoSwitchInterval,
        kiroPath,
        autoLaunchKiro,
        kiroServerUrl,
        kiroServerPassword,
        theme,
        darkMode,
        machineIdConfig,
        accountMachineIds,
        machineIdHistory
      })
    } catch (error) {
      console.error('Failed to save accounts:', error)
    } finally {
      set({ isSyncing: false })
    }
  },

  // ==================== Settings ====================

  setAutoRefresh: (enabled, interval) => {
    set({
      autoRefreshEnabled: enabled,
      autoRefreshInterval: interval ?? get().autoRefreshInterval
    })
    get().saveToStorage()
    
    // Restart timer
    if (enabled) {
      get().startAutoTokenRefresh()
    } else {
      get().stopAutoTokenRefresh()
    }
  },

  setAutoRefreshConcurrency: (concurrency) => {
    set({ autoRefreshConcurrency: Math.max(1, Math.min(500, concurrency)) })
    get().saveToStorage()
  },

  setStatusCheckInterval: (interval) => {
    set({ statusCheckInterval: interval })
    get().saveToStorage()
  },

  // ==================== Privacy Mode ====================

  setPrivacyMode: (enabled) => {
    set({ privacyMode: enabled })
    get().saveToStorage()
  },

  maskEmail: (email) => {
    if (!get().privacyMode || !email) return email
    // Generate fixed-length random string as masked email
    const hash = email.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    const maskedName = `user${(hash % 100000).toString().padStart(5, '0')}`
    return `${maskedName}@***.com`
  },

  maskNickname: (nickname) => {
    if (!get().privacyMode || !nickname) return nickname || ''
    // Generate fixed masked nickname based on original
    const hash = nickname.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    return `User${(hash % 100000).toString().padStart(5, '0')}`
  },

  // ==================== Proxy Settings ====================

  setProxy: (enabled, url) => {
    set({ 
      proxyEnabled: enabled,
      proxyUrl: url ?? get().proxyUrl
    })
    get().saveToStorage()
    // Notify main process to update proxy settings
    window.api.setProxy?.(enabled, url ?? get().proxyUrl)
  },

  // ==================== Theme Settings ====================

  setTheme: (theme) => {
    set({ theme })
    get().saveToStorage()
    get().applyTheme()
  },

  setDarkMode: (enabled) => {
    set({ darkMode: enabled })
    get().saveToStorage()
    get().applyTheme()
  },

  applyTheme: () => {
    const { theme, darkMode } = get()
    const root = document.documentElement
    
    // Remove all theme classes (includes all 21 themes)
    root.classList.remove(
      'dark', 
      // Blue series
      'theme-indigo', 'theme-cyan', 'theme-sky', 'theme-teal',
      // Purple-red series
      'theme-purple', 'theme-violet', 'theme-fuchsia', 'theme-pink', 'theme-rose',
      // Warm series
      'theme-red', 'theme-orange', 'theme-amber', 'theme-yellow',
      // Green series
      'theme-emerald', 'theme-green', 'theme-lime',
      // Neutral series
      'theme-slate', 'theme-zinc', 'theme-stone', 'theme-neutral'
    )
    
    // Apply dark mode
    if (darkMode) {
      root.classList.add('dark')
    }
    
    // Apply theme color
    if (theme !== 'default') {
      root.classList.add(`theme-${theme}`)
    }
  },

  // ==================== Kiro Path Settings ====================

  setKiroPath: (path) => {
    set({ kiroPath: path })
    get().saveToStorage()
  },

  setAutoLaunchKiro: (enabled) => {
    set({ autoLaunchKiro: enabled })
    get().saveToStorage()
  },

  // ==================== Auto-Switch ====================

  setAutoSwitch: (enabled, threshold, interval) => {
    set({
      autoSwitchEnabled: enabled,
      autoSwitchThreshold: threshold ?? get().autoSwitchThreshold,
      autoSwitchInterval: interval ?? get().autoSwitchInterval
    })
    get().saveToStorage()
    
    // Restart timer
    if (enabled) {
      get().startAutoSwitch()
    } else {
      get().stopAutoSwitch()
    }
  },

  setBatchImportConcurrency: (concurrency) => {
    set({ batchImportConcurrency: Math.max(1, Math.min(500, concurrency)) })
    get().saveToStorage()
  },

  setKiroServer: (url, password) => {
    set({ 
      kiroServerUrl: url,
      kiroServerPassword: password ?? get().kiroServerPassword
    })
    get().saveToStorage()
  },

  startAutoSwitch: () => {
    const { autoSwitchEnabled, autoSwitchInterval, checkAndAutoSwitch } = get()
    
    if (!autoSwitchEnabled) return
    
    // Clear existing timer
    if (autoSwitchTimer) {
      clearInterval(autoSwitchTimer)
    }
    
    // Check immediately
    checkAndAutoSwitch()
    
    // Set periodic check
    autoSwitchTimer = setInterval(() => {
      checkAndAutoSwitch()
    }, autoSwitchInterval * 60 * 1000)
    
    console.log(`[AutoSwitch] Started with interval: ${autoSwitchInterval} minutes`)
  },

  stopAutoSwitch: () => {
    if (autoSwitchTimer) {
      clearInterval(autoSwitchTimer)
      autoSwitchTimer = null
      console.log('[AutoSwitch] Stopped')
    }
  },

  checkAndAutoSwitch: async () => {
    const { accounts, autoSwitchThreshold, checkAccountStatus, setActiveAccount } = get()
    const activeAccount = get().getActiveAccount()
    
    if (!activeAccount) {
      console.log('[AutoSwitch] No active account')
      return
    }

    console.log(`[AutoSwitch] Checking active account: ${activeAccount.email}`)

    // Refresh current account status to get latest balance
    await checkAccountStatus(activeAccount.id)
    
    // Re-get updated account info
    const updatedAccount = get().accounts.get(activeAccount.id)
    if (!updatedAccount) return

    const remaining = updatedAccount.usage.limit - updatedAccount.usage.current
    console.log(`[AutoSwitch] Remaining: ${remaining}, Threshold: ${autoSwitchThreshold}`)

    // Check if switch is needed
    if (remaining <= autoSwitchThreshold) {
      console.log(`[AutoSwitch] Account ${updatedAccount.email} reached threshold, switching...`)
      
      // Find available account
      const availableAccount = Array.from(accounts.values()).find(acc => {
        // Exclude current account
        if (acc.id === activeAccount.id) return false
        // Exclude banned accounts
        if (acc.lastError?.includes('UnauthorizedException') || 
            acc.lastError?.includes('AccountSuspendedException')) return false
        // Exclude accounts with insufficient balance
        const accRemaining = acc.usage.limit - acc.usage.current
        if (accRemaining <= autoSwitchThreshold) return false
        return true
      })

      if (availableAccount) {
        console.log(`[AutoSwitch] Switching to: ${availableAccount.email}`)
        setActiveAccount(availableAccount.id)
        // Notify main process to switch account
        await window.api.switchAccount({
          accessToken: availableAccount.credentials.accessToken || '',
          refreshToken: availableAccount.credentials.refreshToken || '',
          clientId: availableAccount.credentials.clientId || '',
          clientSecret: availableAccount.credentials.clientSecret || '',
          region: availableAccount.credentials.region || 'us-east-1',
          authMethod: availableAccount.credentials.authMethod,
          provider: availableAccount.credentials.provider
        })
      } else {
        console.log('[AutoSwitch] No available account to switch to')
      }
    }
  },

  // ==================== Auto Token Refresh ====================

  checkAndRefreshExpiringTokens: async () => {
    const { accounts, refreshAccountToken, checkAccountStatus, autoSwitchEnabled, autoRefreshConcurrency } = get()
    const now = Date.now()

    console.log(`[AutoRefresh] Checking ${accounts.size} accounts...`)

    // Filter accounts to process
    const accountsToProcess: Array<{ id: string; email: string; needsTokenRefresh: boolean }> = []
    
    for (const [id, account] of accounts) {
      // Skip banned or error status accounts
      if (account.lastError?.includes('UnauthorizedException') || 
          account.lastError?.includes('AccountSuspendedException')) {
        console.log(`[AutoRefresh] Skipping ${account.email} (banned/error)`)
        continue
      }

      const expiresAt = account.credentials.expiresAt
      const timeUntilExpiry = expiresAt ? expiresAt - now : Infinity
      const needsTokenRefresh = expiresAt && timeUntilExpiry <= TOKEN_REFRESH_BEFORE_EXPIRY

      accountsToProcess.push({ id, email: account.email, needsTokenRefresh: !!needsTokenRefresh })
    }

    console.log(`[AutoRefresh] Processing ${accountsToProcess.length} accounts...`)

    // Concurrency control: use configured concurrency to avoid lag
    const BATCH_SIZE = autoRefreshConcurrency
    let successCount = 0
    let failCount = 0

    for (let i = 0; i < accountsToProcess.length; i += BATCH_SIZE) {
      const batch = accountsToProcess.slice(i, i + BATCH_SIZE)
      const results = await Promise.allSettled(
        batch.map(async ({ id, email, needsTokenRefresh }) => {
          try {
            if (needsTokenRefresh) {
              console.log(`[AutoRefresh] Refreshing token for ${email}...`)
              await refreshAccountToken(id)
              console.log(`[AutoRefresh] Token for ${email} refreshed`)
              // Sync account info after token refresh
              await checkAccountStatus(id)
              console.log(`[AutoRefresh] Account info for ${email} updated`)
            } else if (autoSwitchEnabled) {
              // Only refresh account info when auto-switch is enabled (for balance detection)
              await checkAccountStatus(id)
              console.log(`[AutoRefresh] Account info for ${email} updated (auto-switch enabled)`)
            }
            return { email, success: true }
          } catch (e) {
            console.error(`[AutoRefresh] Failed for ${email}:`, e)
            return { email, success: false, error: e }
          }
        })
      )
      
      successCount += results.filter(r => r.status === 'fulfilled' && r.value.success).length
      failCount += results.length - results.filter(r => r.status === 'fulfilled' && r.value.success).length
      
      // Delay between batches
      if (i + BATCH_SIZE < accountsToProcess.length) {
        await new Promise(resolve => setTimeout(resolve, 200))
      }
    }

    console.log(`[AutoRefresh] Completed: ${successCount} success, ${failCount} failed`)
  },

  // Only refresh expired tokens (don't refresh account info)
  refreshExpiredTokensOnly: async () => {
    const { accounts, refreshAccountToken, autoRefreshConcurrency } = get()
    const now = Date.now()

    // Filter accounts that need token refresh
    const expiredAccounts: Array<{ id: string; email: string }> = []
    
    for (const [id, account] of accounts) {
      // Skip banned or error status accounts
      if (account.lastError?.includes('UnauthorizedException') || 
          account.lastError?.includes('AccountSuspendedException')) {
        continue
      }

      const expiresAt = account.credentials.expiresAt
      const timeUntilExpiry = expiresAt ? expiresAt - now : Infinity
      
      // Token expired or about to expire
      if (expiresAt && timeUntilExpiry <= TOKEN_REFRESH_BEFORE_EXPIRY) {
        expiredAccounts.push({ id, email: account.email })
      }
    }

    if (expiredAccounts.length === 0) {
      console.log('[AutoRefresh] No expired tokens found')
      return
    }

    console.log(`[AutoRefresh] Refreshing ${expiredAccounts.length} expired tokens...`)

    // Concurrency control: use configured concurrency to avoid lag
    const BATCH_SIZE = autoRefreshConcurrency
    for (let i = 0; i < expiredAccounts.length; i += BATCH_SIZE) {
      const batch = expiredAccounts.slice(i, i + BATCH_SIZE)
      await Promise.allSettled(
        batch.map(async ({ id, email }) => {
          try {
            await refreshAccountToken(id)
            console.log(`[AutoRefresh] Token for ${email} refreshed`)
          } catch (e) {
            console.error(`[AutoRefresh] Failed to refresh token for ${email}:`, e)
          }
        })
      )
      // Delay between batches
      if (i + BATCH_SIZE < expiredAccounts.length) {
        await new Promise(resolve => setTimeout(resolve, 200))
      }
    }
  },

  startAutoTokenRefresh: () => {
    const { autoRefreshEnabled, autoRefreshInterval } = get()
    
    // If timer exists, stop it first
    if (tokenRefreshTimer) {
      clearInterval(tokenRefreshTimer)
      tokenRefreshTimer = null
    }
    
    // If not enabled, don't start timer
    if (!autoRefreshEnabled) {
      console.log('[AutoRefresh] Auto-refresh is disabled')
      return
    }

    // Trigger background refresh on startup (runs in main process, doesn't block UI)
    get().triggerBackgroundRefresh()

    // Use user-configured interval (minutes to milliseconds)
    const intervalMs = autoRefreshInterval * 60 * 1000
    tokenRefreshTimer = setInterval(() => {
      get().triggerBackgroundRefresh()
    }, intervalMs)

    console.log(`[AutoRefresh] Token auto-refresh started with interval: ${autoRefreshInterval} minutes`)
  },

  stopAutoTokenRefresh: () => {
    if (tokenRefreshTimer) {
      clearInterval(tokenRefreshTimer)
      tokenRefreshTimer = null
      console.log('[AutoRefresh] Token auto-refresh stopped')
    }
  },

  // Trigger background refresh (runs in main process, doesn't block UI)
  triggerBackgroundRefresh: async () => {
    const { accounts, autoRefreshConcurrency } = get()
    const now = Date.now()

    // Filter accounts that need token refresh
    const accountsToRefresh: Array<{
      id: string
      email: string
      credentials: {
        refreshToken: string
        clientId?: string
        clientSecret?: string
        region?: string
        authMethod?: string
        accessToken?: string
      }
    }> = []
    
    for (const [id, account] of accounts) {
      // Skip banned or error status accounts
      if (account.lastError?.includes('UnauthorizedException') || 
          account.lastError?.includes('AccountSuspendedException')) {
        continue
      }

      const expiresAt = account.credentials.expiresAt
      const timeUntilExpiry = expiresAt ? expiresAt - now : Infinity
      
      // Token expired or about to expire
      if (expiresAt && timeUntilExpiry <= TOKEN_REFRESH_BEFORE_EXPIRY) {
        accountsToRefresh.push({
          id,
          email: account.email,
          credentials: {
            refreshToken: account.credentials.refreshToken || '',
            clientId: account.credentials.clientId,
            clientSecret: account.credentials.clientSecret,
            region: account.credentials.region,
            authMethod: account.credentials.authMethod,
            accessToken: account.credentials.accessToken
          }
        })
      }
    }

    if (accountsToRefresh.length === 0) {
      console.log('[BackgroundRefresh] No accounts need refresh')
      return
    }

    console.log(`[BackgroundRefresh] Triggering refresh for ${accountsToRefresh.length} accounts...`)
    
    // Call main process background refresh, don't wait for result (receive via IPC events)
    window.api.backgroundBatchRefresh(accountsToRefresh, autoRefreshConcurrency)
  },

  // Handle background refresh result (called by App.tsx)
  handleBackgroundRefreshResult: (data) => {
    const { id, success, data: resultData, error } = data
    
    if (!success) {
      console.log(`[BackgroundRefresh] Account ${id} refresh failed:`, error)
      // Update account error status
      set((state) => {
        const accounts = new Map(state.accounts)
        const account = accounts.get(id)
        if (account) {
          accounts.set(id, {
            ...account,
            status: 'error',
            lastError: error,
            lastCheckedAt: Date.now()
          })
        }
        return { accounts }
      })
      return
    }

    // Update account status
    set((state) => {
      const accounts = new Map(state.accounts)
      const account = accounts.get(id)
      
      if (!account) return state

      const now = Date.now()
      const refreshData = resultData as {
        accessToken?: string
        refreshToken?: string
        expiresIn?: number
        usage?: { current?: number; limit?: number; baseCurrent?: number; baseLimit?: number; freeTrialCurrent?: number; freeTrialLimit?: number; freeTrialExpiry?: string; nextResetDate?: string }
        subscription?: { type?: string; title?: string }
        userInfo?: { email?: string; userId?: string }
        status?: string
        errorMessage?: string
      } | undefined

      // Detect ban status
      const newStatus = refreshData?.status === 'error' ? 'error' as AccountStatus : 'active' as AccountStatus
      const newError = refreshData?.errorMessage

      accounts.set(id, {
        ...account,
        credentials: {
          ...account.credentials,
          accessToken: refreshData?.accessToken || account.credentials.accessToken,
          refreshToken: refreshData?.refreshToken || account.credentials.refreshToken,
          expiresAt: refreshData?.expiresIn ? now + refreshData.expiresIn * 1000 : account.credentials.expiresAt
        },
        usage: refreshData?.usage ? {
          ...account.usage,
          current: refreshData.usage.current ?? account.usage.current,
          limit: refreshData.usage.limit ?? account.usage.limit,
          baseCurrent: refreshData.usage.baseCurrent ?? account.usage.baseCurrent,
          baseLimit: refreshData.usage.baseLimit ?? account.usage.baseLimit,
          freeTrialCurrent: refreshData.usage.freeTrialCurrent ?? account.usage.freeTrialCurrent,
          freeTrialLimit: refreshData.usage.freeTrialLimit ?? account.usage.freeTrialLimit,
          freeTrialExpiry: refreshData.usage.freeTrialExpiry ?? account.usage.freeTrialExpiry,
          nextResetDate: refreshData.usage.nextResetDate ?? account.usage.nextResetDate,
          lastUpdated: now
        } : account.usage,
        email: refreshData?.userInfo?.email || account.email,
        userId: refreshData?.userInfo?.userId || account.userId,
        status: newStatus,
        lastError: newError,
        lastCheckedAt: now
      })

      return { accounts }
    })
  },

  // Handle background check result (called by App.tsx)
  handleBackgroundCheckResult: (data: { id: string; success: boolean; data?: unknown; error?: string }) => {
    const { id, success, data: resultData, error } = data
    
    if (!success) {
      console.log(`[BackgroundCheck] Account ${id} check failed:`, error)
      set((state) => {
        const accounts = new Map(state.accounts)
        const account = accounts.get(id)
        if (account) {
          accounts.set(id, {
            ...account,
            status: 'error',
            lastError: error,
            lastCheckedAt: Date.now()
          })
        }
        return { accounts }
      })
      return
    }

    // Update account status
    set((state) => {
      const accounts = new Map(state.accounts)
      const account = accounts.get(id)
      
      if (!account) return state

      const now = Date.now()
      const checkData = resultData as {
        usage?: { current?: number; limit?: number; baseCurrent?: number; baseLimit?: number; freeTrialCurrent?: number; freeTrialLimit?: number; freeTrialExpiry?: string; nextResetDate?: string }
        subscription?: { type?: string; title?: string }
        userInfo?: { email?: string; userId?: string }
        status?: string
        errorMessage?: string
        needsRefresh?: boolean
      } | undefined

      // Detect status
      let newStatus: AccountStatus = 'active'
      if (checkData?.status === 'error') {
        newStatus = 'error'
      } else if (checkData?.status === 'expired' || checkData?.needsRefresh) {
        newStatus = 'expired'
      }
      const newError = checkData?.errorMessage

      accounts.set(id, {
        ...account,
        usage: checkData?.usage ? {
          ...account.usage,
          current: checkData.usage.current ?? account.usage.current,
          limit: checkData.usage.limit ?? account.usage.limit,
          baseCurrent: checkData.usage.baseCurrent ?? account.usage.baseCurrent,
          baseLimit: checkData.usage.baseLimit ?? account.usage.baseLimit,
          freeTrialCurrent: checkData.usage.freeTrialCurrent ?? account.usage.freeTrialCurrent,
          freeTrialLimit: checkData.usage.freeTrialLimit ?? account.usage.freeTrialLimit,
          freeTrialExpiry: checkData.usage.freeTrialExpiry ?? account.usage.freeTrialExpiry,
          nextResetDate: checkData.usage.nextResetDate ?? account.usage.nextResetDate,
          lastUpdated: now
        } : account.usage,
        subscription: checkData?.subscription ? {
          ...account.subscription,
          type: (checkData.subscription.type as 'Free' | 'Pro' | 'Enterprise' | 'Teams') ?? account.subscription.type,
          title: checkData.subscription.title ?? account.subscription.title
        } : account.subscription,
        email: checkData?.userInfo?.email || account.email,
        userId: checkData?.userInfo?.userId || account.userId,
        status: newStatus,
        lastError: newError,
        lastCheckedAt: now
      })

      return { accounts }
    })
  },

  // ==================== Auto-Save Timer ====================

  startAutoSave: () => {
    // If timer exists, stop it first
    if (autoSaveTimer) {
      clearInterval(autoSaveTimer)
    }

    // Calculate current data hash
    const computeHash = () => {
      const { accounts, groups, tags, activeAccountId } = get()
      return JSON.stringify({
        accounts: Object.fromEntries(accounts),
        groups: Object.fromEntries(groups),
        tags: Object.fromEntries(tags),
        activeAccountId
      })
    }

    // Initialize hash value
    lastSaveHash = computeHash()

    // Set periodic save
    autoSaveTimer = setInterval(async () => {
      const currentHash = computeHash()
      
      // Only save when data changes
      if (currentHash !== lastSaveHash) {
        console.log('[AutoSave] Data changed, saving...')
        await get().saveToStorage()
        lastSaveHash = currentHash
        console.log('[AutoSave] Data saved successfully')
      }
    }, AUTO_SAVE_INTERVAL)

    console.log(`[AutoSave] Auto-save started with interval: ${AUTO_SAVE_INTERVAL / 1000}s`)
  },

  stopAutoSave: () => {
    if (autoSaveTimer) {
      clearInterval(autoSaveTimer)
      autoSaveTimer = null
      console.log('[AutoSave] Auto-save stopped')
    }
  },

  // ==================== Machine ID Management ====================

  setMachineIdConfig: (config) => {
    set((state) => ({
      machineIdConfig: { ...state.machineIdConfig, ...config }
    }))
    get().saveToStorage()
  },

  refreshCurrentMachineId: async () => {
    try {
      const result = await window.api.machineIdGetCurrent()
      if (result.success && result.machineId) {
        set({ currentMachineId: result.machineId })
        
        // Auto-backup original machine ID on first fetch
        const { originalMachineId } = get()
        if (!originalMachineId) {
          get().backupOriginalMachineId()
        }
      }
    } catch (error) {
      console.error('[MachineId] Failed to refresh current machine ID:', error)
    }
  },

  changeMachineId: async (newMachineId) => {
    const state = get()
    
    // Backup original machine ID on first change
    if (!state.originalMachineId) {
      state.backupOriginalMachineId()
    }

    // Generate new machine ID (if not provided)
    const machineIdToSet = newMachineId || await window.api.machineIdGenerateRandom()
    
    try {
      const result = await window.api.machineIdSet(machineIdToSet)
      
      if (result.success) {
        // Update state
        set((s) => ({
          currentMachineId: machineIdToSet,
          machineIdHistory: [
            ...s.machineIdHistory,
            {
              id: crypto.randomUUID(),
              machineId: machineIdToSet,
              timestamp: Date.now(),
              action: 'manual'
            }
          ]
        }))
        get().saveToStorage()
        return true
      } else if (result.requiresAdmin) {
        // Requires admin privileges, main process will handle dialog
        return false
      } else {
        console.error('[MachineId] Failed to change:', result.error)
        return false
      }
    } catch (error) {
      console.error('[MachineId] Error changing machine ID:', error)
      return false
    }
  },

  restoreOriginalMachineId: async () => {
    const { originalMachineId } = get()
    
    if (!originalMachineId) {
      console.warn('[MachineId] No original machine ID to restore')
      return false
    }

    try {
      const result = await window.api.machineIdSet(originalMachineId)
      
      if (result.success) {
        set((s) => ({
          currentMachineId: originalMachineId,
          machineIdHistory: [
            ...s.machineIdHistory,
            {
              id: crypto.randomUUID(),
              machineId: originalMachineId,
              timestamp: Date.now(),
              action: 'restore'
            }
          ]
        }))
        get().saveToStorage()
        return true
      }
      return false
    } catch (error) {
      console.error('[MachineId] Error restoring original machine ID:', error)
      return false
    }
  },

  bindMachineIdToAccount: (accountId, machineId) => {
    const account = get().accounts.get(accountId)
    if (!account) return

    // Generate or use provided machine ID
    const boundMachineId = machineId || crypto.randomUUID()

    set((state) => ({
      accountMachineIds: {
        ...state.accountMachineIds,
        [accountId]: boundMachineId
      },
      machineIdHistory: [
        ...state.machineIdHistory,
        {
          id: crypto.randomUUID(),
          machineId: boundMachineId,
          timestamp: Date.now(),
          action: 'bind',
          accountId,
          accountEmail: account.email
        }
      ]
    }))
    get().saveToStorage()
  },

  getMachineIdForAccount: (accountId) => {
    return get().accountMachineIds[accountId] || null
  },

  backupOriginalMachineId: () => {
    const { currentMachineId, originalMachineId } = get()
    
    // Only backup if no backup exists and current machine ID is available
    if (!originalMachineId && currentMachineId) {
      set({
        originalMachineId: currentMachineId,
        originalBackupTime: Date.now()
      })
      
      // Add history record
      set((s) => ({
        machineIdHistory: [
          ...s.machineIdHistory,
          {
            id: crypto.randomUUID(),
            machineId: currentMachineId,
            timestamp: Date.now(),
            action: 'initial'
          }
        ]
      }))
      
      get().saveToStorage()
      console.log('[MachineId] Original machine ID backed up:', currentMachineId)
    }
  },

  clearMachineIdHistory: () => {
    set({ machineIdHistory: [] })
    get().saveToStorage()
  }
}))
