import { ElectronAPI } from '@electron-toolkit/preload'

interface AccountData {
  accounts: Record<string, unknown>
  groups: Record<string, unknown>
  tags: Record<string, unknown>
  activeAccountId: string | null
  autoRefreshEnabled: boolean
  autoRefreshInterval: number
  autoRefreshConcurrency?: number
  statusCheckInterval: number
  privacyMode?: boolean
  proxyEnabled?: boolean
  proxyUrl?: string
  autoSwitchEnabled?: boolean
  autoSwitchThreshold?: number
  autoSwitchInterval?: number
  kiroPath?: string
  autoLaunchKiro?: boolean
  kiroServerUrl?: string
  kiroServerPassword?: string
  theme?: string
  darkMode?: boolean
  // Machine ID management
  machineIdConfig?: {
    autoSwitchOnAccountChange: boolean
    bindMachineIdToAccount: boolean
    useBindedMachineId: boolean
  }
  currentMachineId?: string
  originalMachineId?: string | null
  originalBackupTime?: number | null
  accountMachineIds?: Record<string, string>
  machineIdHistory?: Array<{
    id: string
    machineId: string
    timestamp: number
    action: 'initial' | 'manual' | 'auto_switch' | 'restore' | 'bind'
    accountId?: string
    accountEmail?: string
  }>
}

interface RefreshResult {
  success: boolean
  data?: {
    accessToken: string
    refreshToken?: string
    expiresIn: number
  }
  error?: { message: string }
}

interface BonusData {
  code: string
  name: string
  current: number
  limit: number
  expiresAt?: string
}

interface ResourceDetail {
  resourceType?: string
  displayName?: string
  displayNamePlural?: string
  currency?: string
  unit?: string
  overageRate?: number
  overageCap?: number
  overageEnabled?: boolean
}

interface StatusResult {
  success: boolean
  data?: {
    status: string
    email?: string
    userId?: string
    idp?: string // Identity provider: BuilderId, Google, Github, etc.
    userStatus?: string // User status: Active, etc.
    featureFlags?: string[] // Feature flags
    subscriptionTitle?: string
    usage?: { 
      current: number
      limit: number
      percentUsed: number
      lastUpdated: number
      baseLimit?: number
      baseCurrent?: number
      freeTrialLimit?: number
      freeTrialCurrent?: number
      freeTrialExpiry?: string
      bonuses?: BonusData[]
      nextResetDate?: string
      resourceDetail?: ResourceDetail
    }
    subscription?: { 
      type: string
      title?: string
      rawType?: string
      expiresAt?: number
      daysRemaining?: number
      upgradeCapability?: string
      overageCapability?: string
      managementTarget?: string
    }
    // If token was refreshed, return new credentials
    newCredentials?: {
      accessToken: string
      refreshToken?: string
      expiresAt?: number
    }
  }
  error?: { message: string }
}

interface KiroApi {
  openExternal: (url: string) => void
  getAppVersion: () => Promise<string>
  
  // Kiro process management
  checkKiroRunning: () => Promise<{ running: boolean }>
  detectKiroPath: () => Promise<{ success: boolean; path: string }>
  launchKiro: (kiroPath: string) => Promise<{ success: boolean; error?: string }>
  selectKiroPath: () => Promise<{ success: boolean; path: string }>
  
  onAuthCallback: (callback: (data: { code: string; state: string }) => void) => () => void

  // Account management
  loadAccounts: () => Promise<AccountData | null>
  saveAccounts: (data: AccountData) => Promise<void>
  refreshAccountToken: (account: unknown) => Promise<RefreshResult>
  checkAccountStatus: (account: unknown) => Promise<StatusResult>
  
  // Background batch refresh (runs in main process, doesn't block UI)
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
  }>, concurrency?: number) => Promise<{ success: boolean; completed: number; successCount: number; failedCount: number }>
  onBackgroundRefreshProgress: (callback: (data: { completed: number; total: number; success: number; failed: number }) => void) => () => void
  onBackgroundRefreshResult: (callback: (data: { id: string; success: boolean; data?: unknown; error?: string }) => void) => () => void
  
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
  }>, concurrency?: number) => Promise<{ success: boolean; completed: number; successCount: number; failedCount: number }>
  onBackgroundCheckProgress: (callback: (data: { completed: number; total: number; success: number; failed: number }) => void) => () => void
  onBackgroundCheckResult: (callback: (data: { id: string; success: boolean; data?: unknown; error?: string }) => void) => () => void
  
  // Switch account - Write credentials to local SSO cache
  switchAccount: (credentials: {
    accessToken: string
    refreshToken: string
    clientId: string
    clientSecret: string
    region?: string
    authMethod?: 'IdC' | 'social'
    provider?: 'BuilderId' | 'Github' | 'Google'
  }) => Promise<{ success: boolean; error?: string }>

  // File operations
  exportToFile: (data: string, filename: string) => Promise<boolean>
  exportToFolder: (files: Array<{ filename: string; content: string }>) => Promise<{ success: boolean; count: number; folder?: string; error?: string }>
  importFromFile: () => Promise<{ content: string; format: string } | { files: Array<{ content: string; format: string; path: string }>; isMultiple: true } | null>

  // Verify credentials and get account info
  verifyAccountCredentials: (credentials: {
    refreshToken: string
    clientId: string
    clientSecret: string
    region?: string
    authMethod?: string  // 'IdC' or 'social'
    provider?: string    // 'BuilderId', 'Github', 'Google'
  }) => Promise<{
    success: boolean
    data?: {
      email: string
      userId: string
      accessToken: string
      refreshToken: string
      expiresIn?: number
      subscriptionType: string
      subscriptionTitle: string
      subscription?: {
        rawType?: string
        managementTarget?: string
        upgradeCapability?: string
        overageCapability?: string
      }
      usage: { 
        current: number
        limit: number
        baseLimit?: number
        baseCurrent?: number
        freeTrialLimit?: number
        freeTrialCurrent?: number
        freeTrialExpiry?: string
        bonuses?: Array<{ code: string; name: string; current: number; limit: number; expiresAt?: string }>
        nextResetDate?: string
        resourceDetail?: {
          displayName?: string
          displayNamePlural?: string
          resourceType?: string
          currency?: string
          unit?: string
          overageRate?: number
          overageCap?: number
          overageEnabled?: boolean
        }
      }
      daysRemaining?: number
      expiresAt?: number
    }
    error?: string
  }>

  // Get currently active account info from local SSO cache
  getLocalActiveAccount: () => Promise<{
    success: boolean
    data?: {
      refreshToken: string
      accessToken?: string
      authMethod?: string
      provider?: string
    }
    error?: string
  }>

  // Import credentials from Kiro local config
  loadKiroCredentials: () => Promise<{
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
  }>

  // Import account from AWS SSO Token (x-amz-sso_authn)
  importFromSsoToken: (bearerToken: string, region?: string) => Promise<{
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
      subscriptionType?: string
      subscriptionTitle?: string
      subscription?: {
        managementTarget?: string
        upgradeCapability?: string
        overageCapability?: string
      }
      usage?: {
        current: number
        limit: number
        baseLimit?: number
        baseCurrent?: number
        freeTrialLimit?: number
        freeTrialCurrent?: number
        freeTrialExpiry?: string
        bonuses?: Array<{ code: string; name: string; current: number; limit: number; expiresAt?: string }>
        nextResetDate?: string
        resourceDetail?: {
          displayName?: string
          displayNamePlural?: string
          resourceType?: string
          currency?: string
          unit?: string
          overageRate?: number
          overageCap?: number
          overageEnabled?: boolean
        }
      }
      daysRemaining?: number
    }
    error?: { message: string }
  }>

  // ============ Manual Login API ============

  // Start Builder ID manual login
  startBuilderIdLogin: (region?: string) => Promise<{
    success: boolean
    userCode?: string
    verificationUri?: string
    expiresIn?: number
    interval?: number
    error?: string
  }>

  // Poll Builder ID authorization status
  pollBuilderIdAuth: (region?: string) => Promise<{
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
  }>

  // Cancel Builder ID login
  cancelBuilderIdLogin: () => Promise<{ success: boolean }>

  // Start Social Auth login (Google/GitHub)
  startSocialLogin: (provider: 'Google' | 'Github') => Promise<{
    success: boolean
    loginUrl?: string
    state?: string
    error?: string
  }>

  // Exchange Social Auth token
  exchangeSocialToken: (code: string, state: string) => Promise<{
    success: boolean
    accessToken?: string
    refreshToken?: string
    profileArn?: string
    expiresIn?: number
    authMethod?: string
    provider?: string
    error?: string
  }>

  // Cancel Social Auth login
  cancelSocialLogin: () => Promise<{ success: boolean }>

  // Listen for Social Auth callback
  onSocialAuthCallback: (callback: (data: { code?: string; state?: string; error?: string }) => void) => () => void

  // Proxy settings
  setProxy: (enabled: boolean, url: string) => Promise<{ success: boolean; error?: string }>

  // ============ Machine ID Management API ============

  // Get operating system type
  machineIdGetOSType: () => Promise<'windows' | 'macos' | 'linux' | 'unknown'>

  // Get current machine ID
  machineIdGetCurrent: () => Promise<{
    success: boolean
    machineId?: string
    error?: string
    requiresAdmin?: boolean
  }>

  // Set new machine ID
  machineIdSet: (newMachineId: string) => Promise<{
    success: boolean
    machineId?: string
    error?: string
    requiresAdmin?: boolean
  }>

  // Generate random machine ID
  machineIdGenerateRandom: () => Promise<string>

  // Check admin privileges
  machineIdCheckAdmin: () => Promise<boolean>

  // Request admin restart
  machineIdRequestAdminRestart: () => Promise<boolean>

  // Backup machine ID to file
  machineIdBackupToFile: (machineId: string) => Promise<boolean>

  // Restore machine ID from file
  machineIdRestoreFromFile: () => Promise<{
    success: boolean
    machineId?: string
    error?: string
  }>

  // ============ Auto Update API ============

  // Check for updates (electron-updater)
  checkForUpdates: () => Promise<{
    hasUpdate: boolean
    version?: string
    releaseDate?: string
    message?: string
    error?: string
  }>

  // Manual check for updates (GitHub API, for AboutPage)
  checkForUpdatesManual: () => Promise<{
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
  }>

  // Download update
  downloadUpdate: () => Promise<{ success: boolean; error?: string }>

  // Install update and restart
  installUpdate: () => Promise<void>

  // Listen for update events
  onUpdateChecking: (callback: () => void) => () => void
  onUpdateAvailable: (callback: (info: { version: string; releaseDate?: string; releaseNotes?: string }) => void) => () => void
  onUpdateNotAvailable: (callback: (info: { version: string }) => void) => () => void
  onUpdateDownloadProgress: (callback: (progress: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => void) => () => void
  onUpdateDownloaded: (callback: (info: { version: string; releaseDate?: string; releaseNotes?: string }) => void) => () => void
  onUpdateError: (callback: (error: string) => void) => () => void

  // ============ Kiro Settings Management API ============

  // Get Kiro settings
  getKiroSettings: () => Promise<{
    settings?: Record<string, unknown>
    mcpConfig?: { mcpServers: Record<string, unknown> }
    steeringFiles?: string[]
    error?: string
  }>

  // Save Kiro settings
  saveKiroSettings: (settings: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>

  // Open Kiro MCP config file
  openKiroMcpConfig: (type: 'user' | 'workspace') => Promise<{ success: boolean; error?: string }>

  // Open Kiro Steering folder
  openKiroSteeringFolder: () => Promise<{ success: boolean; error?: string }>

  // Open Kiro settings.json file
  openKiroSettingsFile: () => Promise<{ success: boolean; error?: string }>

  // Open specified Steering file
  openKiroSteeringFile: (filename: string) => Promise<{ success: boolean; error?: string }>

  // Create default rules.md file
  createKiroDefaultRules: () => Promise<{ success: boolean; error?: string }>

  // Read Steering file content
  readKiroSteeringFile: (filename: string) => Promise<{ success: boolean; content?: string; error?: string }>

  // Save Steering file content
  saveKiroSteeringFile: (filename: string, content: string) => Promise<{ success: boolean; error?: string }>

  // Delete Steering file
  deleteKiroSteeringFile: (filename: string) => Promise<{ success: boolean; error?: string }>

  // ============ MCP Server Management ============

  // Save MCP server config
  saveMcpServer: (name: string, config: { command: string; args?: string[]; env?: Record<string, string> }, oldName?: string) => Promise<{ success: boolean; error?: string }>

  // Delete MCP server
  deleteMcpServer: (name: string) => Promise<{ success: boolean; error?: string }>

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
  }) => Promise<{
    success: boolean
    ssoToken?: string
    name?: string
    error?: string
  }>

  // Activate Outlook email only
  activateOutlook: (params: {
    email: string
    emailPassword: string
  }) => Promise<{
    success: boolean
    error?: string
  }>

  // Listen for auto-register logs
  onAutoRegisterLog: (callback: (data: { email: string; message: string }) => void) => () => void

  // Get Outlook email verification code
  getOutlookVerificationCode: (params: {
    email: string
    refreshToken: string
    clientId: string
    senderFilter?: string[]
    minutes?: number
    timeout?: number
  }) => Promise<{
    success: boolean
    code?: string
    error?: string
  }>

  // Open file selection dialog
  openFile: (options?: {
    filters?: Array<{ name: string; extensions: string[] }>
  }) => Promise<{ content: string; path: string } | null>

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
  }) => Promise<{
    success: boolean
    imported?: number
    failed?: number
    errors?: string[]
    error?: string
  }>

  // Test Kiro server connection
  testKiroServerConnection: (serverUrl: string, password: string) => Promise<{
    success: boolean
    token?: string
    error?: string
  }>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: KiroApi
  }
}
