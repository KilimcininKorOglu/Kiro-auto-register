import { useAccountsStore } from '@/store/accounts'
import { Card, CardContent, CardHeader, CardTitle, Button } from '../ui'
import { Eye, EyeOff, RefreshCw, Clock, Trash2, Download, Upload, Globe, Repeat, Palette, Moon, Sun, Fingerprint, Info, ChevronDown, ChevronUp, Settings, Database, Layers, Server, Send, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { ExportDialog } from '../accounts/ExportDialog'

// Theme configuration - grouped by color family
const themeGroups = [
  {
    name: 'Blue',
    themes: [
      { id: 'default', name: 'Sky Blue', color: '#3b82f6' },
      { id: 'indigo', name: 'Indigo', color: '#6366f1' },
      { id: 'cyan', name: 'Cyan', color: '#06b6d4' },
      { id: 'sky', name: 'Clear Sky', color: '#0ea5e9' },
      { id: 'teal', name: 'Teal', color: '#14b8a6' },
    ]
  },
  {
    name: 'Purple & Pink',
    themes: [
      { id: 'purple', name: 'Purple', color: '#a855f7' },
      { id: 'violet', name: 'Violet', color: '#8b5cf6' },
      { id: 'fuchsia', name: 'Fuchsia', color: '#d946ef' },
      { id: 'pink', name: 'Pink', color: '#ec4899' },
      { id: 'rose', name: 'Rose', color: '#f43f5e' },
    ]
  },
  {
    name: 'Warm',
    themes: [
      { id: 'red', name: 'Red', color: '#ef4444' },
      { id: 'orange', name: 'Orange', color: '#f97316' },
      { id: 'amber', name: 'Amber', color: '#f59e0b' },
      { id: 'yellow', name: 'Yellow', color: '#eab308' },
    ]
  },
  {
    name: 'Green',
    themes: [
      { id: 'emerald', name: 'Emerald', color: '#10b981' },
      { id: 'green', name: 'Green', color: '#22c55e' },
      { id: 'lime', name: 'Lime', color: '#84cc16' },
    ]
  },
  {
    name: 'Neutral',
    themes: [
      { id: 'slate', name: 'Slate', color: '#64748b' },
      { id: 'zinc', name: 'Zinc', color: '#71717a' },
      { id: 'stone', name: 'Stone', color: '#78716c' },
      { id: 'neutral', name: 'Neutral', color: '#737373' },
    ]
  }
]

export function SettingsPage() {
  const { 
    privacyMode, 
    setPrivacyMode,
    autoRefreshEnabled,
    autoRefreshInterval,
    autoRefreshConcurrency,
    setAutoRefresh,
    setAutoRefreshConcurrency,
    proxyEnabled,
    proxyUrl,
    setProxy,
    autoSwitchEnabled,
    autoSwitchThreshold,
    autoSwitchInterval,
    setAutoSwitch,
    batchImportConcurrency,
    setBatchImportConcurrency,
    kiroServerUrl,
    kiroServerPassword,
    setKiroServer,
    theme,
    darkMode,
    setTheme,
    setDarkMode,
    accounts,
    importFromExportData
  } = useAccountsStore()

  const [showExportDialog, setShowExportDialog] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [tempProxyUrl, setTempProxyUrl] = useState(proxyUrl)
  const [themeExpanded, setThemeExpanded] = useState(false)

  // Kiro server related state
  const [tempServerUrl, setTempServerUrl] = useState(kiroServerUrl)
  const [tempServerPassword, setTempServerPassword] = useState(kiroServerPassword)
  const [serverTestStatus, setServerTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [serverTestError, setServerTestError] = useState('')
  const [isImportingToServer, setIsImportingToServer] = useState(false)
  const [importResult, setImportResult] = useState<{ imported: number; failed: number; errors: string[] } | null>(null)

  const handleExport = () => {
    setShowExportDialog(true)
  }

  const handleImport = async () => {
    setIsImporting(true)
    try {
      const fileData = await window.api.importFromFile()
      if (fileData && 'content' in fileData && fileData.format === 'json') {
        const data = JSON.parse(fileData.content)
        const importResult = importFromExportData(data)
        alert(`Import complete: ${importResult.success} succeeded, ${importResult.failed} failed`)
      } else if (fileData && 'isMultiple' in fileData) {
        alert('Settings page does not support batch import, please use Account Management page')
      } else if (fileData) {
        alert('Settings page only supports JSON format import, please use Account Management page for CSV/TXT')
      }
    } catch (e) {
      alert(`Import failed: ${e instanceof Error ? e.message : 'Unknown error'}`)
    } finally {
      setIsImporting(false)
    }
  }

  const handleClearData = () => {
    if (confirm('Are you sure you want to clear all account data? This action cannot be undone!')) {
      if (confirm('Confirm again: This will delete all accounts, groups, and tags!')) {
        // Clear all data
        Array.from(accounts.keys()).forEach(id => {
          useAccountsStore.getState().removeAccount(id)
        })
        alert('All data has been cleared')
      }
    }
  }

  // Test server connection
  const handleTestServerConnection = async () => {
    if (!tempServerUrl || !tempServerPassword) {
      alert('Please enter server address and password')
      return
    }
    
    setServerTestStatus('testing')
    setServerTestError('')
    
    try {
      const result = await window.api.testKiroServerConnection(tempServerUrl, tempServerPassword)
      if (result.success) {
        setServerTestStatus('success')
        // Save settings
        setKiroServer(tempServerUrl, tempServerPassword)
      } else {
        setServerTestStatus('error')
        setServerTestError(result.error || 'Connection failed')
      }
    } catch (error) {
      setServerTestStatus('error')
      setServerTestError(error instanceof Error ? error.message : 'Unknown error')
    }
  }

  // Import accounts to server
  const handleImportToServer = async () => {
    if (!kiroServerUrl || !kiroServerPassword) {
      alert('Please configure and test server connection first')
      return
    }
    
    const accountList = Array.from(accounts.values())
    if (accountList.length === 0) {
      alert('No accounts to import')
      return
    }
    
    if (!confirm(`Are you sure you want to import ${accountList.length} accounts to the server?`)) {
      return
    }
    
    setIsImportingToServer(true)
    setImportResult(null)
    
    try {
      const result = await window.api.importToKiroServer({
        serverUrl: kiroServerUrl,
        password: kiroServerPassword,
        accounts: accountList
          .filter(acc => acc.credentials.refreshToken) // Filter out accounts without refreshToken
          .map(acc => ({
            email: acc.email,
            accessToken: acc.credentials.accessToken,
            refreshToken: acc.credentials.refreshToken!,
            clientId: acc.credentials.clientId,
            clientSecret: acc.credentials.clientSecret,
            region: acc.credentials.region,
            idp: acc.idp,
            authMethod: acc.credentials.authMethod
          }))
      })
      
      if (result.success) {
        setImportResult({
          imported: result.imported || 0,
          failed: result.failed || 0,
          errors: result.errors || []
        })
      } else {
        alert(`Import failed: ${result.error}`)
      }
    } catch (error) {
      alert(`Import error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsImportingToServer(false)
    }
  }

  return (
    <div className="flex-1 p-6 space-y-6 overflow-auto">
      {/* Page header */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 p-6 border border-primary/20">
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-primary/20 to-transparent rounded-full blur-2xl" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-primary/20 to-transparent rounded-full blur-2xl" />
        <div className="relative flex items-center gap-4">
          <div className="p-3 rounded-xl bg-primary shadow-lg shadow-primary/25">
            <Settings className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-primary">Settings</h1>
            <p className="text-muted-foreground">Configure application features</p>
          </div>
        </div>
      </div>

      {/* Theme settings */}
      <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Palette className="h-4 w-4 text-primary" />
            </div>
            Theme Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Dark mode */}
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Dark Mode</p>
              <p className="text-sm text-muted-foreground">Toggle dark/light theme</p>
            </div>
            <Button
              variant={darkMode ? "default" : "outline"}
              size="sm"
              onClick={() => setDarkMode(!darkMode)}
            >
              {darkMode ? <Moon className="h-4 w-4 mr-2" /> : <Sun className="h-4 w-4 mr-2" />}
              {darkMode ? 'Dark' : 'Light'}
            </Button>
          </div>

          {/* Theme color */}
          <div className="pt-2 border-t">
            <button 
              className="flex items-center justify-between w-full text-left"
              onClick={() => setThemeExpanded(!themeExpanded)}
            >
              <div className="flex items-center gap-2">
                <p className="font-medium">Theme Color</p>
                {!themeExpanded && (
                  <div 
                    className="w-5 h-5 rounded-full ring-2 ring-primary ring-offset-1"
                    style={{ backgroundColor: themeGroups.flatMap(g => g.themes).find(t => t.id === theme)?.color || '#3b82f6' }}
                  />
                )}
              </div>
              {themeExpanded ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
            {themeExpanded && (
              <div className="space-y-3 mt-3">
                {themeGroups.map((group) => (
                  <div key={group.name} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-14 shrink-0">{group.name}</span>
                    <div className="flex flex-wrap gap-2">
                      {group.themes.map((t) => (
                        <button
                          key={t.id}
                          className={`group relative w-7 h-7 rounded-full transition-all ${
                            theme === t.id 
                              ? 'ring-2 ring-primary ring-offset-2 scale-110' 
                              : 'hover:scale-110 hover:shadow-md'
                          }`}
                          style={{ backgroundColor: t.color }}
                          onClick={() => setTheme(t.id)}
                          title={t.name}
                        >
                          <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity bg-popover px-1.5 py-0.5 rounded shadow-sm border pointer-events-none z-10">
                            {t.name}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Privacy settings */}
      <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              {privacyMode ? <EyeOff className="h-4 w-4 text-primary" /> : <Eye className="h-4 w-4 text-primary" />}
            </div>
            Privacy Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Privacy Mode</p>
              <p className="text-sm text-muted-foreground">Hide email and sensitive account information</p>
            </div>
            <Button
              variant={privacyMode ? "default" : "outline"}
              size="sm"
              onClick={() => setPrivacyMode(!privacyMode)}
            >
              {privacyMode ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
              {privacyMode ? 'Enabled' : 'Disabled'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Token refresh settings */}
      <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <RefreshCw className="h-4 w-4 text-primary" />
            </div>
            Auto Refresh
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Auto Refresh</p>
              <p className="text-sm text-muted-foreground">Automatically refresh tokens before expiry and sync account info</p>
            </div>
            <Button
              variant={autoRefreshEnabled ? "default" : "outline"}
              size="sm"
              onClick={() => setAutoRefresh(!autoRefreshEnabled)}
            >
              {autoRefreshEnabled ? 'Enabled' : 'Disabled'}
            </Button>
          </div>

          {autoRefreshEnabled && (
            <>
              <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3 space-y-1">
                <p>• Automatically refresh tokens before expiry to maintain login status</p>
                <p>• Automatically update account usage and subscription info after token refresh</p>
                <p>• When auto-switch is enabled, periodically check all account balances</p>
              </div>
              <div className="flex items-center justify-between pt-2 border-t">
                <div>
                  <p className="font-medium">Check Interval</p>
                  <p className="text-sm text-muted-foreground">How often to check account status</p>
                </div>
                <select
                  className="w-[120px] h-9 px-3 rounded-lg border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                  value={autoRefreshInterval}
                  onChange={(e) => setAutoRefresh(true, parseInt(e.target.value))}
                >
                  <option value="1">1 min</option>
                  <option value="3">3 min</option>
                  <option value="5">5 min</option>
                  <option value="10">10 min</option>
                  <option value="15">15 min</option>
                  <option value="20">20 min</option>
                  <option value="30">30 min</option>
                  <option value="45">45 min</option>
                  <option value="60">60 min</option>
                </select>
              </div>
              <div className="flex items-center justify-between pt-2 border-t">
                <div>
                  <p className="font-medium">Refresh Concurrency</p>
                  <p className="text-sm text-muted-foreground">Number of accounts to refresh simultaneously, too high may cause lag</p>
                </div>
                <input
                  type="number"
                  className="w-24 h-9 px-3 rounded-lg border bg-background text-sm text-center focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                  value={autoRefreshConcurrency}
                  min={1}
                  max={500}
                  onChange={(e) => setAutoRefreshConcurrency(parseInt(e.target.value) || 50)}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Proxy settings */}
      <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Globe className="h-4 w-4 text-primary" />
            </div>
            Proxy Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Enable Proxy</p>
              <p className="text-sm text-muted-foreground">All network requests will go through the proxy server</p>
            </div>
            <Button
              variant={proxyEnabled ? "default" : "outline"}
              size="sm"
              onClick={() => setProxy(!proxyEnabled, tempProxyUrl)}
            >
              {proxyEnabled ? 'Enabled' : 'Disabled'}
            </Button>
          </div>

          <div className="space-y-2 pt-2 border-t">
            <label className="text-sm font-medium">Proxy Address</label>
            <div className="flex gap-2">
              <input
                type="text"
                className="flex-1 h-9 px-3 rounded-lg border bg-background text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                placeholder="http://127.0.0.1:7890 or socks5://127.0.0.1:1080"
                value={tempProxyUrl}
                onChange={(e) => setTempProxyUrl(e.target.value)}
              />
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setProxy(proxyEnabled, tempProxyUrl)}
                disabled={tempProxyUrl === proxyUrl}
              >
                Save
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Supports HTTP/HTTPS/SOCKS5 proxy, format: protocol://host:port
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Auto switch settings */}
      <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Repeat className="h-4 w-4 text-primary" />
            </div>
            Auto Switch
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Enable Auto Switch</p>
              <p className="text-sm text-muted-foreground">Automatically switch to another available account when balance is low</p>
            </div>
            <Button
              variant={autoSwitchEnabled ? "default" : "outline"}
              size="sm"
              onClick={() => setAutoSwitch(!autoSwitchEnabled)}
            >
              {autoSwitchEnabled ? 'Enabled' : 'Disabled'}
            </Button>
          </div>

          {autoSwitchEnabled && (
            <>
              <div className="flex items-center justify-between pt-2 border-t">
                <div>
                  <p className="font-medium">Balance Threshold</p>
                  <p className="text-sm text-muted-foreground">Auto switch when balance falls below this value</p>
                </div>
                <input
                  type="number"
                  className="w-20 h-9 px-3 rounded-lg border bg-background text-sm text-center focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                  value={autoSwitchThreshold}
                  min={0}
                  onChange={(e) => setAutoSwitch(true, parseInt(e.target.value) || 0)}
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t">
                <div>
                  <p className="font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Check Interval
                  </p>
                  <p className="text-sm text-muted-foreground">How often to check balance</p>
                </div>
                <select
                  className="h-9 px-3 rounded-lg border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                  value={autoSwitchInterval}
                  onChange={(e) => setAutoSwitch(true, undefined, parseInt(e.target.value))}
                >
                  <option value="1">1 min</option>
                  <option value="3">3 min</option>
                  <option value="5">5 min</option>
                  <option value="10">10 min</option>
                  <option value="15">15 min</option>
                  <option value="30">30 min</option>
                </select>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Batch import settings */}
      <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Layers className="h-4 w-4 text-primary" />
            </div>
            Batch Import
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Concurrency</p>
              <p className="text-sm text-muted-foreground">Number of accounts to validate simultaneously, too high may cause API rate limiting</p>
            </div>
            <input
              type="number"
              className="w-24 h-9 px-3 rounded-lg border bg-background text-sm text-center focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
              value={batchImportConcurrency}
              min={1}
              max={500}
              onChange={(e) => setBatchImportConcurrency(parseInt(e.target.value) || 100)}
            />
          </div>
          <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-2">
            Recommended range: 10-100. Too high may cause many "validation failed" errors, too low will slow down import speed.
          </p>
        </CardContent>
      </Card>

      {/* Machine ID management hint */}
      <Card className="border-0 shadow-sm bg-primary/5 border-primary/20 hover:shadow-md transition-shadow duration-200">
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Fingerprint className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-sm">Machine ID Management</p>
              <p className="text-xs text-muted-foreground">
                Modify device identifier, auto-change on account switch, account machine ID binding, etc.
              </p>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Info className="h-3 w-3" />
              <span>Please set in sidebar "Machine ID"</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Kiro server import */}
      <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Server className="h-4 w-4 text-primary" />
            </div>
            Kiro Server Import
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
            Batch import local accounts to Kiro unlimited refill server for account pool sharing
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Server Address</label>
            <input
              type="text"
              className="w-full h-9 px-3 rounded-lg border bg-background text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
              placeholder="http://your-server:18888"
              value={tempServerUrl}
              onChange={(e) => {
                setTempServerUrl(e.target.value)
                setServerTestStatus('idle')
              }}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Admin Password</label>
            <input
              type="password"
              className="w-full h-9 px-3 rounded-lg border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
              placeholder="Server admin password"
              value={tempServerPassword}
              onChange={(e) => {
                setTempServerPassword(e.target.value)
                setServerTestStatus('idle')
              }}
            />
          </div>

          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleTestServerConnection}
              disabled={serverTestStatus === 'testing' || !tempServerUrl || !tempServerPassword}
            >
              {serverTestStatus === 'testing' ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : serverTestStatus === 'success' ? (
                <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
              ) : serverTestStatus === 'error' ? (
                <XCircle className="h-4 w-4 mr-2 text-red-500" />
              ) : (
                <Globe className="h-4 w-4 mr-2" />
              )}
              {serverTestStatus === 'testing' ? 'Testing...' : 'Test Connection'}
            </Button>
            
            {serverTestStatus === 'success' && (
              <span className="text-sm text-green-500">Connection successful</span>
            )}
            {serverTestStatus === 'error' && (
              <span className="text-sm text-red-500">{serverTestError}</span>
            )}
          </div>

          <div className="flex items-center justify-between pt-2 border-t">
            <div>
              <p className="font-medium">Import to Server</p>
              <p className="text-sm text-muted-foreground">
                Import {accounts.size} accounts to server account pool
              </p>
            </div>
            <Button 
              variant="default" 
              size="sm" 
              onClick={handleImportToServer}
              disabled={isImportingToServer || !kiroServerUrl || !kiroServerPassword || accounts.size === 0}
            >
              {isImportingToServer ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              {isImportingToServer ? 'Importing...' : 'Import'}
            </Button>
          </div>

          {importResult && (
            <div className={`text-sm p-3 rounded-lg ${importResult.failed > 0 ? 'bg-yellow-50 text-yellow-700' : 'bg-green-50 text-green-700'}`}>
              <p>Import complete: {importResult.imported} succeeded, {importResult.failed} failed</p>
              {importResult.errors.length > 0 && (
                <div className="mt-2 text-xs">
                  <p className="font-medium">Error details:</p>
                  <ul className="list-disc list-inside">
                    {importResult.errors.slice(0, 5).map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                    {importResult.errors.length > 5 && (
                      <li>...and {importResult.errors.length - 5} more errors</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Data management */}
      <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Database className="h-4 w-4 text-primary" />
            </div>
            Data Management
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Export Data</p>
              <p className="text-sm text-muted-foreground">Supports JSON, TXT, CSV, clipboard and other formats</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>

          <div className="flex items-center justify-between pt-2 border-t">
            <div>
              <p className="font-medium">Import Data</p>
              <p className="text-sm text-muted-foreground">Import account data from JSON file</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleImport} disabled={isImporting}>
              <Upload className="h-4 w-4 mr-2" />
              {isImporting ? 'Importing...' : 'Import'}
            </Button>
          </div>

          <div className="flex items-center justify-between pt-2 border-t">
            <div>
              <p className="font-medium text-destructive">Clear All Data</p>
              <p className="text-sm text-muted-foreground">Delete all accounts, groups, and tags</p>
            </div>
            <Button variant="destructive" size="sm" onClick={handleClearData}>
              <Trash2 className="h-4 w-4 mr-2" />
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Export dialog */}
      <ExportDialog
        open={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        accounts={Array.from(accounts.values())}
        selectedCount={0}
      />
    </div>
  )
}
