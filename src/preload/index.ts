import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  // Open external link
  openExternal: (url: string): void => {
    ipcRenderer.send('open-external', url)
  },

  // Get app version
  getAppVersion: (): Promise<string> => {
    return ipcRenderer.invoke('get-app-version')
  },

  // ============ Kiro Process Management ============
  
  // Check if Kiro process is running
  checkKiroRunning: (): Promise<{ running: boolean }> => {
    return ipcRenderer.invoke('check-kiro-running')
  },

  // Auto-detect Kiro installation path
  detectKiroPath: (): Promise<{ success: boolean; path: string }> => {
    return ipcRenderer.invoke('detect-kiro-path')
  },

  // Launch Kiro
  launchKiro: (kiroPath: string): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('launch-kiro', kiroPath)
  },

  // Select Kiro executable file
  selectKiroPath: (): Promise<{ success: boolean; path: string }> => {
    return ipcRenderer.invoke('select-kiro-path')
  },

  // Listen for OAuth callback
  onAuthCallback: (callback: (data: { code: string; state: string }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { code: string; state: string }): void => {
      callback(data)
    }
    ipcRenderer.on('auth-callback', handler)
    return () => {
      ipcRenderer.removeListener('auth-callback', handler)
    }
  },

  // Account management - Load account data
  loadAccounts: (): Promise<unknown> => {
    return ipcRenderer.invoke('load-accounts')
  },

  // Account management - Save account data
  saveAccounts: (data: unknown): Promise<void> => {
    return ipcRenderer.invoke('save-accounts', data)
  },

  // Account management - Refresh token
  refreshAccountToken: (account: unknown): Promise<unknown> => {
    return ipcRenderer.invoke('refresh-account-token', account)
  },

  // Account management - Check account status
  checkAccountStatus: (account: unknown): Promise<unknown> => {
    return ipcRenderer.invoke('check-account-status', account)
  },

  // Background batch refresh accounts (runs in main process, doesn't block UI)
  backgroundBatchRefresh: (accounts: Array<{
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
  }>, concurrency?: number): Promise<{ success: boolean; completed: number; successCount: number; failedCount: number }> => {
    return ipcRenderer.invoke('background-batch-refresh', accounts, concurrency)
  },

  // Listen for background refresh progress
  onBackgroundRefreshProgress: (callback: (data: { completed: number; total: number; success: number; failed: number }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { completed: number; total: number; success: number; failed: number }): void => {
      callback(data)
    }
    ipcRenderer.on('background-refresh-progress', handler)
    return () => {
      ipcRenderer.removeListener('background-refresh-progress', handler)
    }
  },

  // Listen for background refresh result (single account)
  onBackgroundRefreshResult: (callback: (data: { id: string; success: boolean; data?: unknown; error?: string }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { id: string; success: boolean; data?: unknown; error?: string }): void => {
      callback(data)
    }
    ipcRenderer.on('background-refresh-result', handler)
    return () => {
      ipcRenderer.removeListener('background-refresh-result', handler)
    }
  },

  // Background batch check account status (without refreshing token)
  backgroundBatchCheck: (accounts: Array<{
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
  }>, concurrency?: number): Promise<{ success: boolean; completed: number; successCount: number; failedCount: number }> => {
    return ipcRenderer.invoke('background-batch-check', accounts, concurrency)
  },

  // Listen for background check progress
  onBackgroundCheckProgress: (callback: (data: { completed: number; total: number; success: number; failed: number }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { completed: number; total: number; success: number; failed: number }): void => {
      callback(data)
    }
    ipcRenderer.on('background-check-progress', handler)
    return () => {
      ipcRenderer.removeListener('background-check-progress', handler)
    }
  },

  // Listen for background check result (single account)
  onBackgroundCheckResult: (callback: (data: { id: string; success: boolean; data?: unknown; error?: string }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { id: string; success: boolean; data?: unknown; error?: string }): void => {
      callback(data)
    }
    ipcRenderer.on('background-check-result', handler)
    return () => {
      ipcRenderer.removeListener('background-check-result', handler)
    }
  },

  // Switch account - Write credentials to local SSO cache
  switchAccount: (credentials: {
    accessToken: string
    refreshToken: string
    clientId: string
    clientSecret: string
    region?: string
    authMethod?: 'IdC' | 'social'
    provider?: 'BuilderId' | 'Github' | 'Google'
  }): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('switch-account', credentials)
  },

  // File operations - Export to file
  exportToFile: (data: string, filename: string): Promise<boolean> => {
    return ipcRenderer.invoke('export-to-file', data, filename)
  },

  // File operations - Batch export to folder
  exportToFolder: (files: Array<{ filename: string; content: string }>): Promise<{ success: boolean; count: number; folder?: string; error?: string }> => {
    return ipcRenderer.invoke('export-to-folder', files)
  },

  // File operations - Import from file
  importFromFile: (): Promise<string | null> => {
    return ipcRenderer.invoke('import-from-file')
  },

  // Verify credentials and get account info
  verifyAccountCredentials: (credentials: {
    refreshToken: string
    clientId: string
    clientSecret: string
    region?: string
    authMethod?: string  // 'IdC' or 'social'
    provider?: string    // 'BuilderId', 'Github', 'Google'
  }): Promise<{
    success: boolean
    data?: {
      email: string
      userId: string
      accessToken: string
      refreshToken: string
      expiresIn?: number
      subscriptionType: string
      subscriptionTitle: string
      usage: { current: number; limit: number }
      daysRemaining?: number
      expiresAt?: number
    }
    error?: string
  }> => {
    return ipcRenderer.invoke('verify-account-credentials', credentials)
  },

  // Get currently active account info from local SSO cache
  getLocalActiveAccount: (): Promise<{
    success: boolean
    data?: {
      refreshToken: string
      accessToken?: string
      authMethod?: string
      provider?: string
    }
    error?: string
  }> => {
    return ipcRenderer.invoke('get-local-active-account')
  },

  // Import credentials from Kiro local config
  loadKiroCredentials: (): Promise<{
    success: boolean
    data?: {
      accessToken: string
      refreshToken: string
      clientId: string
      clientSecret: string
      region: string
      authMethod: string  // 'IdC' or 'social'
      provider: string    // 'BuilderId', 'Github', 'Google'
    }
    error?: string
  }> => {
    return ipcRenderer.invoke('load-kiro-credentials')
  },

  // Import account from AWS SSO Token (x-amz-sso_authn)
  importFromSsoToken: (bearerToken: string, region?: string): Promise<{
    success: boolean
    data?: {
      accessToken: string
      refreshToken: string
      clientId: string
      clientSecret: string
      region: string
      expiresIn?: number
      email?: string
      userId?: string
      idp?: string
      status?: string
    }
    error?: { message: string }
  }> => {
    return ipcRenderer.invoke('import-from-sso-token', bearerToken, region || 'us-east-1')
  },

  // ============ Manual Login API ============

  // Start Builder ID manual login
  startBuilderIdLogin: (region?: string): Promise<{
    success: boolean
    userCode?: string
    verificationUri?: string
    expiresIn?: number
    interval?: number
    error?: string
  }> => {
    return ipcRenderer.invoke('start-builder-id-login', region || 'us-east-1')
  },

  // Poll Builder ID authorization status
  pollBuilderIdAuth: (region?: string): Promise<{
    success: boolean
    completed?: boolean
    status?: string
    accessToken?: string
    refreshToken?: string
    clientId?: string
    clientSecret?: string
    region?: string
    expiresIn?: number
    error?: string
  }> => {
    return ipcRenderer.invoke('poll-builder-id-auth', region || 'us-east-1')
  },

  // Cancel Builder ID login
  cancelBuilderIdLogin: (): Promise<{ success: boolean }> => {
    return ipcRenderer.invoke('cancel-builder-id-login')
  },

  // Start Social Auth login (Google/GitHub)
  startSocialLogin: (provider: 'Google' | 'Github'): Promise<{
    success: boolean
    loginUrl?: string
    state?: string
    error?: string
  }> => {
    return ipcRenderer.invoke('start-social-login', provider)
  },

  // Exchange Social Auth token
  exchangeSocialToken: (code: string, state: string): Promise<{
    success: boolean
    accessToken?: string
    refreshToken?: string
    profileArn?: string
    expiresIn?: number
    authMethod?: string
    provider?: string
    error?: string
  }> => {
    return ipcRenderer.invoke('exchange-social-token', code, state)
  },

  // Cancel Social Auth login
  cancelSocialLogin: (): Promise<{ success: boolean }> => {
    return ipcRenderer.invoke('cancel-social-login')
  },

  // Listen for Social Auth callback
  onSocialAuthCallback: (callback: (data: { code?: string; state?: string; error?: string }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { code?: string; state?: string; error?: string }): void => {
      callback(data)
    }
    ipcRenderer.on('social-auth-callback', handler)
    return () => {
      ipcRenderer.removeListener('social-auth-callback', handler)
    }
  },

  // Proxy settings
  setProxy: (enabled: boolean, url: string): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('set-proxy', enabled, url)
  },

  // ============ Machine ID Management API ============

  // Get operating system type
  machineIdGetOSType: (): Promise<'windows' | 'macos' | 'linux' | 'unknown'> => {
    return ipcRenderer.invoke('machine-id:get-os-type')
  },

  // Get current machine ID
  machineIdGetCurrent: (): Promise<{
    success: boolean
    machineId?: string
    error?: string
    requiresAdmin?: boolean
  }> => {
    return ipcRenderer.invoke('machine-id:get-current')
  },

  // Set new machine ID
  machineIdSet: (newMachineId: string): Promise<{
    success: boolean
    machineId?: string
    error?: string
    requiresAdmin?: boolean
  }> => {
    return ipcRenderer.invoke('machine-id:set', newMachineId)
  },

  // Generate random machine ID
  machineIdGenerateRandom: (): Promise<string> => {
    return ipcRenderer.invoke('machine-id:generate-random')
  },

  // Check admin privileges
  machineIdCheckAdmin: (): Promise<boolean> => {
    return ipcRenderer.invoke('machine-id:check-admin')
  },

  // Request admin restart
  machineIdRequestAdminRestart: (): Promise<boolean> => {
    return ipcRenderer.invoke('machine-id:request-admin-restart')
  },

  // Backup machine ID to file
  machineIdBackupToFile: (machineId: string): Promise<boolean> => {
    return ipcRenderer.invoke('machine-id:backup-to-file', machineId)
  },

  // Restore machine ID from file
  machineIdRestoreFromFile: (): Promise<{
    success: boolean
    machineId?: string
    error?: string
  }> => {
    return ipcRenderer.invoke('machine-id:restore-from-file')
  },

  // ============ Auto Update ============
  
  // Check for updates (electron-updater)
  checkForUpdates: (): Promise<{
    hasUpdate: boolean
    version?: string
    releaseDate?: string
    message?: string
    error?: string
  }> => {
    return ipcRenderer.invoke('check-for-updates')
  },

  // Manual check for updates (GitHub API, for AboutPage)
  checkForUpdatesManual: (): Promise<{
    hasUpdate: boolean
    currentVersion?: string
    latestVersion?: string
    releaseNotes?: string
    releaseName?: string
    releaseUrl?: string
    publishedAt?: string
    assets?: Array<{
      name: string
      downloadUrl: string
      size: number
    }>
    error?: string
  }> => {
    return ipcRenderer.invoke('check-for-updates-manual')
  },

  // Download update
  downloadUpdate: (): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('download-update')
  },

  // Install update and restart
  installUpdate: (): Promise<void> => {
    return ipcRenderer.invoke('install-update')
  },

  // Listen for update events
  onUpdateChecking: (callback: () => void): (() => void) => {
    const handler = (): void => callback()
    ipcRenderer.on('update-checking', handler)
    return () => ipcRenderer.removeListener('update-checking', handler)
  },

  onUpdateAvailable: (callback: (info: { version: string; releaseDate?: string; releaseNotes?: string }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, info: { version: string; releaseDate?: string; releaseNotes?: string }): void => callback(info)
    ipcRenderer.on('update-available', handler)
    return () => ipcRenderer.removeListener('update-available', handler)
  },

  onUpdateNotAvailable: (callback: (info: { version: string }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, info: { version: string }): void => callback(info)
    ipcRenderer.on('update-not-available', handler)
    return () => ipcRenderer.removeListener('update-not-available', handler)
  },

  onUpdateDownloadProgress: (callback: (progress: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: { percent: number; bytesPerSecond: number; transferred: number; total: number }): void => callback(progress)
    ipcRenderer.on('update-download-progress', handler)
    return () => ipcRenderer.removeListener('update-download-progress', handler)
  },

  onUpdateDownloaded: (callback: (info: { version: string; releaseDate?: string; releaseNotes?: string }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, info: { version: string; releaseDate?: string; releaseNotes?: string }): void => callback(info)
    ipcRenderer.on('update-downloaded', handler)
    return () => ipcRenderer.removeListener('update-downloaded', handler)
  },

  onUpdateError: (callback: (error: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, error: string): void => callback(error)
    ipcRenderer.on('update-error', handler)
    return () => ipcRenderer.removeListener('update-error', handler)
  },

  // ============ Kiro Settings Management ============

  // Get Kiro settings
  getKiroSettings: (): Promise<{
    settings?: Record<string, unknown>
    mcpConfig?: { mcpServers: Record<string, unknown> }
    steeringFiles?: string[]
    error?: string
  }> => {
    return ipcRenderer.invoke('get-kiro-settings')
  },

  // Save Kiro settings
  saveKiroSettings: (settings: Record<string, unknown>): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('save-kiro-settings', settings)
  },

  // Open Kiro MCP config file
  openKiroMcpConfig: (type: 'user' | 'workspace'): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('open-kiro-mcp-config', type)
  },

  // Open Kiro Steering folder
  openKiroSteeringFolder: (): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('open-kiro-steering-folder')
  },

  // Open Kiro settings.json file
  openKiroSettingsFile: (): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('open-kiro-settings-file')
  },

  // Open specified Steering file
  openKiroSteeringFile: (filename: string): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('open-kiro-steering-file', filename)
  },

  // Create default rules.md file
  createKiroDefaultRules: (): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('create-kiro-default-rules')
  },

  // Read Steering file content
  readKiroSteeringFile: (filename: string): Promise<{ success: boolean; content?: string; error?: string }> => {
    return ipcRenderer.invoke('read-kiro-steering-file', filename)
  },

  // Save Steering file content
  saveKiroSteeringFile: (filename: string, content: string): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('save-kiro-steering-file', filename, content)
  },

  // Delete Steering file
  deleteKiroSteeringFile: (filename: string): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('delete-kiro-steering-file', filename)
  },

  // ============ MCP Server Management ============

  // Save MCP server config
  saveMcpServer: (name: string, config: { command: string; args?: string[]; env?: Record<string, string> }, oldName?: string): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('save-mcp-server', name, config, oldName)
  },

  // Delete MCP server
  deleteMcpServer: (name: string): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('delete-mcp-server', name)
  },

  // ============ AWS Auto-Register API ============

  // Auto-register AWS Builder ID
  autoRegisterAWS: (params: {
    email: string
    emailPassword: string
    refreshToken: string
    clientId: string
    clientSecret?: string
    skipOutlookActivation?: boolean
    proxyUrl?: string
  }): Promise<{
    success: boolean
    ssoToken?: string
    name?: string
    error?: string
  }> => {
    return ipcRenderer.invoke('auto-register-aws', params)
  },

  // Activate Outlook email only
  activateOutlook: (params: {
    email: string
    emailPassword: string
  }): Promise<{
    success: boolean
    error?: string
  }> => {
    return ipcRenderer.invoke('activate-outlook', params)
  },

  // Listen for auto-register logs
  onAutoRegisterLog: (callback: (data: { email: string; message: string }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { email: string; message: string }): void => {
      callback(data)
    }
    ipcRenderer.on('auto-register-log', handler)
    return () => {
      ipcRenderer.removeListener('auto-register-log', handler)
    }
  },

  // Get Outlook email verification code
  getOutlookVerificationCode: (params: {
    email: string
    refreshToken: string
    clientId: string
    senderFilter?: string[]
    minutes?: number
    timeout?: number
  }): Promise<{
    success: boolean
    code?: string
    error?: string
  }> => {
    return ipcRenderer.invoke('get-outlook-verification-code', params)
  },

  // Open file selection dialog
  openFile: (options?: {
    filters?: Array<{ name: string; extensions: string[] }>
  }): Promise<{ content: string; path: string } | null> => {
    return ipcRenderer.invoke('open-file-dialog', options)
  },

  // ============ Kiro Server Import API ============

  // Import accounts to Kiro server
  importToKiroServer: (params: {
    serverUrl: string
    password: string
    accounts: Array<{
      email: string
      accessToken?: string
      refreshToken: string
      clientId?: string
      clientSecret?: string
      region?: string
      idp?: string
      authMethod?: string
    }>
  }): Promise<{
    success: boolean
    imported?: number
    failed?: number
    errors?: string[]
    error?: string
  }> => {
    return ipcRenderer.invoke('import-to-kiro-server', params)
  },

  // Test Kiro server connection
  testKiroServerConnection: (serverUrl: string, password: string): Promise<{
    success: boolean
    error?: string
  }> => {
    return ipcRenderer.invoke('test-kiro-server-connection', serverUrl, password)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
