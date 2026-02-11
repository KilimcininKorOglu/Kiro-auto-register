import { useState, useCallback, useRef, useEffect } from 'react'
import { 
  Play, 
  Square, 
  Upload, 
  Trash2, 
  Copy, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Loader2,
  Mail,
  Key,
  RefreshCw,
  AlertCircle,
  Terminal,
  Zap
} from 'lucide-react'
import { Button } from '../ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { useAccountsStore } from '@/store/accounts'
import { useAutoRegisterStore, type RegisterAccount } from '@/store/autoRegister'
import { v4 as uuidv4 } from 'uuid'

export function AutoRegisterPage() {
  const [inputText, setInputText] = useState('')
  const logEndRef = useRef<HTMLDivElement>(null)
  
  // Use global store
  const {
    accounts,
    isRunning,
    logs,
    concurrency,
    skipOutlookActivation,
    delayBetweenRegistrations,
    addAccounts,
    clearAccounts,
    updateAccountStatus,
    addLog,
    clearLogs,
    setIsRunning,
    setConcurrency,
    setSkipOutlookActivation,
    setDelayBetweenRegistrations,
    requestStop,
    resetStop,
    getStats
  } = useAutoRegisterStore()
  
  const { addAccount, saveToStorage, proxyUrl, setProxy, accounts: existingAccounts } = useAccountsStore()

  // Check if email already exists
  const isEmailExists = useCallback((email: string): boolean => {
    const emailLower = email.toLowerCase()
    return Array.from(existingAccounts.values()).some(
      acc => acc.email.toLowerCase() === emailLower
    )
  }, [existingAccounts])

  // Listen for real-time logs from main process
  useEffect(() => {
    const unsubscribe = window.api.onAutoRegisterLog((data) => {
      addLog(`[${data.email.split('@')[0]}] ${data.message}`)
    })
    return () => unsubscribe()
  }, [addLog])

  // Auto scroll to bottom of logs
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const parseAccounts = (text: string): RegisterAccount[] => {
    const lines = text.trim().split('\n')
    const parsed: RegisterAccount[] = []
    
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      
      const parts = trimmed.split('|')
      if (parts.length >= 1 && parts[0].includes('@')) {
        const email = parts[0].trim()
        // Check if already exists
        const exists = isEmailExists(email)
        parsed.push({
          id: uuidv4(),
          email,
          password: parts[1]?.trim() || '',
          refreshToken: parts[2]?.trim() || '',
          clientId: parts[3]?.trim() || '',
          clientSecret: parts[4]?.trim() || '',
          status: exists ? 'exists' : 'pending'
        })
      }
    }
    
    return parsed
  }

  const handleImport = () => {
    const parsed = parseAccounts(inputText)
    if (parsed.length === 0) {
      alert('No valid email accounts found')
      return
    }
    const existsCount = parsed.filter(a => a.status === 'exists').length
    addAccounts(parsed)
    setInputText('')
    addLog(`Imported ${parsed.length} email accounts${existsCount > 0 ? `, ${existsCount} already exist` : ''}`)
  }

  const handleImportFile = async () => {
    try {
      const result = await window.api.openFile({
        filters: [{ name: 'Text Files', extensions: ['txt'] }]
      })
      
      if (result && 'content' in result) {
        const parsed = parseAccounts(result.content)
        if (parsed.length > 0) {
          const existsCount = parsed.filter(a => a.status === 'exists').length
          addAccounts(parsed)
          addLog(`Imported ${parsed.length} email accounts from file${existsCount > 0 ? `, ${existsCount} already exist` : ''}`)
        }
      }
    } catch (error) {
      addLog(`Failed to import file: ${error}`)
    }
  }

  const handleClear = () => {
    if (isRunning) {
      alert('Please stop registration first')
      return
    }
    clearAccounts()
  }

  // Import account using SSO Token
  const importWithSsoToken = async (account: RegisterAccount, ssoToken: string, name: string) => {
    try {
      addLog(`[${account.email}] Importing account via SSO Token...`)
      
      const result = await window.api.importFromSsoToken(ssoToken, 'us-east-1')
      
      if (result.success && result.data) {
        const { data } = result
        
        // Determine idp type
        const idpValue = data.idp as 'Google' | 'Github' | 'BuilderId' | 'AWSIdC' | 'Internal' || 'BuilderId'
        
        // Determine subscription type
        let subscriptionType: 'Free' | 'Pro' | 'Pro_Plus' | 'Enterprise' | 'Teams' = 'Free'
        const subType = data.subscriptionType?.toUpperCase() || ''
        if (subType.includes('PRO_PLUS') || subType.includes('PRO+')) {
          subscriptionType = 'Pro_Plus'
        } else if (subType.includes('PRO')) {
          subscriptionType = 'Pro'
        } else if (subType.includes('ENTERPRISE')) {
          subscriptionType = 'Enterprise'
        } else if (subType.includes('TEAMS')) {
          subscriptionType = 'Teams'
        }
        
        addAccount({
          email: data.email || account.email,
          nickname: name,
          idp: idpValue,
          credentials: {
            accessToken: data.accessToken,
            csrfToken: '',
            refreshToken: data.refreshToken,
            clientId: data.clientId,
            clientSecret: data.clientSecret,
            region: data.region || 'us-east-1',
            authMethod: 'IdC',
            expiresAt: Date.now() + (data.expiresIn || 3600) * 1000
          },
          subscription: { 
            type: subscriptionType,
            title: data.subscriptionTitle
          },
          usage: data.usage ? {
            current: data.usage.current,
            limit: data.usage.limit,
            percentUsed: data.usage.limit > 0 ? (data.usage.current / data.usage.limit) * 100 : 0,
            lastUpdated: Date.now()
          } : { current: 0, limit: 50, percentUsed: 0, lastUpdated: Date.now() },
          tags: [],
          status: 'active',
          lastUsedAt: Date.now()
        })
        
        saveToStorage()
        addLog(`[${account.email}] Successfully added to account manager`)
        return true
      } else {
        addLog(`[${account.email}] SSO Token import failed: ${result.error?.message || 'Unknown error'}`)
        return false
      }
    } catch (error) {
      addLog(`[${account.email}] Import error: ${error}`)
      return false
    }
  }

  // Single account registration task (using global store's shouldStop)
  const registerSingleAccount = async (account: RegisterAccount): Promise<void> => {
    // Check global stop flag
    if (useAutoRegisterStore.getState().shouldStop) return
    if (account.status === 'success' || account.status === 'exists') return
    
    try {
      updateAccountStatus(account.id, { status: 'registering' })
      addLog(`[${account.email}] Starting registration...`)
      
      // Call main process auto-register function
      const result = await window.api.autoRegisterAWS({
        email: account.email,
        emailPassword: account.password,
        refreshToken: account.refreshToken,
        clientId: account.clientId,
        clientSecret: account.clientSecret,
        skipOutlookActivation: useAutoRegisterStore.getState().skipOutlookActivation,
        proxyUrl: proxyUrl || undefined
      })
      
      if (result.success && result.ssoToken) {
        updateAccountStatus(account.id, { 
          status: 'success', 
          ssoToken: result.ssoToken,
          awsName: result.name
        })
        addLog(`[${account.email}] Registration successful!`)
        
        // Import account using SSO Token
        await importWithSsoToken(account, result.ssoToken, result.name || account.email.split('@')[0])
        
      } else {
        updateAccountStatus(account.id, { 
          status: 'failed', 
          error: result.error || 'Registration failed'
        })
        addLog(`[${account.email}] Registration failed: ${result.error}`)
      }
      
    } catch (error) {
      updateAccountStatus(account.id, { 
        status: 'failed', 
        error: String(error)
      })
      addLog(`[${account.email}] Error: ${error}`)
    }
  }

  const startRegistration = async () => {
    // Filter out already existing and successful accounts
    const pendingAccounts = accounts.filter(a => a.status === 'pending' || a.status === 'failed')
    
    if (pendingAccounts.length === 0) {
      alert('No accounts to register (existing or successful accounts are skipped)')
      return
    }
    
    setIsRunning(true)
    resetStop()
    const delay = useAutoRegisterStore.getState().delayBetweenRegistrations
    addLog(`========== Starting batch registration (concurrency: ${concurrency}, delay: ${delay}s) ==========`)
    addLog(`Pending: ${pendingAccounts.length}, Skipped: ${accounts.length - pendingAccounts.length}`)
    
    // Helper function to wait
    const sleep = (seconds: number) => new Promise(resolve => setTimeout(resolve, seconds * 1000))
    
    // Execute registration tasks concurrently with delay
    const runConcurrent = async () => {
      const queue = [...pendingAccounts]
      const running: Promise<void>[] = []
      let isFirstBatch = true
      
      while (queue.length > 0 || running.length > 0) {
        // Check global stop flag
        if (useAutoRegisterStore.getState().shouldStop) {
          addLog('User stopped registration')
          break
        }
        
        // Add delay before starting new batch (except first batch)
        if (!isFirstBatch && running.length === 0 && queue.length > 0) {
          const currentDelay = useAutoRegisterStore.getState().delayBetweenRegistrations
          if (currentDelay > 0) {
            addLog(`Waiting ${currentDelay} seconds before next batch...`)
            await sleep(currentDelay)
            if (useAutoRegisterStore.getState().shouldStop) {
              addLog('User stopped registration')
              break
            }
          }
        }
        
        // Fill up to concurrency limit
        while (queue.length > 0 && running.length < concurrency) {
          const account = queue.shift()!
          const task = registerSingleAccount(account).then(() => {
            // Remove from running when task completes
            const index = running.indexOf(task)
            if (index > -1) running.splice(index, 1)
          })
          running.push(task)
        }
        
        isFirstBatch = false
        
        // Wait for any task to complete
        if (running.length > 0) {
          await Promise.race(running)
        }
      }
    }
    
    await runConcurrent()
    
    setIsRunning(false)
    const stats = getStats()
    addLog(`========== Registration complete: ${stats.success} succeeded, ${stats.failed} failed ==========`)
  }

  const stopRegistration = () => {
    requestStop()
    addLog('Stopping registration...')
  }

  const copyToken = (token: string) => {
    navigator.clipboard.writeText(token)
  }

  const getStatusBadge = (status: RegisterAccount['status']) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Pending</Badge>
      case 'exists':
        return <Badge variant="outline" className="text-orange-500 border-orange-500"><AlertCircle className="w-3 h-3 mr-1" />Exists</Badge>
      case 'activating':
        return <Badge variant="default" className="bg-purple-500"><Zap className="w-3 h-3 mr-1 animate-pulse" />Activating</Badge>
      case 'registering':
        return <Badge variant="default"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Registering</Badge>
      case 'getting_code':
        return <Badge variant="default"><Mail className="w-3 h-3 mr-1" />Getting Code</Badge>
      case 'success':
        return <Badge variant="default" className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Success</Badge>
      case 'failed':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>
    }
  }

  // Single Outlook activation task
  const activateSingleOutlook = async (account: RegisterAccount): Promise<void> => {
    if (useAutoRegisterStore.getState().shouldStop) return
    
    try {
      updateAccountStatus(account.id, { status: 'activating' })
      addLog(`[${account.email}] Starting Outlook activation...`)
      
      const result = await window.api.activateOutlook({
        email: account.email,
        emailPassword: account.password
      })
      
      if (result.success) {
        updateAccountStatus(account.id, { status: 'pending' })
        addLog(`[${account.email}] Outlook activation successful!`)
      } else {
        addLog(`[${account.email}] Outlook activation may not be complete: ${result.error}`)
      }
      
    } catch (error) {
      addLog(`[${account.email}] Activation error: ${error}`)
    }
  }

  // Activate Outlook emails only (supports concurrency)
  const activateOutlookOnly = async () => {
    const outlookAccounts = accounts.filter(a => 
      a.email.toLowerCase().includes('outlook') && 
      a.password && 
      a.status !== 'exists' && 
      a.status !== 'success'
    )
    
    if (outlookAccounts.length === 0) {
      alert('No Outlook email accounts found that need activation')
      return
    }
    
    setIsRunning(true)
    resetStop()
    addLog(`========== Starting batch Outlook activation (concurrency: ${concurrency}) ==========`)
    
    // Execute activation tasks concurrently
    const runConcurrent = async () => {
      const queue = [...outlookAccounts]
      const running: Promise<void>[] = []
      
      while (queue.length > 0 || running.length > 0) {
        if (useAutoRegisterStore.getState().shouldStop) {
          addLog('User stopped activation')
          break
        }
        
        while (queue.length > 0 && running.length < concurrency) {
          const account = queue.shift()!
          const task = activateSingleOutlook(account).then(() => {
            const index = running.indexOf(task)
            if (index > -1) running.splice(index, 1)
          })
          running.push(task)
        }
        
        if (running.length > 0) {
          await Promise.race(running)
        }
      }
    }
    
    await runConcurrent()
    
    setIsRunning(false)
    addLog('========== Outlook activation process complete ==========')
  }

  const stats = getStats()

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">AWS Auto Register</h1>
          <p className="text-muted-foreground">
            Automatically register AWS Builder ID and add to account manager
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <input
            type="text"
            placeholder="Proxy address (e.g. http://127.0.0.1:7890)"
            value={proxyUrl}
            onChange={(e) => setProxy(true, e.target.value)}
            disabled={isRunning}
            className="px-3 py-1.5 border rounded-lg bg-background text-sm w-56"
          />
          <div className="flex items-center gap-1">
            <span className="text-sm text-muted-foreground">Concurrency:</span>
            <select
              value={concurrency}
              onChange={(e) => setConcurrency(Number(e.target.value))}
              disabled={isRunning}
              className="px-2 py-1.5 border rounded-lg bg-background text-sm w-16"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-sm text-muted-foreground">Delay:</span>
            <select
              value={delayBetweenRegistrations}
              onChange={(e) => setDelayBetweenRegistrations(Number(e.target.value))}
              disabled={isRunning}
              className="px-2 py-1.5 border rounded-lg bg-background text-sm w-20"
            >
              {[0, 10, 20, 30, 45, 60, 90, 120].map(n => (
                <option key={n} value={n}>{n}s</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={skipOutlookActivation}
              onChange={(e) => setSkipOutlookActivation(e.target.checked)}
              disabled={isRunning}
              className="rounded"
            />
            Skip Activation
          </label>
          <Button variant="outline" onClick={activateOutlookOnly} disabled={isRunning || accounts.length === 0}>
            <Zap className="w-4 h-4 mr-2" />
            Activate Outlook
          </Button>
          {isRunning ? (
            <Button variant="destructive" onClick={stopRegistration}>
              <Square className="w-4 h-4 mr-2" />
              Stop
            </Button>
          ) : (
            <Button onClick={startRegistration} disabled={accounts.length === 0}>
              <Play className="w-4 h-4 mr-2" />
              Start Registration
            </Button>
          )}
        </div>
      </div>

      {/* Statistics */}
      {accounts.length > 0 && (
        <div className="grid grid-cols-6 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-sm text-muted-foreground">Total</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-yellow-500">{stats.pending}</div>
              <div className="text-sm text-muted-foreground">Pending</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-blue-500">{stats.running}</div>
              <div className="text-sm text-muted-foreground">Running</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-green-500">{stats.success}</div>
              <div className="text-sm text-muted-foreground">Success</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-red-500">{stats.failed}</div>
              <div className="text-sm text-muted-foreground">Failed</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-orange-500">{stats.exists}</div>
              <div className="text-sm text-muted-foreground">Exists</div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        {/* Left: Input area */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Email Accounts
            </CardTitle>
            <CardDescription>
              Format: email|password|refresh_token|client_id (one per line)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <textarea
              className="w-full h-32 p-3 border rounded-lg bg-background resize-none font-mono text-sm"
              placeholder="example@outlook.com|password|M.C509_xxx...|9e5f94bc-xxx..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={isRunning}
            />
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleImport} disabled={isRunning || !inputText}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Parse & Add
              </Button>
              <Button variant="outline" onClick={handleImportFile} disabled={isRunning}>
                <Upload className="w-4 h-4 mr-2" />
                Import from File
              </Button>
              <Button variant="outline" onClick={handleClear} disabled={isRunning}>
                <Trash2 className="w-4 h-4 mr-2" />
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Right: Logs */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="flex items-center gap-2">
              <Terminal className="w-5 h-5" />
              Run Logs
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={clearLogs}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="h-48 overflow-auto bg-black/90 rounded-lg p-3 font-mono text-xs space-y-0.5">
              {logs.length === 0 ? (
                <div className="text-gray-500">No logs yet</div>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className={
                    log.includes('successful') || log.includes('Success') ? 'text-green-400' : 
                    log.includes('failed') || log.includes('error') || log.includes('Error') ? 'text-red-400' : 
                    log.includes('=====') ? 'text-yellow-400' :
                    log.includes('[stderr]') ? 'text-orange-400' :
                    'text-gray-300'
                  }>
                    {log}
                  </div>
                ))
              )}
              <div ref={logEndRef} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Account list */}
      {accounts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="w-5 h-5" />
              Registration List
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-2 text-left text-sm font-medium">#</th>
                    <th className="px-4 py-2 text-left text-sm font-medium">Email</th>
                    <th className="px-4 py-2 text-left text-sm font-medium">Name</th>
                    <th className="px-4 py-2 text-left text-sm font-medium">Status</th>
                    <th className="px-4 py-2 text-left text-sm font-medium">Token</th>
                    <th className="px-4 py-2 text-left text-sm font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((account, index) => (
                    <tr key={account.id} className="border-t">
                      <td className="px-4 py-2 text-sm">{index + 1}</td>
                      <td className="px-4 py-2 text-sm font-mono">{account.email}</td>
                      <td className="px-4 py-2 text-sm">{account.awsName || '-'}</td>
                      <td className="px-4 py-2">{getStatusBadge(account.status)}</td>
                      <td className="px-4 py-2 text-sm font-mono">
                        {account.ssoToken ? account.ssoToken.substring(0, 20) + '...' : '-'}
                      </td>
                      <td className="px-4 py-2">
                        {account.ssoToken && (
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => copyToken(account.ssoToken!)}
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            Instructions
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>1. Enter email account info, format: <code className="bg-muted px-1 rounded">email|password|refresh_token|client_id</code></p>
          <p className="pl-4 text-xs">
            - password: Email password (for Outlook activation)<br/>
            - refresh_token: OAuth2 refresh token (M.C509_xxx...)<br/>
            - client_id: Graph API client ID (9e5f94bc-xxx...)
          </p>
          <p>2. <strong>Duplicate Detection</strong>: Automatically detects existing accounts during import, shows "Exists" status and skips registration</p>
          <p>3. <strong>Batch Concurrency</strong>: Supports opening multiple browser windows for registration, up to 10 concurrent</p>
          <p>4. <strong>Outlook Activation</strong>: Newly registered Outlook emails need to be activated first to receive verification codes</p>
          <p className="pl-4 text-xs">
            - Click "Activate Outlook" to batch activate emails<br/>
            - Check "Skip Activation" to skip activation step (for already activated emails)
          </p>
          <p>5. <strong>Proxy Settings</strong>: Enter proxy address for AWS registration (Outlook activation and code retrieval don't use proxy)</p>
          <p>6. Click "Start Registration", the program will complete AWS Builder ID registration concurrently</p>
          <p className="text-yellow-500 flex items-center gap-1">
            <AlertCircle className="w-4 h-4" />
            First time use requires browser installation: Run <code className="bg-muted px-1 rounded">npx playwright install chromium</code> in terminal
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
