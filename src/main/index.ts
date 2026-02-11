import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'
import * as machineIdModule from './machineId'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { writeFile, readFile } from 'fs/promises'
import { encode, decode } from 'cbor-x'
import icon from '../../resources/icon.png?asset'

// ============ Auto Update Configuration ============
autoUpdater.autoDownload = false  // Don't auto-download updates
autoUpdater.autoInstallOnAppQuit = false  // Don't auto-install on quit (optional)

function setupAutoUpdater(): void {
  // Update check error
  autoUpdater.on('error', (error) => {
    console.error('[AutoUpdater] Error:', error)
    mainWindow?.webContents.send('update-error', error.message)
  })

  // Checking for updates
  autoUpdater.on('checking-for-update', () => {
    console.log('[AutoUpdater] Checking for update...')
    mainWindow?.webContents.send('update-checking')
  })

  // Update available
  autoUpdater.on('update-available', (info) => {
    console.log('[AutoUpdater] Update available:', info.version)
    mainWindow?.webContents.send('update-available', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes
    })
  })

  // No update available
  autoUpdater.on('update-not-available', (info) => {
    console.log('[AutoUpdater] No update available, current:', info.version)
    mainWindow?.webContents.send('update-not-available', { version: info.version })
  })

  // Download progress
  autoUpdater.on('download-progress', (progress) => {
    console.log(`[AutoUpdater] Download progress: ${progress.percent.toFixed(1)}%`)
    mainWindow?.webContents.send('update-download-progress', {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total
    })
  })

  // Download complete
  autoUpdater.on('update-downloaded', (info) => {
    console.log('[AutoUpdater] Update downloaded:', info.version)
    mainWindow?.webContents.send('update-downloaded', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes
    })
  })
}

// ============ Kiro API Calls ============
const KIRO_API_BASE = 'https://app.kiro.dev/service/KiroWebPortalService/operation'

// ============ OIDC Token Refresh ============
interface OidcRefreshResult {
  success: boolean
  accessToken?: string
  refreshToken?: string
  expiresIn?: number
  error?: string
}

// Social login (GitHub/Google) token refresh endpoint
const KIRO_AUTH_ENDPOINT = 'https://prod.us-east-1.auth.desktop.kiro.dev'

// ============ Proxy Settings ============

// Set proxy environment variables
function applyProxySettings(enabled: boolean, url: string): void {
  if (enabled && url) {
    process.env.HTTP_PROXY = url
    process.env.HTTPS_PROXY = url
    process.env.http_proxy = url
    process.env.https_proxy = url
    console.log(`[Proxy] Enabled: ${url}`)
  } else {
    delete process.env.HTTP_PROXY
    delete process.env.HTTPS_PROXY
    delete process.env.http_proxy
    delete process.env.https_proxy
    console.log('[Proxy] Disabled')
  }
}

// IdC (BuilderId) OIDC Token Refresh
async function refreshOidcToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
  region: string = 'us-east-1'
): Promise<OidcRefreshResult> {
  console.log(`[OIDC] Refreshing token with clientId: ${clientId.substring(0, 20)}...`)
  
  const url = `https://oidc.${region}.amazonaws.com/token`
  
  const payload = {
    clientId,
    clientSecret,
    refreshToken,
    grantType: 'refresh_token'
  }
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[OIDC] Refresh failed: ${response.status} - ${errorText}`)
      return { success: false, error: `HTTP ${response.status}: ${errorText}` }
    }
    
    const data = await response.json()
    console.log(`[OIDC] Token refreshed successfully, expires in ${data.expiresIn}s`)
    
    return {
      success: true,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken || refreshToken, // May not return new refreshToken
      expiresIn: data.expiresIn
    }
  } catch (error) {
    console.error(`[OIDC] Refresh error:`, error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

// Social login (GitHub/Google) Token Refresh
async function refreshSocialToken(refreshToken: string): Promise<OidcRefreshResult> {
  console.log(`[Social] Refreshing token...`)
  
  const url = `${KIRO_AUTH_ENDPOINT}/refreshToken`
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'kiro-account-manager/1.0.0'
      },
      body: JSON.stringify({ refreshToken })
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[Social] Refresh failed: ${response.status} - ${errorText}`)
      return { success: false, error: `HTTP ${response.status}: ${errorText}` }
    }
    
    const data = await response.json()
    console.log(`[Social] Token refreshed successfully, expires in ${data.expiresIn}s`)
    
    return {
      success: true,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken || refreshToken,
      expiresIn: data.expiresIn
    }
  } catch (error) {
    console.error(`[Social] Refresh error:`, error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

// Generic Token Refresh - Choose refresh method based on authMethod
async function refreshTokenByMethod(
  token: string,
  clientId: string,
  clientSecret: string,
  region: string = 'us-east-1',
  authMethod?: string
): Promise<OidcRefreshResult> {
  // For social login, use Kiro Auth Service refresh
  if (authMethod === 'social') {
    return refreshSocialToken(token)
  }
  // Otherwise use OIDC refresh (IdC/BuilderId)
  return refreshOidcToken(token, clientId, clientSecret, region)
}

function generateInvocationId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// ============ AWS SSO Device Authorization Flow ============
interface SsoAuthResult {
  success: boolean
  accessToken?: string
  refreshToken?: string
  clientId?: string
  clientSecret?: string
  region?: string
  expiresIn?: number
  error?: string
}

async function ssoDeviceAuth(bearerToken: string, region: string = 'us-east-1'): Promise<SsoAuthResult> {
  const oidcBase = `https://oidc.${region}.amazonaws.com`
  const portalBase = 'https://portal.sso.us-east-1.amazonaws.com'
  const startUrl = 'https://view.awsapps.com/start'
  const scopes = ['codewhisperer:analysis', 'codewhisperer:completions', 'codewhisperer:conversations', 'codewhisperer:taskassist', 'codewhisperer:transformations']

  let clientId: string, clientSecret: string
  let deviceCode: string, userCode: string
  let deviceSessionToken: string
  let interval = 1

  // Step 1: Register OIDC client
  console.log('[SSO] Step 1: Registering OIDC client...')
  try {
    const regRes = await fetch(`${oidcBase}/client/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientName: 'Kiro Account Manager',
        clientType: 'public',
        scopes,
        grantTypes: ['urn:ietf:params:oauth:grant-type:device_code', 'refresh_token'],
        issuerUrl: startUrl
      })
    })
    if (!regRes.ok) throw new Error(`Register failed: ${regRes.status}`)
    const regData = await regRes.json() as { clientId: string; clientSecret: string }
    clientId = regData.clientId
    clientSecret = regData.clientSecret
    console.log(`[SSO] Client registered: ${clientId.substring(0, 30)}...`)
  } catch (e) {
    return { success: false, error: `Client registration failed: ${e}` }
  }

  // Step 2: Start device authorization
  console.log('[SSO] Step 2: Starting device authorization...')
  try {
    const devRes = await fetch(`${oidcBase}/device_authorization`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, clientSecret, startUrl })
    })
    if (!devRes.ok) throw new Error(`Device auth failed: ${devRes.status}`)
    const devData = await devRes.json() as { deviceCode: string; userCode: string; interval?: number }
    deviceCode = devData.deviceCode
    userCode = devData.userCode
    interval = devData.interval || 1
    console.log(`[SSO] Device code obtained, user_code: ${userCode}`)
  } catch (e) {
    return { success: false, error: `Device authorization failed: ${e}` }
  }

  // Step 3: Verify Bearer Token (whoAmI)
  console.log('[SSO] Step 3: Verifying bearer token...')
  try {
    const whoRes = await fetch(`${portalBase}/token/whoAmI`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${bearerToken}`, 'Accept': 'application/json' }
    })
    if (!whoRes.ok) throw new Error(`whoAmI failed: ${whoRes.status}`)
    console.log('[SSO] Bearer token verified')
  } catch (e) {
    return { success: false, error: `Token verification failed: ${e}` }
  }

  // Step 4: Get device session token
  console.log('[SSO] Step 4: Getting device session token...')
  try {
    const sessRes = await fetch(`${portalBase}/session/device`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${bearerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    })
    if (!sessRes.ok) throw new Error(`Device session failed: ${sessRes.status}`)
    const sessData = await sessRes.json() as { token: string }
    deviceSessionToken = sessData.token
    console.log('[SSO] Device session token obtained')
  } catch (e) {
    return { success: false, error: `Device session failed: ${e}` }
  }

  // Step 5: Accept user code
  console.log('[SSO] Step 5: Accepting user code...')
  let deviceContext: { deviceContextId?: string; clientId?: string; clientType?: string } | null = null
  try {
    const acceptRes = await fetch(`${oidcBase}/device_authorization/accept_user_code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Referer': 'https://view.awsapps.com/' },
      body: JSON.stringify({ userCode, userSessionId: deviceSessionToken })
    })
    if (!acceptRes.ok) throw new Error(`Accept user code failed: ${acceptRes.status}`)
    const acceptData = await acceptRes.json() as { deviceContext?: { deviceContextId?: string; clientId?: string; clientType?: string } }
    deviceContext = acceptData.deviceContext || null
    console.log('[SSO] User code accepted')
  } catch (e) {
    return { success: false, error: `Accept user code failed: ${e}` }
  }

  // Step 6: Approve authorization
  if (deviceContext?.deviceContextId) {
    console.log('[SSO] Step 6: Approving authorization...')
    try {
      const approveRes = await fetch(`${oidcBase}/device_authorization/associate_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Referer': 'https://view.awsapps.com/' },
        body: JSON.stringify({
          deviceContext: {
            deviceContextId: deviceContext.deviceContextId,
            clientId: deviceContext.clientId || clientId,
            clientType: deviceContext.clientType || 'public'
          },
          userSessionId: deviceSessionToken
        })
      })
      if (!approveRes.ok) throw new Error(`Approve failed: ${approveRes.status}`)
      console.log('[SSO] Authorization approved')
    } catch (e) {
      return { success: false, error: `Authorization approval failed: ${e}` }
    }
  }

  // Step 7: Poll for token
  console.log('[SSO] Step 7: Polling for token...')
  const startTime = Date.now()
  const timeout = 120000 // 2 minute timeout

  while (Date.now() - startTime < timeout) {
    await new Promise(r => setTimeout(r, interval * 1000))
    
    try {
      const tokenRes = await fetch(`${oidcBase}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          clientSecret,
          grantType: 'urn:ietf:params:oauth:grant-type:device_code',
          deviceCode
        })
      })

      if (tokenRes.ok) {
        const tokenData = await tokenRes.json() as { accessToken: string; refreshToken: string; expiresIn?: number }
        console.log('[SSO] Token obtained successfully!')
        return {
          success: true,
          accessToken: tokenData.accessToken,
          refreshToken: tokenData.refreshToken,
          clientId,
          clientSecret,
          region,
          expiresIn: tokenData.expiresIn
        }
      }

      if (tokenRes.status === 400) {
        const errData = await tokenRes.json() as { error?: string }
        if (errData.error === 'authorization_pending') {
          continue // Continue polling
        } else if (errData.error === 'slow_down') {
          interval += 5
        } else {
          return { success: false, error: `Token fetch failed: ${errData.error}` }
        }
      }
    } catch (e) {
      console.error('[SSO] Token poll error:', e)
    }
  }

  return { success: false, error: 'Authorization timeout, please retry' }
}

async function kiroApiRequest<T>(
  operation: string,
  body: Record<string, unknown>,
  accessToken: string,
  idp: string = 'BuilderId'  // Supports BuilderId, Github, Google
): Promise<T> {
  console.log(`[Kiro API] Calling ${operation}`)
  console.log(`[Kiro API] Body:`, JSON.stringify(body))
  console.log(`[Kiro API] AccessToken length:`, accessToken?.length)
  console.log(`[Kiro API] AccessToken (first 100 chars):`, accessToken?.substring(0, 100))
  console.log(`[Kiro API] AccessToken (last 50 chars):`, accessToken?.substring(accessToken.length - 50))
  console.log(`[Kiro API] Idp:`, idp)

  const response = await fetch(`${KIRO_API_BASE}/${operation}`, {
    method: 'POST',
    headers: {
      'accept': 'application/cbor',
      'content-type': 'application/cbor',
      'smithy-protocol': 'rpc-v2-cbor',
      'amz-sdk-invocation-id': generateInvocationId(),
      'amz-sdk-request': 'attempt=1; max=1',
      'x-amz-user-agent': 'aws-sdk-js/1.0.0 kiro-account-manager/1.0.0',
      'authorization': `Bearer ${accessToken}`,
      'cookie': `Idp=${idp}; AccessToken=${accessToken}`
    },
    body: Buffer.from(encode(body))
  })

  console.log(`[Kiro API] Response status: ${response.status}`)

  if (!response.ok) {
    // Try to parse CBOR format error response
    let errorMessage = `HTTP ${response.status}`
    const errorBuffer = await response.arrayBuffer()
    try {
      const errorData = decode(Buffer.from(errorBuffer)) as { __type?: string; message?: string }
      if (errorData.__type && errorData.message) {
        // Extract error type name (remove namespace)
        const errorType = errorData.__type.split('#').pop() || errorData.__type
        errorMessage = `${errorType}: ${errorData.message}`
      } else if (errorData.message) {
        errorMessage = errorData.message
      }
      console.error(`[Kiro API] Error:`, errorData)
    } catch {
      // If CBOR parsing fails, show raw content
      const errorText = Buffer.from(errorBuffer).toString('utf-8')
      console.error(`[Kiro API] Error (raw): ${errorText}`)
    }
    throw new Error(errorMessage)
  }

  const arrayBuffer = await response.arrayBuffer()
  const result = decode(Buffer.from(arrayBuffer)) as T
  console.log(`[Kiro API] Response:`, JSON.stringify(result, null, 2))
  return result
}

// GetUserInfo API - Only requires accessToken to call
interface UserInfoResponse {
  email?: string
  userId?: string
  idp?: string
  status?: string
  featureFlags?: string[]
}

async function getUserInfo(accessToken: string, idp: string = 'BuilderId'): Promise<UserInfoResponse> {
  return kiroApiRequest<UserInfoResponse>('GetUserInfo', { origin: 'KIRO_IDE' }, accessToken, idp)
}

// Define custom protocol
const PROTOCOL_PREFIX = 'kiro'

// electron-store instance (lazy initialization)
let store: {
  get: (key: string, defaultValue?: unknown) => unknown
  set: (key: string, value: unknown) => void
  path: string
} | null = null

// Last saved data (for crash recovery)
let lastSavedData: unknown = null

async function initStore(): Promise<void> {
  if (store) return
  const Store = (await import('electron-store')).default
  const fs = await import('fs/promises')
  const path = await import('path')
  
  const storeInstance = new Store({
    name: 'kiro-accounts',
    encryptionKey: 'kiro-account-manager-secret-key'
  })
  
  store = storeInstance as unknown as typeof store
  
  // Try to restore data from backup (if main data is corrupted)
  try {
    const backupPath = path.join(path.dirname(storeInstance.path), 'kiro-accounts.backup.json')
    const mainData = storeInstance.get('accountData')
    
    if (!mainData) {
      // Main data doesn't exist or is corrupted, try to restore from backup
      try {
        const backupContent = await fs.readFile(backupPath, 'utf-8')
        const backupData = JSON.parse(backupContent)
        if (backupData && backupData.accounts) {
          console.log('[Store] Restoring data from backup...')
          storeInstance.set('accountData', backupData)
          console.log('[Store] Data restored from backup successfully')
        }
      } catch {
        // Backup doesn't exist either, ignore
      }
    }
  } catch (error) {
    console.error('[Store] Error checking backup:', error)
  }
}

// Create data backup
async function createBackup(data: unknown): Promise<void> {
  if (!store) return
  
  try {
    const fs = await import('fs/promises')
    const path = await import('path')
    const backupPath = path.join(path.dirname(store.path), 'kiro-accounts.backup.json')
    
    await fs.writeFile(backupPath, JSON.stringify(data, null, 2), 'utf-8')
    console.log('[Backup] Data backup created')
  } catch (error) {
    console.error('[Backup] Failed to create backup:', error)
  }
}

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    title: `Kiro Account Manager v${app.getVersion()}`,
    width: 1200,   // Just enough for 3 card columns (340*3 + 16*2 + margins)
    height: 1000,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    // Set title with version number (HTML load will override initial title)
    mainWindow?.setTitle(`Kiro Account Manager v${app.getVersion()}`)
    mainWindow?.show()
  })

  mainWindow.on('close', async () => {
    // Save data before window closes
    if (lastSavedData && store) {
      try {
        console.log('[Window] Saving data before close...')
        store.set('accountData', lastSavedData)
        await createBackup(lastSavedData)
        console.log('[Window] Data saved successfully')
      } catch (error) {
        console.error('[Window] Failed to save data:', error)
      }
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Register custom protocol
function registerProtocol(): void {
  // Unregister old registration first (prevent issues from abnormal exit)
  unregisterProtocol()
  
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(PROTOCOL_PREFIX, process.execPath, [
        join(process.argv[1])
      ])
    }
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL_PREFIX)
  }
  console.log(`[Protocol] Registered ${PROTOCOL_PREFIX}:// protocol`)
}

// Unregister custom protocol (called on app exit)
function unregisterProtocol(): void {
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.removeAsDefaultProtocolClient(PROTOCOL_PREFIX, process.execPath, [
        join(process.argv[1])
      ])
    }
  } else {
    app.removeAsDefaultProtocolClient(PROTOCOL_PREFIX)
  }
  console.log(`[Protocol] Unregistered ${PROTOCOL_PREFIX}:// protocol`)
}

// Handle protocol URL (for OAuth callback)
function handleProtocolUrl(url: string): void {
  if (!url.startsWith(`${PROTOCOL_PREFIX}://`)) return

  try {
    const urlObj = new URL(url)
    const pathname = urlObj.pathname.replace(/^\/+/, '')

    // Handle auth callback
    if (pathname === 'auth/callback' || urlObj.host === 'auth') {
      const code = urlObj.searchParams.get('code')
      const state = urlObj.searchParams.get('state')

      if (code && state && mainWindow) {
        mainWindow.webContents.send('auth-callback', { code, state })
        mainWindow.focus()
      }
    }
  } catch (error) {
    console.error('Failed to parse protocol URL:', error)
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Register custom protocol
  registerProtocol()

  // Initialize auto-updater (production only)
  if (!is.dev) {
    setupAutoUpdater()
    // Delayed update check after startup
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(console.error)
    }, 3000)
  }

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.kiro.account-manager')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC: Open external link
  ipcMain.on('open-external', (_event, url: string) => {
    if (typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
      shell.openExternal(url)
    }
  })

  // IPC: Get app version
  ipcMain.handle('get-app-version', () => {
    return app.getVersion()
  })

  // ============ Kiro Process Management ============
  
  // IPC: Check if Kiro process is running
  ipcMain.handle('check-kiro-running', async () => {
    const { exec } = await import('child_process')
    const { promisify } = await import('util')
    const execAsync = promisify(exec)
    
    try {
      if (process.platform === 'win32') {
        const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq Kiro.exe" /NH')
        return { running: stdout.toLowerCase().includes('kiro.exe') }
      } else if (process.platform === 'darwin') {
        const { stdout } = await execAsync('pgrep -x Kiro')
        return { running: stdout.trim().length > 0 }
      } else {
        const { stdout } = await execAsync('pgrep -x kiro')
        return { running: stdout.trim().length > 0 }
      }
    } catch {
      return { running: false }
    }
  })

  // IPC: Auto-detect Kiro installation path
  ipcMain.handle('detect-kiro-path', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const os = await import('os')
    
    const possiblePaths: string[] = []
    
    if (process.platform === 'win32') {
      // Windows common installation paths
      const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
      const programFiles = process.env.PROGRAMFILES || 'C:\\Program Files'
      const programFilesX86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)'
      
      possiblePaths.push(
        path.join(localAppData, 'Programs', 'Kiro', 'Kiro.exe'),
        path.join(localAppData, 'Kiro', 'Kiro.exe'),
        path.join(programFiles, 'Kiro', 'Kiro.exe'),
        path.join(programFilesX86, 'Kiro', 'Kiro.exe'),
        path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Kiro', 'Kiro.exe')
      )
    } else if (process.platform === 'darwin') {
      // macOS common installation paths
      possiblePaths.push(
        '/Applications/Kiro.app/Contents/MacOS/Kiro',
        path.join(os.homedir(), 'Applications', 'Kiro.app', 'Contents', 'MacOS', 'Kiro')
      )
    } else {
      // Linux common installation paths
      possiblePaths.push(
        '/usr/bin/kiro',
        '/usr/local/bin/kiro',
        '/opt/Kiro/kiro',
        path.join(os.homedir(), '.local', 'bin', 'kiro'),
        '/snap/bin/kiro',
        '/var/lib/flatpak/exports/bin/kiro'
      )
    }
    
    for (const p of possiblePaths) {
      try {
        if (fs.existsSync(p)) {
          console.log('[Kiro] Found at:', p)
          return { success: true, path: p }
        }
      } catch {
        continue
      }
    }
    
    console.log('[Kiro] Not found in common paths')
    return { success: false, path: '' }
  })

  // IPC: Launch Kiro
  ipcMain.handle('launch-kiro', async (_event, kiroPath: string) => {
    const { spawn } = await import('child_process')
    
    try {
      if (!kiroPath) {
        return { success: false, error: 'Kiro path not set' }
      }
      
      const fs = await import('fs')
      if (!fs.existsSync(kiroPath)) {
        return { success: false, error: 'Kiro executable does not exist' }
      }
      
      console.log('[Kiro] Launching:', kiroPath)
      
      // Use detached mode to launch without blocking current process
      const child = spawn(kiroPath, [], {
        detached: true,
        stdio: 'ignore'
      })
      child.unref()
      
      return { success: true }
    } catch (error) {
      console.error('[Kiro] Launch error:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Launch failed' }
    }
  })

  // IPC: Select Kiro executable file
  ipcMain.handle('select-kiro-path', async () => {
    const filters = process.platform === 'win32'
      ? [{ name: 'Executable', extensions: ['exe'] }]
      : process.platform === 'darwin'
        ? [{ name: 'Application', extensions: ['app'] }]
        : [{ name: 'All Files', extensions: ['*'] }]
    
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Select Kiro Executable',
      filters,
      properties: ['openFile']
    })
    
    if (!result.canceled && result.filePaths.length > 0) {
      let selectedPath = result.filePaths[0]
      
      // macOS: If .app is selected, auto-locate actual executable
      if (process.platform === 'darwin' && selectedPath.endsWith('.app')) {
        selectedPath = join(selectedPath, 'Contents', 'MacOS', 'Kiro')
      }
      
      return { success: true, path: selectedPath }
    }
    
    return { success: false, path: '' }
  })

  // IPC: Check for updates
  ipcMain.handle('check-for-updates', async () => {
    if (is.dev) {
      return { hasUpdate: false, message: 'Update check not supported in development' }
    }
    try {
      const result = await autoUpdater.checkForUpdates()
      return {
        hasUpdate: !!result?.updateInfo,
        version: result?.updateInfo?.version,
        releaseDate: result?.updateInfo?.releaseDate
      }
    } catch (error) {
      console.error('[AutoUpdater] Check failed:', error)
      return { hasUpdate: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // IPC: Download update
  ipcMain.handle('download-update', async () => {
    if (is.dev) {
      return { success: false, message: 'Updates not supported in development' }
    }
    try {
      await autoUpdater.downloadUpdate()
      return { success: true }
    } catch (error) {
      console.error('[AutoUpdater] Download failed:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // IPC: Install update and restart
  ipcMain.handle('install-update', () => {
    autoUpdater.quitAndInstall(false, true)
  })

  // IPC: Manual update check (using GitHub API, for AboutPage)
  const GITHUB_REPO = 'chaogei/Kiro-account-manager'
  const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`
  
  ipcMain.handle('check-for-updates-manual', async () => {
    try {
      console.log('[Update] Manual check via GitHub API...')
      const currentVersion = app.getVersion()
      
      const response = await fetch(GITHUB_API_URL, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Kiro-Account-Manager'
        }
      })
      
      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('GitHub API rate limit exceeded, please try again later')
        } else if (response.status === 404) {
          throw new Error('No release found')
        }
        throw new Error(`GitHub API error: ${response.status}`)
      }
      
      const release = await response.json() as {
        tag_name: string
        name: string
        body: string
        html_url: string
        published_at: string
        assets: Array<{
          name: string
          browser_download_url: string
          size: number
        }>
      }
      
      const latestVersion = release.tag_name.replace(/^v/, '')
      
      // Compare versions
      const compareVersions = (v1: string, v2: string): number => {
        const parts1 = v1.split('.').map(Number)
        const parts2 = v2.split('.').map(Number)
        for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
          const p1 = parts1[i] || 0
          const p2 = parts2[i] || 0
          if (p1 > p2) return 1
          if (p1 < p2) return -1
        }
        return 0
      }
      
      const hasUpdate = compareVersions(latestVersion, currentVersion) > 0
      
      console.log(`[Update] Current: ${currentVersion}, Latest: ${latestVersion}, HasUpdate: ${hasUpdate}`)
      
      return {
        hasUpdate,
        currentVersion,
        latestVersion,
        releaseNotes: release.body || '',
        releaseName: release.name || `v${latestVersion}`,
        releaseUrl: release.html_url,
        publishedAt: release.published_at,
        assets: release.assets.map(a => ({
          name: a.name,
          downloadUrl: a.browser_download_url,
          size: a.size
        }))
      }
    } catch (error) {
      console.error('[Update] Manual check failed:', error)
      return {
        hasUpdate: false,
        error: error instanceof Error ? error.message : 'Update check failed'
      }
    }
  })

  // IPC: Load account data
  ipcMain.handle('load-accounts', async () => {
    try {
      await initStore()
      return store!.get('accountData', null)
    } catch (error) {
      console.error('Failed to load accounts:', error)
      return null
    }
  })

  // IPC: Save account data
  ipcMain.handle('save-accounts', async (_event, data) => {
    try {
      await initStore()
      store!.set('accountData', data)
      
      // Save last data (for crash recovery)
      lastSavedData = data
      
      // Create backup on each save
      await createBackup(data)
    } catch (error) {
      console.error('Failed to save accounts:', error)
      throw error
    }
  })

  // IPC: Refresh account token (supports IdC and social login)
  ipcMain.handle('refresh-account-token', async (_event, account) => {
    try {
      const { refreshToken, clientId, clientSecret, region, authMethod } = account.credentials || {}

      if (!refreshToken) {
        return { success: false, error: { message: 'Missing Refresh Token' } }
      }

      // Social login only needs refreshToken, IdC login needs clientId and clientSecret
      if (authMethod !== 'social' && (!clientId || !clientSecret)) {
        return { success: false, error: { message: 'Missing OIDC refresh credentials (clientId/clientSecret)' } }
      }

      console.log(`[IPC] Refreshing token (authMethod: ${authMethod || 'IdC'})...`)

      // Choose refresh method based on authMethod
      const refreshResult = await refreshTokenByMethod(
        refreshToken,
        clientId || '',
        clientSecret || '',
        region || 'us-east-1',
        authMethod
      )

      if (!refreshResult.success || !refreshResult.accessToken) {
        return { success: false, error: { message: refreshResult.error || 'Token refresh failed' } }
      }

      return {
        success: true,
        data: {
          accessToken: refreshResult.accessToken,
          refreshToken: refreshResult.refreshToken || refreshToken,
          expiresIn: refreshResult.expiresIn ?? 3600
        }
      }
    } catch (error) {
      return {
        success: false,
        error: { message: error instanceof Error ? error.message : 'Unknown error' }
      }
    }
  })

  // IPC: Import account from SSO Token (x-amz-sso_authn)
  ipcMain.handle('import-from-sso-token', async (_event, bearerToken: string, region: string = 'us-east-1') => {
    console.log('[IPC] import-from-sso-token called')
    
    try {
      // Execute SSO device authorization flow
      const ssoResult = await ssoDeviceAuth(bearerToken, region)
      
      if (!ssoResult.success || !ssoResult.accessToken) {
        return { success: false, error: { message: ssoResult.error || 'SSO authorization failed' } }
      }

      // Fetch user info and usage in parallel
      interface UsageBreakdownItem {
        resourceType?: string
        currentUsage?: number
        usageLimit?: number
        displayName?: string
        displayNamePlural?: string
        currency?: string
        unit?: string
        overageRate?: number
        overageCap?: number
        freeTrialInfo?: { currentUsage?: number; usageLimit?: number; freeTrialExpiry?: string; freeTrialStatus?: string }
        bonuses?: Array<{ bonusCode?: string; displayName?: string; currentUsage?: number; usageLimit?: number; expiresAt?: string }>
      }
      interface UsageApiResponse {
        userInfo?: { email?: string; userId?: string }
        subscriptionInfo?: { type?: string; subscriptionTitle?: string; upgradeCapability?: string; overageCapability?: string; subscriptionManagementTarget?: string }
        usageBreakdownList?: UsageBreakdownItem[]
        nextDateReset?: string
        overageConfiguration?: { overageEnabled?: boolean }
      }

      let userInfo: UserInfoResponse | undefined
      let usageData: UsageApiResponse | undefined

      try {
        console.log('[SSO] Fetching user info and usage data...')
        const [userInfoResult, usageResult] = await Promise.all([
          getUserInfo(ssoResult.accessToken).catch(e => { console.error('[SSO] getUserInfo failed:', e); return undefined }),
          kiroApiRequest<UsageApiResponse>('GetUserUsageAndLimits', { isEmailRequired: true, origin: 'KIRO_IDE' }, ssoResult.accessToken).catch(e => { console.error('[SSO] GetUserUsageAndLimits failed:', e); return undefined })
        ])
        userInfo = userInfoResult
        usageData = usageResult
        console.log('[SSO] userInfo:', userInfo?.email)
        console.log('[SSO] usageData:', usageData?.subscriptionInfo?.subscriptionTitle)
      } catch (e) {
        console.error('[IPC] API calls failed:', e)
      }

      // Parse usage data
      const creditUsage = usageData?.usageBreakdownList?.find(b => b.resourceType === 'CREDIT')
      const subscriptionTitle = usageData?.subscriptionInfo?.subscriptionTitle || 'KIRO'
      
      // Normalize subscription type
      let subscriptionType = 'Free'
      if (subscriptionTitle.toUpperCase().includes('PRO')) {
        subscriptionType = 'Pro'
      } else if (subscriptionTitle.toUpperCase().includes('ENTERPRISE')) {
        subscriptionType = 'Enterprise'
      } else if (subscriptionTitle.toUpperCase().includes('TEAMS')) {
        subscriptionType = 'Teams'
      }

      // Base quota
      const baseLimit = creditUsage?.usageLimit ?? 0
      const baseCurrent = creditUsage?.currentUsage ?? 0

      // Trial quota
      let freeTrialLimit = 0, freeTrialCurrent = 0, freeTrialExpiry: string | undefined
      if (creditUsage?.freeTrialInfo?.freeTrialStatus === 'ACTIVE') {
        freeTrialLimit = creditUsage.freeTrialInfo.usageLimit ?? 0
        freeTrialCurrent = creditUsage.freeTrialInfo.currentUsage ?? 0
        freeTrialExpiry = creditUsage.freeTrialInfo.freeTrialExpiry
      }

      // Bonus quota
      const bonuses = (creditUsage?.bonuses || []).map(b => ({
        code: b.bonusCode || '',
        name: b.displayName || '',
        current: b.currentUsage ?? 0,
        limit: b.usageLimit ?? 0,
        expiresAt: b.expiresAt
      }))

      const totalLimit = baseLimit + freeTrialLimit + bonuses.reduce((s, b) => s + b.limit, 0)
      const totalCurrent = baseCurrent + freeTrialCurrent + bonuses.reduce((s, b) => s + b.current, 0)

      return {
        success: true,
        data: {
          accessToken: ssoResult.accessToken,
          refreshToken: ssoResult.refreshToken,
          clientId: ssoResult.clientId,
          clientSecret: ssoResult.clientSecret,
          region: ssoResult.region,
          expiresIn: ssoResult.expiresIn,
          email: usageData?.userInfo?.email || userInfo?.email,
          userId: usageData?.userInfo?.userId || userInfo?.userId,
          idp: userInfo?.idp || 'BuilderId',
          status: userInfo?.status,
          subscriptionType,
          subscriptionTitle,
          subscription: {
            managementTarget: usageData?.subscriptionInfo?.subscriptionManagementTarget,
            upgradeCapability: usageData?.subscriptionInfo?.upgradeCapability,
            overageCapability: usageData?.subscriptionInfo?.overageCapability
          },
          usage: {
            current: totalCurrent,
            limit: totalLimit,
            baseLimit,
            baseCurrent,
            freeTrialLimit,
            freeTrialCurrent,
            freeTrialExpiry,
            bonuses,
            nextResetDate: usageData?.nextDateReset,
            resourceDetail: creditUsage ? {
              displayName: creditUsage.displayName,
              displayNamePlural: creditUsage.displayNamePlural,
              resourceType: creditUsage.resourceType,
              currency: creditUsage.currency,
              unit: creditUsage.unit,
              overageRate: creditUsage.overageRate,
              overageCap: creditUsage.overageCap,
              overageEnabled: usageData?.overageConfiguration?.overageEnabled
            } : undefined
          },
          daysRemaining: usageData?.nextDateReset ? Math.max(0, Math.ceil((new Date(usageData.nextDateReset).getTime() - Date.now()) / 86400000)) : undefined
        }
      }
    } catch (error) {
      console.error('[IPC] import-from-sso-token error:', error)
      return {
        success: false,
        error: { message: error instanceof Error ? error.message : 'Unknown error' }
      }
    }
  })

  // IPC: Check account status (supports auto token refresh)
  ipcMain.handle('check-account-status', async (_event, account) => {
    console.log('[IPC] check-account-status called')
    console.log('[IPC] Account email:', account?.email)
    console.log('[IPC] Has credentials:', !!account?.credentials)

    interface Bonus {
      bonusCode?: string
      displayName?: string
      usageLimit?: number
      currentUsage?: number
      status?: string
      expiresAt?: string  // API returns expiresAt
    }

    interface FreeTrialInfo {
      usageLimit?: number
      currentUsage?: number
      freeTrialStatus?: string
      freeTrialExpiry?: string
    }

    interface UsageBreakdown {
      usageLimit?: number
      currentUsage?: number
      displayName?: string
      displayNamePlural?: string
      resourceType?: string
      currency?: string
      unit?: string
      overageRate?: number
      overageCap?: number
      bonuses?: Bonus[]
      freeTrialInfo?: FreeTrialInfo
    }

    interface SubscriptionInfo {
      subscriptionTitle?: string
      type?: string
      upgradeCapability?: string
      overageCapability?: string
      subscriptionManagementTarget?: string
    }

    interface UserInfo {
      email?: string
      userId?: string
    }

    interface OverageConfiguration {
      overageEnabled?: boolean
    }

    interface UsageResponse {
      daysUntilReset?: number
      nextDateReset?: string
      usageBreakdownList?: UsageBreakdown[]
      overageConfiguration?: OverageConfiguration
      subscriptionInfo?: SubscriptionInfo
      userInfo?: UserInfo
    }

    // Parse API response helper function
    const parseUsageResponse = (result: UsageResponse, newCredentials?: {
      accessToken: string
      refreshToken?: string
      expiresIn?: number
    }, userInfo?: UserInfoResponse) => {
      console.log('GetUserUsageAndLimits response:', JSON.stringify(result, null, 2))

      // Parse Credits usage (resourceType is CREDIT)
      const creditUsage = result.usageBreakdownList?.find(
        (b) => b.resourceType === 'CREDIT' || b.displayName === 'Credits'
      )

      // Parse usage (detailed)
      // Base quota
      const baseLimit = creditUsage?.usageLimit ?? 0
      const baseCurrent = creditUsage?.currentUsage ?? 0
      
      // Trial quota
      let freeTrialLimit = 0
      let freeTrialCurrent = 0
      let freeTrialExpiry: string | undefined
      if (creditUsage?.freeTrialInfo?.freeTrialStatus === 'ACTIVE') {
        freeTrialLimit = creditUsage.freeTrialInfo.usageLimit ?? 0
        freeTrialCurrent = creditUsage.freeTrialInfo.currentUsage ?? 0
        freeTrialExpiry = creditUsage.freeTrialInfo.freeTrialExpiry
      }
      
      // Bonus quota
      const bonusesData: { code: string; name: string; current: number; limit: number; expiresAt?: string }[] = []
      if (creditUsage?.bonuses) {
        for (const bonus of creditUsage.bonuses) {
          if (bonus.status === 'ACTIVE') {
            bonusesData.push({
              code: bonus.bonusCode || '',
              name: bonus.displayName || '',
              current: bonus.currentUsage ?? 0,
              limit: bonus.usageLimit ?? 0,
              expiresAt: bonus.expiresAt
            })
          }
        }
      }
      
      // Calculate total quota
      const totalLimit = baseLimit + freeTrialLimit + bonusesData.reduce((sum, b) => sum + b.limit, 0)
      const totalUsed = baseCurrent + freeTrialCurrent + bonusesData.reduce((sum, b) => sum + b.current, 0)
      const nextResetDate = result.nextDateReset

      // Parse subscription type
      const subscriptionTitle = result.subscriptionInfo?.subscriptionTitle ?? 'Free'
      let subscriptionType = account.subscription?.type ?? 'Free'
      if (subscriptionTitle.toUpperCase().includes('PRO')) {
        subscriptionType = 'Pro'
      } else if (subscriptionTitle.toUpperCase().includes('ENTERPRISE')) {
        subscriptionType = 'Enterprise'
      } else if (subscriptionTitle.toUpperCase().includes('TEAMS')) {
        subscriptionType = 'Teams'
      }

      // Parse reset time and calculate remaining days
      let expiresAt: number | undefined
      let daysRemaining: number | undefined
      if (result.nextDateReset) {
        expiresAt = new Date(result.nextDateReset).getTime()
        const now = Date.now()
        daysRemaining = Math.max(0, Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24)))
      }

      // Resource details
      const resourceDetail = creditUsage ? {
        resourceType: creditUsage.resourceType,
        displayName: creditUsage.displayName,
        displayNamePlural: creditUsage.displayNamePlural,
        currency: creditUsage.currency,
        unit: creditUsage.unit,
        overageRate: creditUsage.overageRate,
        overageCap: creditUsage.overageCap,
        overageEnabled: result.overageConfiguration?.overageEnabled ?? false
      } : undefined

      return {
        success: true,
        data: {
          status: userInfo?.status === 'Active' ? 'active' : (userInfo?.status ? 'error' : 'active'),
          email: result.userInfo?.email,
          userId: result.userInfo?.userId,
          idp: userInfo?.idp,
          userStatus: userInfo?.status,
          featureFlags: userInfo?.featureFlags,
          subscriptionTitle,
          usage: {
            current: totalUsed,
            limit: totalLimit,
            percentUsed: totalLimit > 0 ? totalUsed / totalLimit : 0,
            lastUpdated: Date.now(),
            baseLimit,
            baseCurrent,
            freeTrialLimit,
            freeTrialCurrent,
            freeTrialExpiry,
            bonuses: bonusesData,
            nextResetDate,
            resourceDetail
          },
          subscription: {
            type: subscriptionType,
            title: subscriptionTitle,
            rawType: result.subscriptionInfo?.type,
            expiresAt,
            daysRemaining,
            upgradeCapability: result.subscriptionInfo?.upgradeCapability,
            overageCapability: result.subscriptionInfo?.overageCapability,
            managementTarget: result.subscriptionInfo?.subscriptionManagementTarget
          },
          // If token was refreshed, return new credentials
          newCredentials: newCredentials ? {
            accessToken: newCredentials.accessToken,
            refreshToken: newCredentials.refreshToken,
            expiresAt: newCredentials.expiresIn 
              ? Date.now() + newCredentials.expiresIn * 1000 
              : undefined
          } : undefined
        }
      }
    }

    try {
      const { accessToken, refreshToken, clientId, clientSecret, region, authMethod, provider } = account.credentials || {}
      
      // Determine correct idp: prefer credentials.provider, fallback to account.idp
      // Social login uses actual provider (Github/Google), IdC uses BuilderId
      let idp = 'BuilderId'
      if (authMethod === 'social') {
        idp = provider || account.idp || 'BuilderId'
      } else if (provider) {
        idp = provider
      }

      if (!accessToken) {
        console.log('[IPC] Missing accessToken')
        return { success: false, error: { message: 'Missing accessToken' } }
      }

      // First attempt: Use current accessToken
      try {
        // Call GetUserInfo and GetUserUsageAndLimits in parallel
        const [userInfoResult, usageResult] = await Promise.all([
          getUserInfo(accessToken, idp).catch(() => undefined), // GetUserInfo failure doesn't affect overall flow
          kiroApiRequest<UsageResponse>(
            'GetUserUsageAndLimits',
            { isEmailRequired: true, origin: 'KIRO_IDE' },
            accessToken,
            idp
          )
        ])
        return parseUsageResponse(usageResult, undefined, userInfoResult)
      } catch (apiError) {
        const errorMsg = apiError instanceof Error ? apiError.message : ''
        
        // Check if it's a 401 error (token expired)
        // Social login only needs refreshToken, IdC login needs clientId and clientSecret
        const canRefresh = refreshToken && (authMethod === 'social' || (clientId && clientSecret))
        if (errorMsg.includes('401') && canRefresh) {
          console.log(`[IPC] Token expired, attempting to refresh (authMethod: ${authMethod || 'IdC'})...`)
          
          // Try to refresh token - choose refresh method based on authMethod
          const refreshResult = await refreshTokenByMethod(
            refreshToken,
            clientId || '',
            clientSecret || '',
            region || 'us-east-1',
            authMethod
          )
          
          if (refreshResult.success && refreshResult.accessToken) {
            console.log('[IPC] Token refreshed, retrying API call...')
            
            // Use new token to call GetUserInfo and GetUserUsageAndLimits in parallel
            const [userInfoResult, usageResult] = await Promise.all([
              getUserInfo(refreshResult.accessToken, idp).catch(() => undefined),
              kiroApiRequest<UsageResponse>(
                'GetUserUsageAndLimits',
                { isEmailRequired: true, origin: 'KIRO_IDE' },
                refreshResult.accessToken,
                idp
              )
            ])
            
            // Return result with new credentials
            return parseUsageResponse(usageResult, {
              accessToken: refreshResult.accessToken,
              refreshToken: refreshResult.refreshToken,
              expiresIn: refreshResult.expiresIn
            }, userInfoResult)
          } else {
            console.error('[IPC] Token refresh failed:', refreshResult.error)
            return {
              success: false,
              error: { message: `Token expired and refresh failed: ${refreshResult.error}` }
            }
          }
        }
        
        // Not 401 or no refresh credentials, throw original error
        throw apiError
      }
    } catch (error) {
      console.error('check-account-status error:', error)
      return {
        success: false,
        error: { message: error instanceof Error ? error.message : 'Unknown error' }
      }
    }
  })

  // IPC: Background batch refresh accounts (runs in main process, doesn't block UI)
  ipcMain.handle('background-batch-refresh', async (_event, accounts: Array<{
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
  }>, concurrency: number = 10) => {
    console.log(`[BackgroundRefresh] Starting batch refresh for ${accounts.length} accounts, concurrency: ${concurrency}`)
    
    let completed = 0
    let success = 0
    let failed = 0

    // Process each batch serially to avoid high concurrency
    for (let i = 0; i < accounts.length; i += concurrency) {
      const batch = accounts.slice(i, i + concurrency)
      
      await Promise.allSettled(
        batch.map(async (account) => {
          try {
            const { refreshToken, clientId, clientSecret, region, authMethod, accessToken } = account.credentials
            
            if (!refreshToken) {
              failed++
              completed++
              return
            }

            // Refresh Token
            const refreshResult = await refreshTokenByMethod(
              refreshToken,
              clientId || '',
              clientSecret || '',
              region || 'us-east-1',
              authMethod
            )

            if (!refreshResult.success) {
              failed++
              completed++
              // Notify renderer process of refresh failure
              mainWindow?.webContents.send('background-refresh-result', {
                id: account.id,
                success: false,
                error: refreshResult.error
              })
              return
            }

            // Get account info
            const newAccessToken = refreshResult.accessToken || accessToken
            if (!newAccessToken) {
              failed++
              completed++
              return
            }

            // Call API to get usage, subscription and user info (detect ban status)
            const [usageRes, subscriptionRes, userInfoRes] = await Promise.allSettled([
              fetch(KIRO_API_BASE, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${newAccessToken}`,
                  'X-Operation-Name': 'GetUserUsageAndLimits'
                },
                body: JSON.stringify({ isEmailRequired: true, origin: 'KIRO_IDE' })
              }),
              fetch(KIRO_API_BASE, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${newAccessToken}`,
                  'X-Operation-Name': 'GetSubscription'
                },
                body: JSON.stringify({})
              }),
              fetch(KIRO_API_BASE, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${newAccessToken}`,
                  'X-Operation-Name': 'GetUserInfo'
                },
                body: JSON.stringify({ origin: 'KIRO_IDE' })
              })
            ])

            // Parse responses
            let usageData = null
            let subscriptionData = null
            let userInfoData = null
            let status = 'active'
            let errorMessage: string | undefined

            // Check usage response (may return ban error, status code 423)
            if (usageRes.status === 'fulfilled') {
              const usageResponse = usageRes.value
              if (usageResponse.ok) {
                usageData = await usageResponse.json()
              } else {
                // Try to parse error response
                try {
                  const errorBody = await usageResponse.json()
                  console.log(`[BackgroundRefresh] Usage API error (${usageResponse.status}):`, errorBody)
                  if (errorBody.__type?.includes('AccountSuspendedException') || usageResponse.status === 423) {
                    status = 'error'
                    errorMessage = errorBody.message || 'AccountSuspendedException: Account suspended'
                  }
                } catch {
                  if (usageResponse.status === 423) {
                    status = 'error'
                    errorMessage = 'AccountSuspendedException: Account suspended'
                  }
                }
              }
            }

            // Check subscription response (may also return ban error)
            if (subscriptionRes.status === 'fulfilled') {
              const subResponse = subscriptionRes.value
              if (subResponse.ok) {
                subscriptionData = await subResponse.json()
              } else if (subResponse.status === 423 && status !== 'error') {
                try {
                  const errorBody = await subResponse.json()
                  status = 'error'
                  errorMessage = errorBody.message || 'AccountSuspendedException: Account suspended'
                } catch {
                  status = 'error'
                  errorMessage = 'AccountSuspendedException: Account suspended'
                }
              }
            }

            // Check user info response
            if (userInfoRes.status === 'fulfilled') {
              const userResponse = userInfoRes.value
              if (userResponse.ok) {
                userInfoData = await userResponse.json()
              } else if (userResponse.status === 423 && status !== 'error') {
                try {
                  const errorBody = await userResponse.json()
                  status = 'error'
                  errorMessage = errorBody.message || 'AccountSuspendedException: Account suspended'
                } catch {
                  status = 'error'
                  errorMessage = 'AccountSuspendedException: Account suspended'
                }
              }
            }

            success++
            completed++

            // Notify renderer process to update account
            mainWindow?.webContents.send('background-refresh-result', {
              id: account.id,
              success: true,
              data: {
                accessToken: newAccessToken,
                refreshToken: refreshResult.refreshToken,
                expiresIn: refreshResult.expiresIn,
                usage: usageData,
                subscription: subscriptionData,
                userInfo: userInfoData,
                status,
                errorMessage
              }
            })
          } catch (e) {
            failed++
            completed++
            mainWindow?.webContents.send('background-refresh-result', {
              id: account.id,
              success: false,
              error: e instanceof Error ? e.message : 'Unknown error'
            })
          }
        })
      )

      // Notify progress
      mainWindow?.webContents.send('background-refresh-progress', {
        completed,
        total: accounts.length,
        success,
        failed
      })

      // Delay between batches to let main process breathe
      if (i + concurrency < accounts.length) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }

    console.log(`[BackgroundRefresh] Completed: ${success} success, ${failed} failed`)
    return { success: true, completed, successCount: success, failedCount: failed }
  })

  // IPC: Background batch check account status (no token refresh, only check status)
  ipcMain.handle('background-batch-check', async (_event, accounts: Array<{
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
  }>, concurrency: number = 10) => {
    console.log(`[BackgroundCheck] Starting batch check for ${accounts.length} accounts, concurrency: ${concurrency}`)
    
    let completed = 0
    let success = 0
    let failed = 0

    // Process each batch serially
    for (let i = 0; i < accounts.length; i += concurrency) {
      const batch = accounts.slice(i, i + concurrency)
      
      await Promise.allSettled(
        batch.map(async (account) => {
          try {
            const { accessToken, authMethod, provider } = account.credentials
            
            if (!accessToken) {
              failed++
              completed++
              mainWindow?.webContents.send('background-check-result', {
                id: account.id,
                success: false,
                error: 'Missing accessToken'
              })
              return
            }

            // Determine idp
            let idp = account.idp || 'BuilderId'
            if (authMethod === 'social' && provider) {
              idp = provider
            }

            // Call API to get usage and user info (using same CBOR format as single check)
            const [usageRes, userInfoRes] = await Promise.allSettled([
              kiroApiRequest<{
                usageBreakdownList?: Array<{
                  resourceType?: string
                  displayName?: string
                  usageLimit?: number
                  currentUsage?: number
                  freeTrialInfo?: {
                    freeTrialStatus?: string
                    usageLimit?: number
                    currentUsage?: number
                    freeTrialExpiry?: string
                  }
                }>
                nextDateReset?: string
                subscriptionInfo?: {
                  subscriptionTitle?: string
                  type?: string
                }
                userInfo?: {
                  email?: string
                  userId?: string
                }
              }>('GetUserUsageAndLimits', { isEmailRequired: true, origin: 'KIRO_IDE' }, accessToken, idp),
              kiroApiRequest<{
                email?: string
                userId?: string
                status?: string
                idp?: string
              }>('GetUserInfo', { origin: 'KIRO_IDE' }, accessToken, idp).catch(() => null)
            ])

            // Parse responses (kiroApiRequest returns data directly or throws exception)
            let usageData: {
              current: number
              limit: number
              baseCurrent?: number
              baseLimit?: number
              freeTrialCurrent?: number
              freeTrialLimit?: number
              freeTrialExpiry?: string
              nextResetDate?: string
            } | null = null
            let subscriptionData: {
              type: string
              title: string
            } | null = null
            let userInfoData: {
              email?: string
              userId?: string
              status?: string
            } | null = null
            let status = 'active'
            let errorMessage: string | undefined

            // Process usage response
            if (usageRes.status === 'fulfilled') {
              const rawUsage = usageRes.value
              // Parse Credits usage (same as single check)
              const creditUsage = rawUsage.usageBreakdownList?.find(
                (b) => b.resourceType === 'CREDIT' || b.displayName === 'Credits'
              )
              
              const baseCurrent = creditUsage?.currentUsage ?? 0
              const baseLimit = creditUsage?.usageLimit ?? 0
              let freeTrialCurrent = 0
              let freeTrialLimit = 0
              let freeTrialExpiry: string | undefined
              if (creditUsage?.freeTrialInfo?.freeTrialStatus === 'ACTIVE') {
                freeTrialLimit = creditUsage.freeTrialInfo.usageLimit ?? 0
                freeTrialCurrent = creditUsage.freeTrialInfo.currentUsage ?? 0
                freeTrialExpiry = creditUsage.freeTrialInfo.freeTrialExpiry
              }
              
              usageData = {
                current: baseCurrent + freeTrialCurrent,
                limit: baseLimit + freeTrialLimit,
                baseCurrent,
                baseLimit,
                freeTrialCurrent,
                freeTrialLimit,
                freeTrialExpiry,
                nextResetDate: rawUsage.nextDateReset
              }

              // Parse subscription info (from usage response)
              const subscriptionTitle = rawUsage.subscriptionInfo?.subscriptionTitle ?? 'Free'
              let subscriptionType = 'Free'
              if (subscriptionTitle.toUpperCase().includes('PRO')) {
                subscriptionType = 'Pro'
              } else if (subscriptionTitle.toUpperCase().includes('ENTERPRISE')) {
                subscriptionType = 'Enterprise'
              } else if (subscriptionTitle.toUpperCase().includes('TEAMS')) {
                subscriptionType = 'Teams'
              }
              subscriptionData = { type: subscriptionType, title: subscriptionTitle }
            } else if (usageRes.status === 'rejected') {
              // API call failed (may be ban or token expired)
              const errorMsg = usageRes.reason?.message || String(usageRes.reason)
              console.log(`[BackgroundCheck] Usage API failed for ${account.email}:`, errorMsg)
              if (errorMsg.includes('AccountSuspendedException') || errorMsg.includes('423')) {
                status = 'error'
                errorMessage = errorMsg
              } else if (errorMsg.includes('401')) {
                status = 'expired'
                errorMessage = 'Token expired, please refresh'
              } else {
                status = 'error'
                errorMessage = errorMsg
              }
            }

            // Process user info response
            if (userInfoRes.status === 'fulfilled' && userInfoRes.value) {
              const rawUserInfo = userInfoRes.value
              userInfoData = {
                email: rawUserInfo.email,
                userId: rawUserInfo.userId,
                status: rawUserInfo.status
              }
              // Check user status (non-Active means abnormal)
              if (rawUserInfo.status && rawUserInfo.status !== 'Active' && status !== 'error') {
                status = 'error'
                errorMessage = `User status abnormal: ${rawUserInfo.status}`
              }
            }

            success++
            completed++

            // Notify renderer process to update account
            mainWindow?.webContents.send('background-check-result', {
              id: account.id,
              success: true,
              data: {
                usage: usageData,
                subscription: subscriptionData,
                userInfo: userInfoData,
                status,
                errorMessage
              }
            })
          } catch (e) {
            failed++
            completed++
            mainWindow?.webContents.send('background-check-result', {
              id: account.id,
              success: false,
              error: e instanceof Error ? e.message : 'Unknown error'
            })
          }
        })
      )

      // Notify progress
      mainWindow?.webContents.send('background-check-progress', {
        completed,
        total: accounts.length,
        success,
        failed
      })

      // Delay between batches
      if (i + concurrency < accounts.length) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }

    console.log(`[BackgroundCheck] Completed: ${success} success, ${failed} failed`)
    return { success: true, completed, successCount: success, failedCount: failed }
  })

  // IPC: Export to file
  ipcMain.handle('export-to-file', async (_event, data: string, filename: string) => {
    try {
      const result = await dialog.showSaveDialog(mainWindow!, {
        title: 'Export Account Data',
        defaultPath: filename,
        filters: [{ name: 'JSON Files', extensions: ['json'] }]
      })

      if (!result.canceled && result.filePath) {
        await writeFile(result.filePath, data, 'utf-8')
        return true
      }
      return false
    } catch (error) {
      console.error('Failed to export:', error)
      return false
    }
  })

  // IPC: Batch export to folder
  ipcMain.handle('export-to-folder', async (_event, files: Array<{ filename: string; content: string }>) => {
    try {
      const result = await dialog.showOpenDialog(mainWindow!, {
        title: 'Select Export Folder',
        properties: ['openDirectory', 'createDirectory']
      })

      if (!result.canceled && result.filePaths.length > 0) {
        const folderPath = result.filePaths[0]
        let successCount = 0
        
        for (const file of files) {
          try {
            const filePath = join(folderPath, file.filename)
            await writeFile(filePath, file.content, 'utf-8')
            successCount++
          } catch (err) {
            console.error(`Failed to write ${file.filename}:`, err)
          }
        }
        
        return { success: true, count: successCount, folder: folderPath }
      }
      return { success: false, count: 0 }
    } catch (error) {
      console.error('Failed to export to folder:', error)
      return { success: false, count: 0, error: String(error) }
    }
  })

  // IPC: Import from file
  ipcMain.handle('import-from-file', async () => {
    try {
      const result = await dialog.showOpenDialog(mainWindow!, {
        title: 'Import Account Data',
        filters: [
          { name: 'All Supported Formats', extensions: ['json', 'csv', 'txt'] },
          { name: 'JSON Files', extensions: ['json'] },
          { name: 'CSV Files', extensions: ['csv'] },
          { name: 'TXT Files', extensions: ['txt'] }
        ],
        properties: ['openFile', 'multiSelections']
      })

      if (!result.canceled && result.filePaths.length > 0) {
        // If only one file selected, return single file content
        if (result.filePaths.length === 1) {
          const filePath = result.filePaths[0]
          const content = await readFile(filePath, 'utf-8')
          const ext = filePath.split('.').pop()?.toLowerCase() || 'json'
          return { content, format: ext }
        }
        
        // If multiple files selected, return multiple file contents
        const files = await Promise.all(
          result.filePaths.map(async (filePath) => {
            const content = await readFile(filePath, 'utf-8')
            const ext = filePath.split('.').pop()?.toLowerCase() || 'json'
            return { content, format: ext, path: filePath }
          })
        )
        return { files, isMultiple: true }
      }
      return null
    } catch (error) {
      console.error('Failed to import:', error)
      return null
    }
  })

  // IPC: Verify credentials and get account info (for adding accounts)
  ipcMain.handle('verify-account-credentials', async (_event, credentials: {
    refreshToken: string
    clientId: string
    clientSecret: string
    region?: string
    authMethod?: string
    provider?: string  // 'BuilderId', 'Github', 'Google' etc.
  }) => {
    console.log('[IPC] verify-account-credentials called')
    
    try {
      const { refreshToken, clientId, clientSecret, region = 'us-east-1', authMethod, provider } = credentials
      // Determine idp: social login uses provider, IdC uses BuilderId
      const idp = authMethod === 'social' && provider ? provider : 'BuilderId'
      
      // Social login only needs refreshToken, IdC needs clientId and clientSecret
      if (!refreshToken) {
        return { success: false, error: 'Please fill in Refresh Token' }
      }
      if (authMethod !== 'social' && (!clientId || !clientSecret)) {
        return { success: false, error: 'Please fill in Client ID and Client Secret' }
      }
      
      // Step 1: Refresh to get accessToken using appropriate method
      console.log(`[Verify] Step 1: Refreshing token (authMethod: ${authMethod || 'IdC'})...`)
      const refreshResult = await refreshTokenByMethod(refreshToken, clientId, clientSecret, region, authMethod)
      
      if (!refreshResult.success || !refreshResult.accessToken) {
        return { success: false, error: `Token refresh failed: ${refreshResult.error}` }
      }
      
      console.log('[Verify] Step 2: Getting user info...')
      
      // Step 2: Call GetUserUsageAndLimits to get user info
      interface Bonus {
        bonusCode?: string
        displayName?: string
        usageLimit?: number
        currentUsage?: number
        status?: string
        expiresAt?: string  // API returns expiresAt
      }
      
      interface FreeTrialInfo {
        usageLimit?: number
        currentUsage?: number
        freeTrialStatus?: string
        freeTrialExpiry?: string
      }
      
      interface UsageBreakdown {
        usageLimit?: number
        currentUsage?: number
        resourceType?: string
        displayName?: string
        displayNamePlural?: string
        currency?: string
        unit?: string
        overageRate?: number
        overageCap?: number
        bonuses?: Bonus[]
        freeTrialInfo?: FreeTrialInfo
      }
      
      interface UsageResponse {
        nextDateReset?: string
        usageBreakdownList?: UsageBreakdown[]
        subscriptionInfo?: { 
          subscriptionTitle?: string
          type?: string
          subscriptionManagementTarget?: string
          upgradeCapability?: string
          overageCapability?: string
        }
        overageConfiguration?: { overageEnabled?: boolean }
        userInfo?: { email?: string; userId?: string }
      }
      
      const usageResult = await kiroApiRequest<UsageResponse>(
        'GetUserUsageAndLimits',
        { isEmailRequired: true, origin: 'KIRO_IDE' },
        refreshResult.accessToken,
        idp
      )
      
      // Parse user info
      const email = usageResult.userInfo?.email || ''
      const userId = usageResult.userInfo?.userId || ''
      
      // Parse subscription type
      const subscriptionTitle = usageResult.subscriptionInfo?.subscriptionTitle || 'Free'
      let subscriptionType = 'Free'
      if (subscriptionTitle.toUpperCase().includes('PRO')) {
        subscriptionType = 'Pro'
      } else if (subscriptionTitle.toUpperCase().includes('ENTERPRISE')) {
        subscriptionType = 'Enterprise'
      } else if (subscriptionTitle.toUpperCase().includes('TEAMS')) {
        subscriptionType = 'Teams'
      }
      
      // Parse usage (detailed)
      const creditUsage = usageResult.usageBreakdownList?.find(b => b.resourceType === 'CREDIT')
      
      // Base quota
      const baseLimit = creditUsage?.usageLimit ?? 0
      const baseCurrent = creditUsage?.currentUsage ?? 0
      
      // Trial quota
      let freeTrialLimit = 0
      let freeTrialCurrent = 0
      let freeTrialExpiry: string | undefined
      if (creditUsage?.freeTrialInfo?.freeTrialStatus === 'ACTIVE') {
        freeTrialLimit = creditUsage.freeTrialInfo.usageLimit ?? 0
        freeTrialCurrent = creditUsage.freeTrialInfo.currentUsage ?? 0
        freeTrialExpiry = creditUsage.freeTrialInfo.freeTrialExpiry
      }
      
      // Bonus quota
      const bonuses: { code: string; name: string; current: number; limit: number; expiresAt?: string }[] = []
      if (creditUsage?.bonuses) {
        for (const bonus of creditUsage.bonuses) {
          if (bonus.status === 'ACTIVE') {
            bonuses.push({
              code: bonus.bonusCode || '',
              name: bonus.displayName || '',
              current: bonus.currentUsage ?? 0,
              limit: bonus.usageLimit ?? 0,
              expiresAt: bonus.expiresAt
            })
          }
        }
      }
      
      // Calculate total quota
      const totalLimit = baseLimit + freeTrialLimit + bonuses.reduce((sum, b) => sum + b.limit, 0)
      const totalUsed = baseCurrent + freeTrialCurrent + bonuses.reduce((sum, b) => sum + b.current, 0)
      
      // Calculate reset remaining days
      let daysRemaining: number | undefined
      let expiresAt: number | undefined
      const nextResetDate = usageResult.nextDateReset
      if (nextResetDate) {
        expiresAt = new Date(nextResetDate).getTime()
        daysRemaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / (1000 * 60 * 60 * 24)))
      }
      
      console.log('[Verify] Success! Email:', email)
      
      return {
        success: true,
        data: {
          email,
          userId,
          accessToken: refreshResult.accessToken,
          refreshToken: refreshResult.refreshToken || refreshToken,
          expiresIn: refreshResult.expiresIn,
          subscriptionType,
          subscriptionTitle,
          subscription: {
            rawType: usageResult.subscriptionInfo?.type,
            managementTarget: usageResult.subscriptionInfo?.subscriptionManagementTarget,
            upgradeCapability: usageResult.subscriptionInfo?.upgradeCapability,
            overageCapability: usageResult.subscriptionInfo?.overageCapability
          },
          usage: {
            current: totalUsed,
            limit: totalLimit,
            baseLimit,
            baseCurrent,
            freeTrialLimit,
            freeTrialCurrent,
            freeTrialExpiry,
            bonuses,
            nextResetDate,
            resourceDetail: creditUsage ? {
              displayName: creditUsage.displayName,
              displayNamePlural: creditUsage.displayNamePlural,
              resourceType: creditUsage.resourceType,
              currency: creditUsage.currency,
              unit: creditUsage.unit,
              overageRate: creditUsage.overageRate,
              overageCap: creditUsage.overageCap,
              overageEnabled: usageResult.overageConfiguration?.overageEnabled
            } : undefined
          },
          daysRemaining,
          expiresAt
        }
      }
    } catch (error) {
      console.error('[Verify] Error:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Verification failed' }
    }
  })

  // IPC: Get local SSO cache current active account info
  ipcMain.handle('get-local-active-account', async () => {
    const os = await import('os')
    const path = await import('path')
    
    try {
      const ssoCache = path.join(os.homedir(), '.aws', 'sso', 'cache')
      const tokenPath = path.join(ssoCache, 'kiro-auth-token.json')
      
      const tokenContent = await readFile(tokenPath, 'utf-8')
      const tokenData = JSON.parse(tokenContent)
      
      if (!tokenData.refreshToken) {
        return { success: false, error: 'No refreshToken in local cache' }
      }
      
      return {
        success: true,
        data: {
          refreshToken: tokenData.refreshToken,
          accessToken: tokenData.accessToken,
          authMethod: tokenData.authMethod,
          provider: tokenData.provider
        }
      }
    } catch {
      return { success: false, error: 'Unable to read local SSO cache' }
    }
  })

  // IPC: Import credentials from Kiro local config
  ipcMain.handle('load-kiro-credentials', async () => {
    const os = await import('os')
    const path = await import('path')
    const crypto = await import('crypto')
    const fs = await import('fs/promises')
    
    try {
      // Read token from ~/.aws/sso/cache/kiro-auth-token.json
      const ssoCache = path.join(os.homedir(), '.aws', 'sso', 'cache')
      const tokenPath = path.join(ssoCache, 'kiro-auth-token.json')
      console.log('[Kiro Credentials] Reading token from:', tokenPath)
      
      let tokenData: {
        accessToken?: string
        refreshToken?: string
        clientIdHash?: string
        region?: string
        authMethod?: string
        provider?: string
      }
      
      try {
        const tokenContent = await readFile(tokenPath, 'utf-8')
        tokenData = JSON.parse(tokenContent)
      } catch {
        return { success: false, error: 'Cannot find kiro-auth-token.json file, please login in Kiro IDE first' }
      }
      
      if (!tokenData.refreshToken) {
        return { success: false, error: 'Missing refreshToken in kiro-auth-token.json' }
      }
      
      // Determine clientIdHash: prefer from file, otherwise calculate default
      let clientIdHash = tokenData.clientIdHash
      if (!clientIdHash) {
        // Use standard startUrl to calculate hash (consistent with Kiro client)
        const startUrl = 'https://view.awsapps.com/start'
        clientIdHash = crypto.createHash('sha1')
          .update(JSON.stringify({ startUrl }))
          .digest('hex')
        console.log('[Kiro Credentials] Calculated clientIdHash:', clientIdHash)
      }
      
      // Read client registration info
      let clientRegPath = path.join(ssoCache, `${clientIdHash}.json`)
      console.log('[Kiro Credentials] Trying client registration from:', clientRegPath)
      
      let clientData: {
        clientId?: string
        clientSecret?: string
      } | null = null
      
      try {
        const clientContent = await readFile(clientRegPath, 'utf-8')
        clientData = JSON.parse(clientContent)
      } catch {
        // If not found, try searching other .json files in directory (excluding kiro-auth-token.json)
        console.log('[Kiro Credentials] Client file not found, searching cache directory...')
        try {
          const files = await fs.readdir(ssoCache)
          for (const file of files) {
            if (file.endsWith('.json') && file !== 'kiro-auth-token.json') {
              try {
                const content = await readFile(path.join(ssoCache, file), 'utf-8')
                const data = JSON.parse(content)
                if (data.clientId && data.clientSecret) {
                  clientData = data
                  console.log('[Kiro Credentials] Found client registration in:', file)
                  break
                }
              } catch {
                // Ignore files that can't be parsed
              }
            }
          }
        } catch {
          // Ignore directory read errors
        }
      }
      
      // Social login doesn't need clientId/clientSecret
      const isSocialAuth = tokenData.authMethod === 'social'
      
      if (!isSocialAuth && (!clientData || !clientData.clientId || !clientData.clientSecret)) {
        return { success: false, error: 'Cannot find client registration file, please ensure you have logged in Kiro IDE' }
      }
      
      console.log(`[Kiro Credentials] Successfully loaded credentials (authMethod: ${tokenData.authMethod || 'IdC'})`)
      
      return {
        success: true,
        data: {
          accessToken: tokenData.accessToken || '',
          refreshToken: tokenData.refreshToken,
          clientId: clientData?.clientId || '',
          clientSecret: clientData?.clientSecret || '',
          region: tokenData.region || 'us-east-1',
          authMethod: tokenData.authMethod || 'IdC',
          provider: tokenData.provider || 'BuilderId'
        }
      }
    } catch (error) {
      console.error('[Kiro Credentials] Error:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // IPC: Switch account - Write credentials to local SSO cache
  ipcMain.handle('switch-account', async (_event, credentials: {
    accessToken: string
    refreshToken: string
    clientId: string
    clientSecret: string
    region?: string
    authMethod?: 'IdC' | 'social'
    provider?: 'BuilderId' | 'Github' | 'Google'
  }) => {
    const os = await import('os')
    const path = await import('path')
    const crypto = await import('crypto')
    const { mkdir, writeFile } = await import('fs/promises')
    
    try {
      const { 
        accessToken, 
        refreshToken, 
        clientId, 
        clientSecret, 
        region = 'us-east-1',
        authMethod = 'IdC',
        provider = 'BuilderId'
      } = credentials
      
      // Calculate clientIdHash (consistent with Kiro client)
      const startUrl = 'https://view.awsapps.com/start'
      const clientIdHash = crypto.createHash('sha1')
        .update(JSON.stringify({ startUrl }))
        .digest('hex')
      
      // Ensure directory exists
      const ssoCache = path.join(os.homedir(), '.aws', 'sso', 'cache')
      await mkdir(ssoCache, { recursive: true })
      
      // Write token file
      const tokenPath = path.join(ssoCache, 'kiro-auth-token.json')
      const tokenData = {
        accessToken,
        refreshToken,
        expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
        clientIdHash,
        authMethod,
        provider,
        region
      }
      await writeFile(tokenPath, JSON.stringify(tokenData, null, 2))
      console.log('[Switch Account] Token saved to:', tokenPath)
      
      // Only IdC login needs to write client registration file
      if (authMethod !== 'social' && clientId && clientSecret) {
        const clientRegPath = path.join(ssoCache, `${clientIdHash}.json`)
        const expiresAt = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString().replace('Z', '')
        const clientData = {
          clientId,
          clientSecret,
          expiresAt,
          scopes: [
            'codewhisperer:completions',
            'codewhisperer:analysis',
            'codewhisperer:conversations',
            'codewhisperer:transformations',
            'codewhisperer:taskassist'
          ]
        }
        await writeFile(clientRegPath, JSON.stringify(clientData, null, 2))
        console.log('[Switch Account] Client registration saved to:', clientRegPath)
      }
      
      return { success: true }
    } catch (error) {
      console.error('[Switch Account] Error:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Switch failed' }
    }
  })

  // ============ Manual Login IPC ============

  // Store current login state
  let currentLoginState: {
    type: 'builderid' | 'social'
    // BuilderId related
    clientId?: string
    clientSecret?: string
    deviceCode?: string
    userCode?: string
    verificationUri?: string
    interval?: number
    expiresAt?: number
    // Social Auth related
    codeVerifier?: string
    codeChallenge?: string
    oauthState?: string
    provider?: string
  } | null = null

  // IPC: Start Builder ID manual login
  ipcMain.handle('start-builder-id-login', async (_event, region: string = 'us-east-1') => {
    console.log('[Login] Starting Builder ID login...')
    
    const oidcBase = `https://oidc.${region}.amazonaws.com`
    const startUrl = 'https://view.awsapps.com/start'
    const scopes = [
      'codewhisperer:completions',
      'codewhisperer:analysis',
      'codewhisperer:conversations',
      'codewhisperer:transformations',
      'codewhisperer:taskassist'
    ]

    try {
      // Step 1: Register OIDC client
      console.log('[Login] Step 1: Registering OIDC client...')
      const regRes = await fetch(`${oidcBase}/client/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName: 'Kiro Account Manager',
          clientType: 'public',
          scopes,
          grantTypes: ['urn:ietf:params:oauth:grant-type:device_code', 'refresh_token'],
          issuerUrl: startUrl
        })
      })

      if (!regRes.ok) {
        const errText = await regRes.text()
        return { success: false, error: `Client registration failed: ${errText}` }
      }

      const regData = await regRes.json()
      const clientId = regData.clientId
      const clientSecret = regData.clientSecret
      console.log('[Login] Client registered:', clientId.substring(0, 30) + '...')

      // Step 2: Start device authorization
      console.log('[Login] Step 2: Starting device authorization...')
      const authRes = await fetch(`${oidcBase}/device_authorization`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, clientSecret, startUrl })
      })

      if (!authRes.ok) {
        const errText = await authRes.text()
        return { success: false, error: `Device authorization failed: ${errText}` }
      }

      const authData = await authRes.json()
      const { deviceCode, userCode, verificationUri, verificationUriComplete, interval = 5, expiresIn = 600 } = authData
      console.log('[Login] Device code obtained, user_code:', userCode)

      // Save login state
      currentLoginState = {
        type: 'builderid',
        clientId,
        clientSecret,
        deviceCode,
        userCode,
        verificationUri,
        interval,
        expiresAt: Date.now() + expiresIn * 1000
      }

      return {
        success: true,
        userCode,
        verificationUri: verificationUriComplete || verificationUri,
        expiresIn,
        interval
      }
    } catch (error) {
      console.error('[Login] Error:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Login failed' }
    }
  })

  // IPC: Poll Builder ID authorization status
  ipcMain.handle('poll-builder-id-auth', async (_event, region: string = 'us-east-1') => {
    console.log('[Login] Polling for authorization...')

    if (!currentLoginState || currentLoginState.type !== 'builderid') {
      return { success: false, error: 'No login in progress' }
    }

    if (Date.now() > (currentLoginState.expiresAt || 0)) {
      currentLoginState = null
      return { success: false, error: 'Authorization expired, please restart' }
    }

    const oidcBase = `https://oidc.${region}.amazonaws.com`
    const { clientId, clientSecret, deviceCode } = currentLoginState

    try {
      const tokenRes = await fetch(`${oidcBase}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          clientSecret,
          grantType: 'urn:ietf:params:oauth:grant-type:device_code',
          deviceCode
        })
      })

      if (tokenRes.status === 200) {
        const tokenData = await tokenRes.json()
        console.log('[Login] Authorization successful!')
        
        const result = {
          success: true,
          completed: true,
          accessToken: tokenData.accessToken,
          refreshToken: tokenData.refreshToken,
          clientId,
          clientSecret,
          region,
          expiresIn: tokenData.expiresIn
        }
        
        currentLoginState = null
        return result
      } else if (tokenRes.status === 400) {
        const errData = await tokenRes.json()
        const error = errData.error

        if (error === 'authorization_pending') {
          return { success: true, completed: false, status: 'pending' }
        } else if (error === 'slow_down') {
          if (currentLoginState) {
            currentLoginState.interval = (currentLoginState.interval || 5) + 5
          }
          return { success: true, completed: false, status: 'slow_down' }
        } else if (error === 'expired_token') {
          currentLoginState = null
          return { success: false, error: 'Device code expired' }
        } else if (error === 'access_denied') {
          currentLoginState = null
          return { success: false, error: 'User denied authorization' }
        } else {
          currentLoginState = null
          return { success: false, error: `Authorization error: ${error}` }
        }
      } else {
        return { success: false, error: `Unknown response: ${tokenRes.status}` }
      }
    } catch (error) {
      console.error('[Login] Poll error:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Poll failed' }
    }
  })

  // IPC: Cancel Builder ID login
  ipcMain.handle('cancel-builder-id-login', async () => {
    console.log('[Login] Cancelling Builder ID login...')
    currentLoginState = null
    return { success: true }
  })

  // IPC: Start Social Auth login (Google/GitHub)
  ipcMain.handle('start-social-login', async (_event, provider: 'Google' | 'Github') => {
    console.log(`[Login] Starting ${provider} Social Auth login...`)
    
    const crypto = await import('crypto')

    // Generate PKCE
    const codeVerifier = crypto.randomBytes(64).toString('base64url').substring(0, 128)
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url')
    const oauthState = crypto.randomBytes(32).toString('base64url')

    // Build login URL
    const redirectUri = 'kiro://kiro.kiroAgent/authenticate-success'
    const loginUrl = new URL(`${KIRO_AUTH_ENDPOINT}/login`)
    loginUrl.searchParams.set('idp', provider)
    loginUrl.searchParams.set('redirect_uri', redirectUri)
    loginUrl.searchParams.set('code_challenge', codeChallenge)
    loginUrl.searchParams.set('code_challenge_method', 'S256')
    loginUrl.searchParams.set('state', oauthState)

    // Save login state
    currentLoginState = {
      type: 'social',
      codeVerifier,
      codeChallenge,
      oauthState,
      provider
    }

    console.log(`[Login] Opening browser for ${provider} login...`)
    shell.openExternal(loginUrl.toString())

    return {
      success: true,
      loginUrl: loginUrl.toString(),
      state: oauthState
    }
  })

  // IPC: Exchange Social Auth token
  ipcMain.handle('exchange-social-token', async (_event, code: string, state: string) => {
    console.log('[Login] Exchanging Social Auth token...')

    if (!currentLoginState || currentLoginState.type !== 'social') {
      return { success: false, error: 'No social login in progress' }
    }

    // Verify state
    if (state !== currentLoginState.oauthState) {
      currentLoginState = null
      return { success: false, error: 'State parameter mismatch, possible security risk' }
    }

    const { codeVerifier, provider } = currentLoginState
    const redirectUri = 'kiro://kiro.kiroAgent/authenticate-success'

    try {
      const tokenRes = await fetch(`${KIRO_AUTH_ENDPOINT}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          code_verifier: codeVerifier,
          redirect_uri: redirectUri
        })
      })

      if (!tokenRes.ok) {
        const errText = await tokenRes.text()
        currentLoginState = null
        return { success: false, error: `Token exchange failed: ${errText}` }
      }

      const tokenData = await tokenRes.json()
      console.log('[Login] Token exchange successful!')

      const result = {
        success: true,
        accessToken: tokenData.accessToken,
        refreshToken: tokenData.refreshToken,
        profileArn: tokenData.profileArn,
        expiresIn: tokenData.expiresIn,
        authMethod: 'social' as const,
        provider
      }

      currentLoginState = null
      return result
    } catch (error) {
      console.error('[Login] Token exchange error:', error)
      currentLoginState = null
      return { success: false, error: error instanceof Error ? error.message : 'Token exchange failed' }
    }
  })

  // IPC: Cancel Social Auth login
  ipcMain.handle('cancel-social-login', async () => {
    console.log('[Login] Cancelling Social Auth login...')
    currentLoginState = null
    return { success: true }
  })

  // IPC: Set proxy
  ipcMain.handle('set-proxy', async (_event, enabled: boolean, url: string) => {
    console.log(`[IPC] set-proxy called: enabled=${enabled}, url=${url}`)
    try {
      applyProxySettings(enabled, url)
      
      // Also set Electron session proxy
      if (mainWindow) {
        const session = mainWindow.webContents.session
        if (enabled && url) {
          await session.setProxy({ proxyRules: url })
        } else {
          await session.setProxy({ proxyRules: '' })
        }
      }
      
      return { success: true }
    } catch (error) {
      console.error('[Proxy] Failed to set proxy:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // ============ Kiro Settings Management IPC ============

  // IPC: Get Kiro settings
  ipcMain.handle('get-kiro-settings', async () => {
    try {
      const os = await import('os')
      const fs = await import('fs')
      const path = await import('path')
      
      const homeDir = os.homedir()
      const kiroSettingsPath = path.join(homeDir, 'AppData', 'Roaming', 'Kiro', 'User', 'settings.json')
      const kiroSteeringPath = path.join(homeDir, '.kiro', 'steering')
      const kiroMcpUserPath = path.join(homeDir, '.kiro', 'settings', 'mcp.json')
      
      let settings = {}
      let mcpConfig = { mcpServers: {} }
      let steeringFiles: string[] = []
      
      // Read Kiro settings.json (VS Code style JSON, may have trailing commas)
      if (fs.existsSync(kiroSettingsPath)) {
        const content = fs.readFileSync(kiroSettingsPath, 'utf-8')
        // Remove trailing commas and comments for standard JSON compatibility
        const cleanedContent = content
          .replace(/\/\/.*$/gm, '') // Remove single-line comments
          .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
          .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas
        const parsed = JSON.parse(cleanedContent)
        settings = {
          modelSelection: parsed['kiroAgent.modelSelection'],
          agentAutonomy: parsed['kiroAgent.agentAutonomy'],
          enableDebugLogs: parsed['kiroAgent.enableDebugLogs'],
          enableTabAutocomplete: parsed['kiroAgent.enableTabAutocomplete'],
          enableCodebaseIndexing: parsed['kiroAgent.enableCodebaseIndexing'],
          usageSummary: parsed['kiroAgent.usageSummary'],
          codeReferences: parsed['kiroAgent.codeReferences.referenceTracker'],
          configureMCP: parsed['kiroAgent.configureMCP'],
          trustedCommands: parsed['kiroAgent.trustedCommands'] || [],
          commandDenylist: parsed['kiroAgent.commandDenylist'] || [],
          ignoreFiles: parsed['kiroAgent.ignoreFiles'] || [],
          mcpApprovedEnvVars: parsed['kiroAgent.mcpApprovedEnvVars'] || [],
          notificationsActionRequired: parsed['kiroAgent.notifications.agent.actionRequired'],
          notificationsFailure: parsed['kiroAgent.notifications.agent.failure'],
          notificationsSuccess: parsed['kiroAgent.notifications.agent.success'],
          notificationsBilling: parsed['kiroAgent.notifications.billing']
        }
      }
      
      // Read MCP config
      if (fs.existsSync(kiroMcpUserPath)) {
        const mcpContent = fs.readFileSync(kiroMcpUserPath, 'utf-8')
        mcpConfig = JSON.parse(mcpContent)
      }
      
      // Read Steering file list
      if (fs.existsSync(kiroSteeringPath)) {
        const files = fs.readdirSync(kiroSteeringPath)
        steeringFiles = files.filter(f => f.endsWith('.md'))
        console.log('[KiroSettings] Steering path:', kiroSteeringPath)
        console.log('[KiroSettings] Found steering files:', steeringFiles)
      } else {
        console.log('[KiroSettings] Steering path does not exist:', kiroSteeringPath)
      }
      
      return { settings, mcpConfig, steeringFiles }
    } catch (error) {
      console.error('[KiroSettings] Failed to get settings:', error)
      return { error: error instanceof Error ? error.message : 'Failed to get settings' }
    }
  })

  // IPC: Save Kiro settings
  ipcMain.handle('save-kiro-settings', async (_event, settings: Record<string, unknown>) => {
    try {
      const os = await import('os')
      const fs = await import('fs')
      const path = await import('path')
      
      const homeDir = os.homedir()
      const kiroSettingsPath = path.join(homeDir, 'AppData', 'Roaming', 'Kiro', 'User', 'settings.json')
      
      let existingSettings = {}
      if (fs.existsSync(kiroSettingsPath)) {
        const content = fs.readFileSync(kiroSettingsPath, 'utf-8')
        // Remove trailing commas and comments for standard JSON compatibility
        const cleanedContent = content
          .replace(/\/\/.*$/gm, '') // Remove single-line comments
          .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
          .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas
        existingSettings = JSON.parse(cleanedContent)
      }
      
      // Map settings to Kiro format
      const kiroSettings = {
        ...existingSettings,
        'kiroAgent.modelSelection': settings.modelSelection,
        'kiroAgent.agentAutonomy': settings.agentAutonomy,
        'kiroAgent.enableDebugLogs': settings.enableDebugLogs,
        'kiroAgent.enableTabAutocomplete': settings.enableTabAutocomplete,
        'kiroAgent.enableCodebaseIndexing': settings.enableCodebaseIndexing,
        'kiroAgent.usageSummary': settings.usageSummary,
        'kiroAgent.codeReferences.referenceTracker': settings.codeReferences,
        'kiroAgent.configureMCP': settings.configureMCP,
        'kiroAgent.trustedCommands': settings.trustedCommands,
        'kiroAgent.commandDenylist': settings.commandDenylist,
        'kiroAgent.ignoreFiles': settings.ignoreFiles,
        'kiroAgent.mcpApprovedEnvVars': settings.mcpApprovedEnvVars,
        'kiroAgent.notifications.agent.actionRequired': settings.notificationsActionRequired,
        'kiroAgent.notifications.agent.failure': settings.notificationsFailure,
        'kiroAgent.notifications.agent.success': settings.notificationsSuccess,
        'kiroAgent.notifications.billing': settings.notificationsBilling
      }
      
      // Ensure directory exists
      const dir = path.dirname(kiroSettingsPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      
      fs.writeFileSync(kiroSettingsPath, JSON.stringify(kiroSettings, null, 4))
      return { success: true }
    } catch (error) {
      console.error('[KiroSettings] Failed to save settings:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Failed to save settings' }
    }
  })

  // IPC: Open Kiro MCP config file
  ipcMain.handle('open-kiro-mcp-config', async (_event, type: 'user' | 'workspace') => {
    try {
      const os = await import('os')
      const path = await import('path')
      const homeDir = os.homedir()
      
      let configPath: string
      if (type === 'user') {
        configPath = path.join(homeDir, '.kiro', 'settings', 'mcp.json')
      } else {
        // Workspace config, open current workspace's .kiro/settings/mcp.json
        configPath = path.join(process.cwd(), '.kiro', 'settings', 'mcp.json')
      }
      
      // If file doesn't exist, create empty config
      const fs = await import('fs')
      if (!fs.existsSync(configPath)) {
        const dir = path.dirname(configPath)
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true })
        }
        fs.writeFileSync(configPath, JSON.stringify({ mcpServers: {} }, null, 2))
      }
      
      shell.openPath(configPath)
      return { success: true }
    } catch (error) {
      console.error('[KiroSettings] Failed to open MCP config:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Failed to open MCP config' }
    }
  })

  // IPC: Open Kiro Steering directory
  ipcMain.handle('open-kiro-steering-folder', async () => {
    try {
      const os = await import('os')
      const path = await import('path')
      const fs = await import('fs')
      const homeDir = os.homedir()
      const steeringPath = path.join(homeDir, '.kiro', 'steering')
      
      // If directory doesn't exist, create it
      if (!fs.existsSync(steeringPath)) {
        fs.mkdirSync(steeringPath, { recursive: true })
      }
      
      shell.openPath(steeringPath)
      return { success: true }
    } catch (error) {
      console.error('[KiroSettings] Failed to open steering folder:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Failed to open steering folder' }
    }
  })

  // IPC: Open Kiro settings.json file
  ipcMain.handle('open-kiro-settings-file', async () => {
    try {
      const os = await import('os')
      const path = await import('path')
      const fs = await import('fs')
      const homeDir = os.homedir()
      const settingsPath = path.join(homeDir, 'AppData', 'Roaming', 'Kiro', 'User', 'settings.json')
      
      // If file doesn't exist, create default config
      if (!fs.existsSync(settingsPath)) {
        const dir = path.dirname(settingsPath)
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true })
        }
        const defaultSettings = {
          'workbench.colorTheme': 'Kiro Light',
          'kiroAgent.modelSelection': 'claude-haiku-4.5'
        }
        fs.writeFileSync(settingsPath, JSON.stringify(defaultSettings, null, 4))
      }
      
      shell.openPath(settingsPath)
      return { success: true }
    } catch (error) {
      console.error('[KiroSettings] Failed to open settings file:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Failed to open settings file' }
    }
  })

  // IPC: Open specified Steering file
  ipcMain.handle('open-kiro-steering-file', async (_event, filename: string) => {
    try {
      const os = await import('os')
      const path = await import('path')
      const homeDir = os.homedir()
      const filePath = path.join(homeDir, '.kiro', 'steering', filename)
      
      shell.openPath(filePath)
      return { success: true }
    } catch (error) {
      console.error('[KiroSettings] Failed to open steering file:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Failed to open steering file' }
    }
  })

  // IPC: Create default rules.md file
  ipcMain.handle('create-kiro-default-rules', async () => {
    try {
      const os = await import('os')
      const fs = await import('fs')
      const path = await import('path')
      const homeDir = os.homedir()
      const steeringPath = path.join(homeDir, '.kiro', 'steering')
      const rulesPath = path.join(steeringPath, 'rules.md')
      
      // Ensure directory exists
      if (!fs.existsSync(steeringPath)) {
        fs.mkdirSync(steeringPath, { recursive: true })
      }
      
      // Default rules content
      const defaultContent = `# Role: Senior Software Development Assistant

# Core Principles

## 1. Communication & Collaboration
- **Honesty First**: Never guess or pretend under any circumstances. When requirements are unclear, there are technical risks, or knowledge gaps exist, stop work immediately and clarify with the user.
- **Technical Problem-Solving**: When facing technical challenges, the primary goal is to find and propose high-quality solutions. Only after all viable options have been evaluated should you discuss downgrade or alternative solutions with the user.
- **Critical Thinking**: During task execution, if you discover technical limitations, potential risks, or better implementation paths for current requirements, proactively share your insights and improvement suggestions with the user.

## 2. Architecture Design
- **Modular Design**: All designs must follow the principles of functional decoupling and single responsibility. Strictly adhere to SOLID and DRY principles.
- **Forward-Thinking**: Consider future scalability and maintainability during design, ensuring solutions integrate seamlessly into the overall project architecture.
- **Technical Debt Priority**: When refactoring or optimizing, prioritize technical debt and infrastructure issues that have the greatest impact on system stability and maintainability.

## 3. Code & Deliverable Quality Standards

### Coding Standards
- **Architecture Perspective**: Always write code from the overall project architecture perspective, ensuring code snippets integrate seamlessly rather than being isolated features.
- **Zero Technical Debt**: Strictly prohibit creating any form of technical debt, including but not limited to: temporary files, hardcoded values, modules or functions with unclear responsibilities.
- **Problem Exposure**: Prohibit adding any fallback mechanisms to mask or bypass errors. Code should be designed to fail-fast, ensuring problems are discovered immediately.

### Quality Requirements
- **Readability**: Use clear, meaningful variable and function names. Code logic must be clear and understandable, supplemented with necessary comments.
- **Standard Compliance**: Strictly follow community best practices and official coding standards for the target programming language.
- **Robustness**: Must include adequate error handling logic and boundary condition checks.
- **Performance Awareness**: While ensuring code quality and readability, reasonably optimize performance-sensitive parts, avoiding unnecessary computational complexity and resource consumption.

### Deliverable Standards
- **No Documentation**: Unless explicitly requested by the user, do not create any Markdown documents or other forms of documentation.
- **No Tests**: Unless explicitly requested by the user, do not write unit tests or integration test code.

# Notes
- Unless specifically stated, do not create new documents, test, compile, run, or summarize unless the user explicitly requests it
- When requirements are unclear, ask the user for clarification and provide predefined options
- When there are multiple solutions, ask the user rather than making decisions independently
- When solutions/strategies need updating, ask the user rather than making decisions independently
- ACE is the abbreviation for augmentContextEngine tool
- If asked to view documentation, use Context7 MCP
- If web frontend page testing is needed, use Playwright MCP
- If user replies 'continue', please continue completing the task according to best practices
`
      
      fs.writeFileSync(rulesPath, defaultContent, 'utf-8')
      console.log('[KiroSettings] Created default rules.md at:', rulesPath)
      
      // Open file
      shell.openPath(rulesPath)
      
      return { success: true }
    } catch (error) {
      console.error('[KiroSettings] Failed to create default rules:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Failed to create default rules' }
    }
  })

  // IPC: Read Steering file content
  ipcMain.handle('read-kiro-steering-file', async (_event, filename: string) => {
    try {
      const os = await import('os')
      const fs = await import('fs')
      const path = await import('path')
      const homeDir = os.homedir()
      const filePath = path.join(homeDir, '.kiro', 'steering', filename)
      
      if (!fs.existsSync(filePath)) {
        return { success: false, error: 'File does not exist' }
      }
      
      const content = fs.readFileSync(filePath, 'utf-8')
      return { success: true, content }
    } catch (error) {
      console.error('[KiroSettings] Failed to read steering file:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Failed to read file' }
    }
  })

  // IPC: Save Steering file content
  ipcMain.handle('save-kiro-steering-file', async (_event, filename: string, content: string) => {
    try {
      const os = await import('os')
      const fs = await import('fs')
      const path = await import('path')
      const homeDir = os.homedir()
      const steeringPath = path.join(homeDir, '.kiro', 'steering')
      const filePath = path.join(steeringPath, filename)
      
      // Ensure directory exists
      if (!fs.existsSync(steeringPath)) {
        fs.mkdirSync(steeringPath, { recursive: true })
      }
      
      fs.writeFileSync(filePath, content, 'utf-8')
      console.log('[KiroSettings] Saved steering file:', filePath)
      return { success: true }
    } catch (error) {
      console.error('[KiroSettings] Failed to save steering file:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Failed to save file' }
    }
  })

  // ============ MCP Server Management IPC ============

  // IPC: Save MCP server config
  ipcMain.handle('save-mcp-server', async (_event, name: string, config: { command: string; args?: string[]; env?: Record<string, string> }, oldName?: string) => {
    try {
      const os = await import('os')
      const fs = await import('fs')
      const path = await import('path')
      const homeDir = os.homedir()
      const mcpPath = path.join(homeDir, '.kiro', 'settings', 'mcp.json')
      
      // Read existing config
      let mcpConfig: { mcpServers: Record<string, unknown> } = { mcpServers: {} }
      if (fs.existsSync(mcpPath)) {
        const content = fs.readFileSync(mcpPath, 'utf-8')
        mcpConfig = JSON.parse(content)
      }
      
      // If renaming, delete old one first
      if (oldName && oldName !== name) {
        delete mcpConfig.mcpServers[oldName]
      }
      
      // Add/update server
      mcpConfig.mcpServers[name] = config
      
      // Ensure directory exists
      const dir = path.dirname(mcpPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      
      fs.writeFileSync(mcpPath, JSON.stringify(mcpConfig, null, 2))
      console.log('[KiroSettings] Saved MCP server:', name)
      return { success: true }
    } catch (error) {
      console.error('[KiroSettings] Failed to save MCP server:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Failed to save MCP server' }
    }
  })

  // IPC: Delete MCP server
  ipcMain.handle('delete-mcp-server', async (_event, name: string) => {
    try {
      const os = await import('os')
      const fs = await import('fs')
      const path = await import('path')
      const homeDir = os.homedir()
      const mcpPath = path.join(homeDir, '.kiro', 'settings', 'mcp.json')
      
      if (!fs.existsSync(mcpPath)) {
        return { success: false, error: 'Config file does not exist' }
      }
      
      const content = fs.readFileSync(mcpPath, 'utf-8')
      const mcpConfig = JSON.parse(content)
      
      if (!mcpConfig.mcpServers || !mcpConfig.mcpServers[name]) {
        return { success: false, error: 'Server does not exist' }
      }
      
      delete mcpConfig.mcpServers[name]
      fs.writeFileSync(mcpPath, JSON.stringify(mcpConfig, null, 2))
      console.log('[KiroSettings] Deleted MCP server:', name)
      return { success: true }
    } catch (error) {
      console.error('[KiroSettings] Failed to delete MCP server:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Failed to delete MCP server' }
    }
  })

  // IPC: Delete Steering file
  ipcMain.handle('delete-kiro-steering-file', async (_event, filename: string) => {
    try {
      const os = await import('os')
      const fs = await import('fs')
      const path = await import('path')
      const homeDir = os.homedir()
      const filePath = path.join(homeDir, '.kiro', 'steering', filename)
      
      if (!fs.existsSync(filePath)) {
        return { success: false, error: 'File does not exist' }
      }
      
      fs.unlinkSync(filePath)
      console.log('[KiroSettings] Deleted steering file:', filePath)
      return { success: true }
    } catch (error) {
      console.error('[KiroSettings] Failed to delete steering file:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Failed to delete file' }
    }
  })

  // ============ Machine ID Management IPC ============
  
  // IPC: Get OS type
  ipcMain.handle('machine-id:get-os-type', () => {
    return machineIdModule.getOSType()
  })

  // IPC: Get current machine ID
  ipcMain.handle('machine-id:get-current', async () => {
    console.log('[MachineId] Getting current machine ID...')
    return await machineIdModule.getCurrentMachineId()
  })

  // IPC: Set new machine ID
  ipcMain.handle('machine-id:set', async (_event, newMachineId: string) => {
    console.log('[MachineId] Setting new machine ID:', newMachineId.substring(0, 8) + '...')
    const result = await machineIdModule.setMachineId(newMachineId)
    
    if (!result.success && result.requiresAdmin) {
      // Show dialog asking user if they want to restart with admin privileges
      const shouldRestart = await machineIdModule.showAdminRequiredDialog()
      if (shouldRestart) {
        await machineIdModule.requestAdminRestart()
      }
    }
    
    return result
  })

  // IPC: Generate random machine ID
  ipcMain.handle('machine-id:generate-random', () => {
    return machineIdModule.generateRandomMachineId()
  })

  // IPC: Check admin privileges
  ipcMain.handle('machine-id:check-admin', async () => {
    return await machineIdModule.checkAdminPrivilege()
  })

  // IPC: Request admin restart
  ipcMain.handle('machine-id:request-admin-restart', async () => {
    const shouldRestart = await machineIdModule.showAdminRequiredDialog()
    if (shouldRestart) {
      return await machineIdModule.requestAdminRestart()
    }
    return false
  })

  // IPC: Backup machine ID to file
  ipcMain.handle('machine-id:backup-to-file', async (_event, machineId: string) => {
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: 'Backup Machine ID',
      defaultPath: 'machine-id-backup.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    
    if (result.canceled || !result.filePath) {
      return false
    }
    
    return await machineIdModule.backupMachineIdToFile(machineId, result.filePath)
  })

  // IPC: Restore machine ID from file
  ipcMain.handle('machine-id:restore-from-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Restore Machine ID',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile']
    })
    
    if (result.canceled || !result.filePaths[0]) {
      return { success: false, error: 'User cancelled' }
    }
    
    return await machineIdModule.restoreMachineIdFromFile(result.filePaths[0])
  })

  // ============ AWS Auto Register IPC ============

  // IPC: Open file selection dialog
  ipcMain.handle('open-file-dialog', async (_event, options?: { filters?: Array<{ name: string; extensions: string[] }> }) => {
    try {
      const result = await dialog.showOpenDialog(mainWindow!, {
        title: 'Select File',
        filters: options?.filters || [{ name: 'Text Files', extensions: ['txt'] }],
        properties: ['openFile']
      })
      
      if (result.canceled || !result.filePaths[0]) {
        return null
      }
      
      const fs = await import('fs')
      const content = fs.readFileSync(result.filePaths[0], 'utf-8')
      return { content, path: result.filePaths[0] }
    } catch (error) {
      console.error('[OpenFile] Error:', error)
      return null
    }
  })

  // ============ Kiro Server Import IPC ============

  // IPC: Test Kiro server connection
  ipcMain.handle('test-kiro-server-connection', async (_event, serverUrl: string, password: string) => {
    console.log('[KiroServer] Testing connection to:', serverUrl)
    
    try {
      const https = await import('https')
      const http = await import('http')
      
      // First try to login to get token
      const loginUrl = new URL('/api/admin/login', serverUrl)
      const isHttps = loginUrl.protocol === 'https:'
      const httpModule = isHttps ? https : http
      
      const loginData = JSON.stringify({ username: 'admin', password })
      
      return new Promise<{ success: boolean; token?: string; error?: string }>((resolve) => {
        const req = httpModule.request({
          hostname: loginUrl.hostname,
          port: loginUrl.port || (isHttps ? 443 : 80),
          path: loginUrl.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(loginData)
          },
          timeout: 10000
        }, (res) => {
          let data = ''
          res.on('data', chunk => data += chunk)
          res.on('end', () => {
            try {
              const json = JSON.parse(data)
              if (json.success && json.token) {
                console.log('[KiroServer] Login successful, got token')
                resolve({ success: true, token: json.token })
              } else {
                console.log('[KiroServer] Login failed:', json.error)
                resolve({ success: false, error: json.error || 'Login failed, please check password' })
              }
            } catch {
              resolve({ success: false, error: 'Server response format error' })
            }
          })
        })
        
        req.on('error', (e) => {
          console.error('[KiroServer] Connection error:', e)
          resolve({ success: false, error: `Connection failed: ${e.message}` })
        })
        
        req.on('timeout', () => {
          req.destroy()
          resolve({ success: false, error: 'Connection timeout' })
        })
        
        req.write(loginData)
        req.end()
      })
    } catch (error) {
      console.error('[KiroServer] Error:', error)
      return { success: false, error: `Error: ${error instanceof Error ? error.message : String(error)}` }
    }
  })

  // IPC: Import accounts to Kiro server
  ipcMain.handle('import-to-kiro-server', async (_event, params: {
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
  }) => {
    console.log('[KiroServer] Importing', params.accounts.length, 'accounts to:', params.serverUrl)
    
    try {
      const https = await import('https')
      const http = await import('http')
      
      // First login to get token
      const loginUrl = new URL('/api/admin/login', params.serverUrl)
      const isHttps = loginUrl.protocol === 'https:'
      const httpModule = isHttps ? https : http
      
      console.log('[KiroServer] Login URL:', loginUrl.href)
      const loginData = JSON.stringify({ username: 'admin', password: params.password })
      
      // Login to get token
      const loginResult = await new Promise<{ success: boolean; token?: string; error?: string }>((resolve) => {
        const req = httpModule.request({
          hostname: loginUrl.hostname,
          port: loginUrl.port || (isHttps ? 443 : 80),
          path: loginUrl.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(loginData)
          },
          timeout: 10000
        }, (res) => {
          let data = ''
          res.on('data', chunk => data += chunk)
          res.on('end', () => {
            console.log('[KiroServer] Login response status:', res.statusCode)
            console.log('[KiroServer] Login response:', data.substring(0, 200))
            try {
              const json = JSON.parse(data)
              if (json.success && json.token) {
                console.log('[KiroServer] Login successful, got token')
                resolve({ success: true, token: json.token })
              } else {
                console.log('[KiroServer] Login failed:', json.error)
                resolve({ success: false, error: json.error || 'Login failed' })
              }
            } catch (e) {
              console.error('[KiroServer] Login parse error:', e)
              resolve({ success: false, error: 'Server response format error' })
            }
          })
        })
        
        req.on('error', (e) => {
          console.error('[KiroServer] Login error:', e)
          resolve({ success: false, error: e.message })
        })
        req.on('timeout', () => { 
          console.error('[KiroServer] Login timeout')
          req.destroy()
          resolve({ success: false, error: 'Timeout' }) 
        })
        req.write(loginData)
        req.end()
      })
      
      console.log('[KiroServer] Login result:', loginResult)
      
      if (!loginResult.success || !loginResult.token) {
        return { success: false, error: loginResult.error || 'Login failed' }
      }
      
      // Use token to import accounts
      const importUrl = new URL('/api/admin/import-accounts', params.serverUrl)
      console.log('[KiroServer] Import URL:', importUrl.href)
      
      // Convert account format to server expected format
      const serverAccounts = params.accounts.map(acc => ({
        email: acc.email,
        accessToken: acc.accessToken || null,
        refreshToken: acc.refreshToken,
        clientId: acc.clientId || null,
        clientSecret: acc.clientSecret || null,
        region: acc.region || 'us-east-1',
        idp: acc.idp || 'BuilderId',
        authMethod: acc.authMethod || 'IdC'
      }))
      
      const postData = JSON.stringify({ accounts: serverAccounts })
      console.log('[KiroServer] Sending', serverAccounts.length, 'accounts, data size:', postData.length)
      
      return new Promise<{ success: boolean; imported?: number; failed?: number; errors?: string[]; error?: string }>((resolve) => {
        const req = httpModule.request({
          hostname: importUrl.hostname,
          port: importUrl.port || (isHttps ? 443 : 80),
          path: importUrl.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
            'X-Admin-Token': loginResult.token!
          },
          timeout: 120000  // Increase timeout to 2 minutes
        }, (res) => {
          let data = ''
          res.on('data', chunk => data += chunk)
          res.on('end', () => {
            console.log('[KiroServer] Import response status:', res.statusCode)
            console.log('[KiroServer] Import response:', data.substring(0, 500))
            
            // Handle 413 Payload Too Large error
            if (res.statusCode === 413) {
              resolve({ success: false, error: 'Data too large, please contact server admin to increase request body size limit, or reduce number of accounts to import' })
              return
            }
            
            try {
              const json = JSON.parse(data)
              if (res.statusCode === 401) {
                resolve({ success: false, error: 'Authentication failed, please check password' })
              } else if (json.success) {
                console.log('[KiroServer] Import result:', json)
                resolve({
                  success: true,
                  imported: json.imported || 0,
                  failed: json.failed || 0,
                  errors: json.errors || []
                })
              } else {
                resolve({ success: false, error: json.error || 'Import failed' })
              }
            } catch (e) {
              console.error('[KiroServer] Import parse error:', e)
              console.error('[KiroServer] Raw response:', data)
              resolve({ success: false, error: `Server response format error (HTTP ${res.statusCode})` })
            }
          })
        })
        
        req.on('error', (e) => {
          console.error('[KiroServer] Import error:', e)
          resolve({ success: false, error: `Connection failed: ${e.message}` })
        })
        
        req.on('timeout', () => {
          console.error('[KiroServer] Import timeout')
          req.destroy()
          resolve({ success: false, error: 'Request timeout' })
        })
        
        req.write(postData)
        req.end()
      })
    } catch (error) {
      console.error('[KiroServer] Error:', error)
      return { success: false, error: `Error: ${error instanceof Error ? error.message : String(error)}` }
    }
  })

  // IPC: Get Outlook email verification code (via Microsoft Graph API)
  // Parameter format: email|password|refresh_token|client_id
  ipcMain.handle('get-outlook-verification-code', async (_event, params: {
    email: string
    refreshToken: string  // OAuth2 token (refresh_token)
    clientId: string      // Graph API client_id
    senderFilter?: string[]
    minutes?: number
    timeout?: number
  }) => {
    console.log('[OutlookCode] ========== Starting verification code fetch ==========')
    console.log('[OutlookCode] email:', params.email)
    console.log('[OutlookCode] clientId:', params.clientId)
    console.log('[OutlookCode] refreshToken:', params.refreshToken ? `${params.refreshToken.substring(0, 30)}...` : 'EMPTY')
    
    if (!params.refreshToken || !params.clientId) {
      console.error('[OutlookCode] Missing required parameters')
      return { success: false, error: 'Missing refresh_token or client_id' }
    }
    
    // Verification code regex - reference Python implementation
    const CODE_PATTERNS = [
      /(?:verification\s*code|Your code is|code is)[：:\s]*(\d{6})/i,
      /(?:is)[：:\s]*(\d{6})\b/i,
      /^\s*(\d{6})\s*$/m,
      />\s*(\d{6})\s*</
    ]
    
    // HTML to text function
    const htmlToText = (htmlContent: string): string => {
      if (!htmlContent) return ''
      
      let text = htmlContent
        // Decode HTML entities
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
        .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
        // Remove style and script tags
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        // Remove HTML tags
        .replace(/<[^>]+>/g, ' ')
        // Clean extra whitespace
        .replace(/\s+/g, ' ')
        .trim()
      
      return text
    }
    
    // Extract verification code from text
    const extractCode = (text: string): string | null => {
      if (!text) return null
      
      for (const pattern of CODE_PATTERNS) {
        const matches = text.matchAll(new RegExp(pattern.source, pattern.flags + 'g'))
        for (const match of matches) {
          const code = match[1]
          if (code && /^\d{6}$/.test(code)) {
            // Get context to check if it's a color code
            const start = Math.max(0, (match.index || 0) - 20)
            const end = Math.min(text.length, (match.index || 0) + match[0].length + 20)
            const context = text.slice(start, end)
            
            // Exclude color codes
            if (/#[0-9a-fA-F]{6}/.test(context) && context.includes('#' + code)) continue
            if (/color[:\s]*[^;]*\d{6}/i.test(context)) continue
            if (/rgb|rgba|hsl/i.test(context)) continue
            // Exclude numbers longer than 6 digits
            if (/\d{7,}/.test(context)) continue
            
            return code
          }
        }
      }
      return null
    }
    
    try {
      // Try multiple token refresh methods - reference Python outlook_code_fetcher.py implementation
      // Note: Don't specify scope, let server return default permissions
      const tokenAttempts = [
        { url: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token', scope: null },
        { url: 'https://login.microsoftonline.com/common/oauth2/v2.0/token', scope: null },
      ]
      
      let accessToken: string | null = null
      
      for (const attempt of tokenAttempts) {
        try {
          const tokenBody = new URLSearchParams()
          tokenBody.append('client_id', params.clientId)
          tokenBody.append('refresh_token', params.refreshToken)
          tokenBody.append('grant_type', 'refresh_token')
          // Don't add scope, let server use original scope from refresh_token
          
          console.log('[OutlookCode] Trying to refresh token:', attempt.url)
          
          const tokenResponse = await fetch(attempt.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: tokenBody.toString()
          })
          
          const responseText = await tokenResponse.text()
          
          if (tokenResponse.ok) {
            const tokenResult = JSON.parse(responseText) as { access_token: string; refresh_token?: string }
            accessToken = tokenResult.access_token
            console.log('[OutlookCode] Successfully got access_token')
            break
          } else {
            console.log('[OutlookCode] Token refresh failed:', tokenResponse.status)
            console.log('[OutlookCode] Error response:', responseText.substring(0, 300))
          }
        } catch (e) {
          console.log('[OutlookCode] Token request exception:', e)
          continue
        }
      }
      
      if (!accessToken) {
        return { success: false, error: 'Token refresh failed, please check refresh_token and client_id' }
      }
      
      // Get emails - search all emails
      const graphUrl = 'https://graph.microsoft.com/v1.0/me/messages'
      const graphParams = new URLSearchParams({
        '$top': '50',
        '$orderby': 'receivedDateTime desc',
        '$select': 'id,subject,from,receivedDateTime,bodyPreview,body'
      })
      
      console.log('[OutlookCode] Fetching emails...')
      
      const mailResponse = await fetch(`${graphUrl}?${graphParams}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (!mailResponse.ok) {
        const errorText = await mailResponse.text()
        console.error('[OutlookCode] Failed to fetch emails:', mailResponse.status, errorText)
        return { success: false, error: `Failed to fetch emails: ${mailResponse.status}` }
      }
      
      const mailData = await mailResponse.json() as {
        value: Array<{
          id: string
          subject: string
          from: { emailAddress: { address: string } }
          receivedDateTime: string
          bodyPreview: string
          body: { content: string; contentType: string }
        }>
      }
      
      console.log('[OutlookCode] Got', mailData.value?.length || 0, 'emails')
      
      // Sender filter - default AWS related senders
      const senderFilter = params.senderFilter || [
        'no-reply@login.awsapps.com',
        'noreply@amazon.com',
        'account-update@amazon.com',
        'no-reply@aws.amazon.com',
        'noreply@aws.amazon.com',
        'aws'
      ]
      
      for (const mail of mailData.value || []) {
        const fromEmail = mail.from?.emailAddress?.address?.toLowerCase() || ''
        const subject = mail.subject || ''
        
        console.log('[OutlookCode] === Checking email ===')
        console.log('[OutlookCode] From:', fromEmail)
        console.log('[OutlookCode] Subject:', subject)
        
        // Check sender
        const senderMatch = senderFilter.some(s => fromEmail.includes(s.toLowerCase()))
        if (!senderMatch) {
          console.log('[OutlookCode] Skip - sender not matched')
          continue
        }
        
        // Try to extract verification code from multiple sources
        let code: string | null = null
        
        // 1. Extract from plain text body
        const bodyContent = mail.body?.content || ''
        const bodyText = htmlToText(bodyContent)
        console.log('[OutlookCode] Body length:', bodyText.length)
        console.log('[OutlookCode] Body preview:', bodyText.substring(0, 200))
        
        code = extractCode(bodyText)
        if (code) {
          console.log('[OutlookCode] Extracted code from body:', code)
          return { success: true, code }
        }
        
        // 2. Extract from HTML source
        code = extractCode(bodyContent)
        if (code) {
          console.log('[OutlookCode] Extracted code from HTML:', code)
          return { success: true, code }
        }
        
        // 3. Extract from preview
        code = extractCode(mail.bodyPreview || '')
        if (code) {
          console.log('[OutlookCode] Extracted code from preview:', code)
          return { success: true, code }
        }
        
        console.log('[OutlookCode] No code found in this email')
      }
      
      return { success: false, error: 'Verification code email not found' }
    } catch (error) {
      console.error('[OutlookCode] Error:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get verification code' }
    }
  })

  // IPC: Auto register AWS Builder ID (using built-in Playwright)
  ipcMain.handle('auto-register-aws', async (_event, params: {
    email: string
    emailPassword: string
    refreshToken: string
    clientId: string
    clientSecret?: string
    skipOutlookActivation?: boolean
    proxyUrl?: string
  }) => {
    console.log('[AutoRegister] Starting registration for:', params.email)
    if (params.proxyUrl) {
      console.log('[AutoRegister] Using proxy:', params.proxyUrl)
    }
    
    // Dynamic import auto register module
    const { autoRegisterAWS } = await import('./autoRegister')
    
    // Log callback
    const sendLog = (message: string) => {
      console.log('[AutoRegister]', message)
      mainWindow?.webContents.send('auto-register-log', { email: params.email, message })
    }
    
    try {
      const result = await autoRegisterAWS(
        params.email,
        params.refreshToken,
        params.clientId,
        sendLog,
        params.emailPassword,
        params.skipOutlookActivation || false,
        params.proxyUrl,
        params.clientSecret
      )
      
      return result
    } catch (error) {
      console.error('[AutoRegister] Error:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Registration failed' }
    }
  })

  // IPC: Activate Outlook email only
  ipcMain.handle('activate-outlook', async (_event, params: {
    email: string
    emailPassword: string
  }) => {
    console.log('[ActivateOutlook] Starting activation for:', params.email)
    
    // Dynamic import auto register module
    const { activateOutlook } = await import('./autoRegister')
    
    // Log callback
    const sendLog = (message: string) => {
      console.log('[ActivateOutlook]', message)
      mainWindow?.webContents.send('auto-register-log', { email: params.email, message })
    }
    
    try {
      const result = await activateOutlook(
        params.email,
        params.emailPassword,
        sendLog
      )
      
      return result
    } catch (error) {
      console.error('[ActivateOutlook] Error:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Activation failed' }
    }
  })

  // Update protocol handler to support Social Auth callback
  const originalHandleProtocolUrl = handleProtocolUrl
  // @ts-ignore - Redefine protocol handler
  handleProtocolUrl = (url: string): void => {
    if (!url.startsWith(`${PROTOCOL_PREFIX}://`)) return

    try {
      const urlObj = new URL(url)
      
      // Handle Social Auth callback (kiro://kiro.kiroAgent/authenticate-success)
      if (url.includes('authenticate-success') || url.includes('auth')) {
        const code = urlObj.searchParams.get('code')
        const state = urlObj.searchParams.get('state')
        const error = urlObj.searchParams.get('error')

        if (error) {
          console.log('[Login] Auth callback error:', error)
          if (mainWindow) {
            mainWindow.webContents.send('social-auth-callback', { error })
            mainWindow.focus()
          }
          return
        }

        if (code && state && mainWindow) {
          console.log('[Login] Auth callback received, code:', code.substring(0, 20) + '...')
          mainWindow.webContents.send('social-auth-callback', { code, state })
          mainWindow.focus()
        }
        return
      }

      // Call original handler for other protocols
      originalHandleProtocolUrl(url)
    } catch (error) {
      console.error('Failed to parse protocol URL:', error)
    }
  }

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Windows/Linux: Handle second instance and protocol URL
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, commandLine) => {
    // Windows: Protocol URL is passed as command line argument
    const url = commandLine.find((arg) => arg.startsWith(`${PROTOCOL_PREFIX}://`))
    if (url) {
      handleProtocolUrl(url)
    }

    // Focus main window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

// macOS: Handle protocol URL
app.on('open-url', (_event, url) => {
  handleProtocolUrl(url)
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Unregister URI protocol handler and save data before app exit
app.on('will-quit', async (event) => {
  // Prevent app from quitting immediately, save data first
  if (lastSavedData && store) {
    event.preventDefault()
    
    try {
      console.log('[Exit] Saving data before quit...')
      store.set('accountData', lastSavedData)
      await createBackup(lastSavedData)
      console.log('[Exit] Data saved successfully')
    } catch (error) {
      console.error('[Exit] Failed to save data:', error)
    }
    
    unregisterProtocol()
    app.exit(0)
  } else {
    unregisterProtocol()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
