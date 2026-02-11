import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAccountsStore } from '@/store/accounts'
import { Card, CardContent, CardHeader, CardTitle, Button, Badge } from '../ui'
import { 
  Fingerprint, 
  RefreshCw, 
  RotateCcw, 
  Copy, 
  Download, 
  Upload, 
  Shield, 
  Link2, 
  Shuffle,
  History,
  Trash2,
  AlertTriangle,
  CheckCircle,
  Monitor,
  Edit3,
  Check,
  X,
  Users,
  Search
} from 'lucide-react'
import { cn } from '@/lib/utils'

export function MachineIdPage() {
  const {
    machineIdConfig,
    currentMachineId,
    originalMachineId,
    originalBackupTime,
    accountMachineIds,
    machineIdHistory,
    accounts,
    setMachineIdConfig,
    refreshCurrentMachineId,
    changeMachineId,
    restoreOriginalMachineId,
    clearMachineIdHistory,
    bindMachineIdToAccount
  } = useAccountsStore()

  const [isLoading, setIsLoading] = useState(false)
  const [hasAdmin, setHasAdmin] = useState<boolean | null>(null)
  const [osType, setOsType] = useState<string>('unknown')
  const [customMachineId, setCustomMachineId] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const [showAccountBindings, setShowAccountBindings] = useState(false)
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null)
  const [editingMachineId, setEditingMachineId] = useState('')
  const [accountSearchQuery, setAccountSearchQuery] = useState('')

  // Initialize
  useEffect(() => {
    const init = async () => {
      setIsLoading(true)
      try {
        // Get operating system type
        const os = await window.api.machineIdGetOSType()
        setOsType(os)
        
        // Check admin privileges
        const admin = await window.api.machineIdCheckAdmin()
        setHasAdmin(admin)
        
        // Refresh current machine ID
        await refreshCurrentMachineId()
      } catch (error) {
        console.error('Initialization failed:', error)
      } finally {
        setIsLoading(false)
      }
    }
    init()
  }, [refreshCurrentMachineId])

  // Copy machine ID to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  // Randomly generate and apply new machine ID
  const handleRandomChange = async () => {
    setIsLoading(true)
    try {
      await changeMachineId()
      await refreshCurrentMachineId()
    } finally {
      setIsLoading(false)
    }
  }

  // Apply custom machine ID
  const handleCustomChange = async () => {
    if (!customMachineId.trim()) return
    setIsLoading(true)
    try {
      await changeMachineId(customMachineId.trim())
      await refreshCurrentMachineId()
      setCustomMachineId('')
    } finally {
      setIsLoading(false)
    }
  }

  // Restore original machine ID
  const handleRestore = async () => {
    setIsLoading(true)
    try {
      await restoreOriginalMachineId()
      await refreshCurrentMachineId()
    } finally {
      setIsLoading(false)
    }
  }

  // Backup machine ID to file
  const handleBackupToFile = async () => {
    if (!currentMachineId) return
    await window.api.machineIdBackupToFile(currentMachineId)
  }

  // Restore machine ID from file
  const handleRestoreFromFile = async () => {
    setIsLoading(true)
    try {
      const result = await window.api.machineIdRestoreFromFile()
      if (result.success && result.machineId) {
        await changeMachineId(result.machineId)
        await refreshCurrentMachineId()
      }
    } finally {
      setIsLoading(false)
    }
  }

  // Request admin privileges
  const handleRequestAdmin = async () => {
    await window.api.machineIdRequestAdminRestart()
  }

  // Generate random UUID
  const generateRandomUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0
      const v = c === 'x' ? r : (r & 0x3 | 0x8)
      return v.toString(16)
    })
  }

  // Start editing account machine ID
  const startEditAccountMachineId = (accountId: string) => {
    setEditingAccountId(accountId)
    setEditingMachineId(accountMachineIds[accountId] || '')
  }

  // Save account machine ID
  const saveAccountMachineId = (accountId: string) => {
    if (editingMachineId.trim()) {
      bindMachineIdToAccount(accountId, editingMachineId.trim())
    }
    setEditingAccountId(null)
    setEditingMachineId('')
  }

  // Cancel editing
  const cancelEditAccountMachineId = () => {
    setEditingAccountId(null)
    setEditingMachineId('')
  }

  // Generate random machine ID for account
  const randomizeAccountMachineId = (accountId: string) => {
    const newMachineId = generateRandomUUID()
    bindMachineIdToAccount(accountId, newMachineId)
    if (editingAccountId === accountId) {
      setEditingMachineId(newMachineId)
    }
  }

  // Remove account machine ID binding
  const removeAccountMachineId = (accountId: string) => {
    const { accountMachineIds: currentBindings } = useAccountsStore.getState()
    const newBindings = { ...currentBindings }
    delete newBindings[accountId]
    useAccountsStore.setState({ accountMachineIds: newBindings })
    useAccountsStore.getState().saveToStorage()
  }

  // Format time
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('en-US')
  }

  // Get operating system display name
  const getOSName = () => {
    switch (osType) {
      case 'windows': return 'Windows'
      case 'macos': return 'macOS'
      case 'linux': return 'Linux'
      default: return 'Unknown'
    }
  }

  // Get bound account count
  const boundAccountCount = Object.keys(accountMachineIds).length

  return (
    <div className="p-6 space-y-6">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-primary/10 border border-primary/20">
        <div className="absolute inset-0 bg-grid-white/5" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-primary/20 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-primary/20 to-transparent rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
        
        <div className="relative p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="p-4 rounded-2xl bg-gradient-to-br from-primary to-primary/80 shadow-lg shadow-primary/25">
                <Fingerprint className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-primary">
                  Machine ID Management
                </h1>
                <p className="text-muted-foreground mt-1">
                  Manage device identifier to prevent account association and bans
                </p>
              </div>
            </div>
            <Badge variant="outline" className="bg-background/80 backdrop-blur-sm">
              <Monitor className="h-3 w-3 mr-1" />
              {getOSName()}
            </Badge>
          </div>

          {/* Stats cards */}
          <div className="grid grid-cols-3 gap-4 mt-6">
            <div className="p-4 rounded-xl bg-background/60 backdrop-blur-sm border border-white/10">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Fingerprint className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{machineIdHistory.length}</p>
                  <p className="text-xs text-muted-foreground">Change History</p>
                </div>
              </div>
            </div>
            <div className="p-4 rounded-xl bg-background/60 backdrop-blur-sm border border-white/10">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Link2 className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{boundAccountCount}</p>
                  <p className="text-xs text-muted-foreground">Bound Accounts</p>
                </div>
              </div>
            </div>
            <div className="p-4 rounded-xl bg-background/60 backdrop-blur-sm border border-white/10">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Shield className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{originalMachineId ? 'Backed Up' : 'Not Backed Up'}</p>
                  <p className="text-xs text-muted-foreground">Original Machine ID</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Admin warning */}
      {hasAdmin === false && (
        <Card className="border-amber-500/50 bg-gradient-to-r from-amber-500/10 to-orange-500/10 overflow-hidden">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/20">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <p className="font-medium text-amber-700 dark:text-amber-400">Admin Privileges Required</p>
                  <p className="text-sm text-amber-600 dark:text-amber-500">Modifying machine ID requires running the app as administrator</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={handleRequestAdmin} className="border-amber-500/50 hover:bg-amber-500/10">
                <Shield className="h-4 w-4 mr-1" />
                Restart as Admin
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Current machine ID */}
        <Card className="group relative overflow-hidden hover:shadow-lg transition-all duration-300">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-primary/10 opacity-0 group-hover:opacity-100 transition-opacity" />
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <Monitor className="h-4 w-4 text-primary" />
              </div>
              Current Machine ID
              {currentMachineId && currentMachineId !== originalMachineId && (
                <Badge className="ml-auto bg-primary/10 text-primary border-primary/20">
                  Modified
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative group/code">
              <div className="p-4 bg-gradient-to-br from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-900 rounded-xl font-mono text-sm break-all border border-slate-200 dark:border-slate-700">
                {isLoading ? (
                  <span className="text-muted-foreground flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Loading...
                  </span>
                ) : currentMachineId || (
                  <span className="text-muted-foreground">Unable to retrieve</span>
                )}
              </div>
            </div>
            {machineIdHistory.length > 0 && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <History className="h-3 w-3" />
                Last modified: {formatTime(machineIdHistory[machineIdHistory.length - 1].timestamp)}
              </p>
            )}
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => copyToClipboard(currentMachineId)}
                disabled={!currentMachineId}
                className="flex-1"
              >
                <Copy className="h-4 w-4 mr-1" />
                Copy
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => refreshCurrentMachineId()}
                disabled={isLoading}
                className="flex-1"
              >
                <RefreshCw className={cn("h-4 w-4 mr-1", isLoading && "animate-spin")} />
                Refresh
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Original machine ID backup */}
        <Card className="group relative overflow-hidden hover:shadow-lg transition-all duration-300">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-primary/10 opacity-0 group-hover:opacity-100 transition-opacity" />
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <Shield className="h-4 w-4 text-primary" />
              </div>
              Original Machine ID Backup
              {originalMachineId && (
                <Badge className="ml-auto bg-primary/10 text-primary border-primary/20">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Backed Up
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {originalMachineId ? (
              <>
                <div className="p-4 bg-gradient-to-br from-primary/5 to-primary/10 rounded-xl font-mono text-sm break-all border border-primary/20">
                  {originalMachineId}
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <CheckCircle className="h-3 w-3 text-primary" />
                  Backup time: {originalBackupTime ? formatTime(originalBackupTime) : 'Unknown'}
                </p>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => copyToClipboard(originalMachineId)}
                    className="flex-1"
                  >
                    <Copy className="h-4 w-4 mr-1" />
                    Copy
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleRestore}
                    disabled={isLoading || currentMachineId === originalMachineId}
                    className="flex-1 border-primary/50 hover:bg-primary/10 hover:text-primary"
                  >
                    <RotateCcw className="h-4 w-4 mr-1" />
                    Restore Original
                  </Button>
                </div>
              </>
            ) : (
              <div className="p-6 text-center rounded-xl border-2 border-dashed border-muted">
                <Shield className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-muted-foreground text-sm">
                  Original value will be automatically backed up on first modification
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Machine ID operations */}
      <Card className="overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-primary/5 to-primary/10 border-b">
          <CardTitle className="text-base flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <Shuffle className="h-4 w-4 text-primary" />
            </div>
            Machine ID Operations
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Random generate */}
            <div className="group p-5 rounded-xl border-2 border-dashed hover:border-primary/50 hover:bg-primary/5 transition-all space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gradient-to-br from-primary to-primary/80 text-white">
                  <Shuffle className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-semibold">Random Generate</h4>
                  <p className="text-xs text-muted-foreground">One-click generate UUID format machine ID</p>
                </div>
              </div>
              <Button 
                onClick={handleRandomChange} 
                disabled={isLoading}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25"
              >
                <Shuffle className="h-4 w-4 mr-2" />
                Generate & Apply
              </Button>
            </div>

            {/* Custom machine ID */}
            <div className="group p-5 rounded-xl border-2 border-dashed hover:border-primary/50 hover:bg-primary/5 transition-all space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gradient-to-br from-primary/80 to-primary text-white">
                  <Edit3 className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-semibold">Custom Input</h4>
                  <p className="text-xs text-muted-foreground">Enter a specific machine ID</p>
                </div>
              </div>
              <input
                type="text"
                placeholder="Enter UUID format machine ID..."
                value={customMachineId}
                onChange={(e) => setCustomMachineId(e.target.value)}
                className="w-full px-4 py-2.5 text-sm border-2 rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
              />
              <Button 
                onClick={handleCustomChange} 
                disabled={isLoading || !customMachineId.trim()}
                variant="outline"
                className="w-full border-2 hover:bg-primary/10 hover:border-primary/50"
              >
                Apply Custom Machine ID
              </Button>
            </div>
          </div>

          {/* File operations */}
          <div className="flex gap-3 pt-4 border-t">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleBackupToFile} 
              disabled={!currentMachineId}
              className="flex-1 h-10"
            >
              <Download className="h-4 w-4 mr-2" />
              Export to File
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleRestoreFromFile} 
              disabled={isLoading}
              className="flex-1 h-10"
            >
              <Upload className="h-4 w-4 mr-2" />
              Import from File
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Automation settings */}
      <Card className="overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-primary/5 to-primary/10 border-b">
          <CardTitle className="text-base flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <Link2 className="h-4 w-4 text-primary" />
            </div>
            Automation Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 divide-y">
          {/* Auto change on account switch */}
          <div className="flex items-center justify-between p-5 hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-4">
              <div className={cn(
                "p-2.5 rounded-xl transition-colors",
                machineIdConfig.autoSwitchOnAccountChange ? "bg-primary/10" : "bg-muted"
              )}>
                <RefreshCw className={cn(
                  "h-5 w-5 transition-colors",
                  machineIdConfig.autoSwitchOnAccountChange ? "text-primary" : "text-muted-foreground"
                )} />
              </div>
              <div>
                <p className="font-medium">Auto Change Machine ID on Account Switch</p>
                <p className="text-sm text-muted-foreground">
                  Automatically generate and apply new machine ID when switching accounts
                </p>
              </div>
            </div>
            <Button
              variant={machineIdConfig.autoSwitchOnAccountChange ? "default" : "outline"}
              size="sm"
              onClick={() => setMachineIdConfig({ autoSwitchOnAccountChange: !machineIdConfig.autoSwitchOnAccountChange })}
              className={cn(
                "min-w-[80px]",
                machineIdConfig.autoSwitchOnAccountChange && "bg-primary hover:bg-primary/90"
              )}
            >
              {machineIdConfig.autoSwitchOnAccountChange ? 'Enabled' : 'Disabled'}
            </Button>
          </div>

          {/* Account binding */}
          <div className="flex items-center justify-between p-5 hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-4">
              <div className={cn(
                "p-2.5 rounded-xl transition-colors",
                machineIdConfig.bindMachineIdToAccount ? "bg-primary/10" : "bg-muted"
              )}>
                <Link2 className={cn(
                  "h-5 w-5 transition-colors",
                  machineIdConfig.bindMachineIdToAccount ? "text-primary" : "text-muted-foreground"
                )} />
              </div>
              <div>
                <p className="font-medium flex items-center gap-2">
                  Account Machine ID Binding
                  {boundAccountCount > 0 && (
                    <Badge className="bg-primary/10 text-primary border-primary/20">
                      {boundAccountCount} accounts
                    </Badge>
                  )}
                </p>
                <p className="text-sm text-muted-foreground">
                  Assign unique machine ID to each account, auto-apply when switching
                </p>
              </div>
            </div>
            <Button
              variant={machineIdConfig.bindMachineIdToAccount ? "default" : "outline"}
              size="sm"
              onClick={() => setMachineIdConfig({ bindMachineIdToAccount: !machineIdConfig.bindMachineIdToAccount })}
              className={cn(
                "min-w-[80px]",
                machineIdConfig.bindMachineIdToAccount && "bg-primary hover:bg-primary/90"
              )}
            >
              {machineIdConfig.bindMachineIdToAccount ? 'Enabled' : 'Disabled'}
            </Button>
          </div>

          {/* Use bound machine ID */}
          {machineIdConfig.bindMachineIdToAccount && (
            <div className="flex items-center justify-between p-5 pl-16 bg-muted/30 hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-4">
                <div className={cn(
                  "p-2 rounded-lg transition-colors",
                  machineIdConfig.useBindedMachineId ? "bg-primary/10" : "bg-muted"
                )}>
                  <CheckCircle className={cn(
                    "h-4 w-4 transition-colors",
                    machineIdConfig.useBindedMachineId ? "text-primary" : "text-muted-foreground"
                  )} />
                </div>
                <div>
                  <p className="font-medium text-sm">Use Bound Unique Machine ID</p>
                  <p className="text-xs text-muted-foreground">
                    When disabled, a new random machine ID will be generated on each switch
                  </p>
                </div>
              </div>
              <Button
                variant={machineIdConfig.useBindedMachineId ? "default" : "outline"}
                size="sm"
                onClick={() => setMachineIdConfig({ useBindedMachineId: !machineIdConfig.useBindedMachineId })}
                className={cn(
                  "min-w-[80px]",
                  machineIdConfig.useBindedMachineId && "bg-primary hover:bg-primary/90"
                )}
              >
                {machineIdConfig.useBindedMachineId ? 'Enabled' : 'Disabled'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Account machine ID management button */}
        <Card className="group cursor-pointer hover:shadow-lg transition-all duration-300 hover:border-primary/50" onClick={() => setShowAccountBindings(true)}>
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 group-hover:from-primary/20 group-hover:to-primary/10 transition-colors">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-semibold group-hover:text-primary transition-colors">Account Machine ID Management</p>
                <p className="text-sm text-muted-foreground">
                  View and manage machine IDs bound to each account
                </p>
              </div>
              <div className="p-2 rounded-lg bg-muted group-hover:bg-primary/10 transition-colors">
                <Edit3 className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* History button */}
        <Card className="group cursor-pointer hover:shadow-lg transition-all duration-300 hover:border-primary/50" onClick={() => setShowHistory(true)}>
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 group-hover:from-primary/20 group-hover:to-primary/10 transition-colors">
                <History className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-semibold group-hover:text-primary transition-colors">Change History</p>
                <p className="text-sm text-muted-foreground">
                  {machineIdHistory.length} history records
                </p>
              </div>
              <div className="p-2 rounded-lg bg-muted group-hover:bg-primary/10 transition-colors">
                <History className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Account machine ID management dialog */}
      {showAccountBindings && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Background overlay */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowAccountBindings(false)}
          />
          
          {/* Dialog content */}
          <div className="relative bg-background rounded-xl shadow-2xl w-[600px] max-h-[80vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
            {/* Title bar */}
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                <h2 className="text-lg font-semibold">Account Machine ID Management</h2>
                <Badge variant="secondary">{accounts.size} accounts</Badge>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 w-8 p-0"
                onClick={() => setShowAccountBindings(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            {/* Search box */}
            <div className="px-4 pt-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  value={accountSearchQuery}
                  onChange={(e) => setAccountSearchQuery(e.target.value)}
                  placeholder="Search accounts..."
                  className="w-full pl-9 pr-3 py-2 text-sm bg-muted border-0 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {accountSearchQuery && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                    onClick={() => setAccountSearchQuery('')}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
            
            {/* Account list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {Array.from(accounts.values())
                .filter((account) => {
                  if (!accountSearchQuery.trim()) return true
                  const query = accountSearchQuery.toLowerCase()
                  return (
                    account.email?.toLowerCase().includes(query) ||
                    account.nickname?.toLowerCase().includes(query) ||
                    accountMachineIds[account.id]?.toLowerCase().includes(query)
                  )
                })
                .map((account) => {
                const boundMachineId = accountMachineIds[account.id]
                const isEditing = editingAccountId === account.id
                
                return (
                  <div key={account.id} className="p-3 bg-muted rounded-lg">
                    {/* Account info row */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-medium">
                          {(account.nickname || account.email || '?')[0].toUpperCase()}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-medium text-sm truncate max-w-[200px]">
                            {account.nickname || account.email}
                          </span>
                          {account.nickname && account.email && (
                            <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                              {account.email}
                            </span>
                          )}
                        </div>
                        {boundMachineId && (
                          <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                            Bound
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {!isEditing ? (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => startEditAccountMachineId(account.id)}
                              title="Edit"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => randomizeAccountMachineId(account.id)}
                              title="Random"
                            >
                              <Shuffle className="h-3.5 w-3.5" />
                            </Button>
                            {boundMachineId && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  onClick={() => copyToClipboard(boundMachineId)}
                                  title="Copy"
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                  onClick={() => removeAccountMachineId(account.id)}
                                  title="Delete"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                          </>
                        ) : (
                          <>
                            <Button
                              variant="default"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => saveAccountMachineId(account.id)}
                            >
                              <Check className="h-3.5 w-3.5 mr-1" />
                              Save
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={cancelEditAccountMachineId}
                            >
                              Cancel
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => randomizeAccountMachineId(account.id)}
                              title="Random"
                            >
                              <Shuffle className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                    
                    {/* Machine ID display/edit */}
                    {isEditing ? (
                      <input
                        type="text"
                        value={editingMachineId}
                        onChange={(e) => setEditingMachineId(e.target.value)}
                        placeholder="Enter UUID format machine ID"
                        className="w-full px-2 py-1.5 text-xs font-mono bg-background border rounded focus:outline-none focus:ring-2 focus:ring-primary"
                        autoFocus
                      />
                    ) : boundMachineId ? (
                      <div className="flex items-center gap-2 px-2 py-1.5 bg-background rounded border">
                        <code className="text-xs font-mono flex-1">{boundMachineId}</code>
                      </div>
                    ) : (
                      <div className="px-2 py-1.5 bg-background/50 rounded border border-dashed text-center">
                        <span className="text-xs text-muted-foreground">Not bound</span>
                      </div>
                    )}
                  </div>
                )
              })}
              
              {accounts.size === 0 && (
                <div className="text-center py-12">
                  <Users className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground">No accounts</p>
                  <p className="text-sm text-muted-foreground">Please add accounts first</p>
                </div>
              )}
              
              {accounts.size > 0 && accountSearchQuery && 
                Array.from(accounts.values()).filter((account) => {
                  const query = accountSearchQuery.toLowerCase()
                  return (
                    account.email?.toLowerCase().includes(query) ||
                    account.nickname?.toLowerCase().includes(query) ||
                    accountMachineIds[account.id]?.toLowerCase().includes(query)
                  )
                }).length === 0 && (
                <div className="text-center py-8">
                  <Search className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-muted-foreground">No matching accounts found</p>
                  <p className="text-sm text-muted-foreground">Try other keywords</p>
                </div>
              )}
            </div>
            
            {/* Bottom hint */}
            <div className="px-6 py-3 border-t bg-muted/50 text-xs text-muted-foreground">
              Tip: After binding a machine ID, it will be automatically applied when switching to that account
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* History dialog */}
      {showHistory && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Background overlay */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowHistory(false)}
          />
          
          {/* Dialog content */}
          <div className="relative bg-background rounded-xl shadow-2xl w-[550px] max-h-[80vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
            {/* Title bar */}
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5" />
                <h2 className="text-lg font-semibold">Change History</h2>
                <Badge variant="secondary">{machineIdHistory.length} records</Badge>
              </div>
              <div className="flex items-center gap-2">
                {machineIdHistory.length > 0 && (
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={clearMachineIdHistory}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Clear
                  </Button>
                )}
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 w-8 p-0"
                  onClick={() => setShowHistory(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            {/* History list */}
            <div className="flex-1 overflow-y-auto p-4">
              {machineIdHistory.length > 0 ? (
                <div className="space-y-2">
                  {[...machineIdHistory].reverse().map((entry, index) => (
                    <div key={entry.id} className="p-3 bg-muted rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">#{machineIdHistory.length - index}</span>
                          <Badge 
                            variant="secondary" 
                            className={cn(
                              "text-xs whitespace-nowrap",
                              entry.action === 'initial' && "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
                              entry.action === 'manual' && "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
                              entry.action === 'auto_switch' && "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
                              entry.action === 'restore' && "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
                              entry.action === 'bind' && "bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300"
                            )}
                          >
                            {entry.action === 'initial' && 'Initial'}
                            {entry.action === 'manual' && 'Manual'}
                            {entry.action === 'auto_switch' && 'Auto'}
                            {entry.action === 'restore' && 'Restore'}
                            {entry.action === 'bind' && 'Bind'}
                          </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatTime(entry.timestamp)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 p-2 bg-background rounded border">
                        <code className="text-sm flex-1 font-mono">{entry.machineId}</code>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 shrink-0"
                          onClick={() => copyToClipboard(entry.machineId)}
                          title="Copy"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      {entry.accountId && (
                        <p className="text-xs text-muted-foreground mt-2">
                          Associated account: {accounts.get(entry.accountId)?.nickname || accounts.get(entry.accountId)?.email || entry.accountId}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <History className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground">No change history</p>
                  <p className="text-sm text-muted-foreground">Changes will be automatically recorded</p>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Platform notes */}
      <Card className="overflow-hidden bg-gradient-to-br from-muted/50 to-muted/30">
        <CardContent className="p-5">
          <div className="flex items-start gap-4">
            <div className="p-2.5 rounded-xl bg-primary/10 shrink-0">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div className="space-y-3">
              <p className="font-semibold">Platform Notes</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
                  <div className="flex items-center gap-2 mb-1">
                    <Monitor className="h-4 w-4 text-primary" />
                    <span className="font-medium text-sm">Windows</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Modifies registry MachineGuid, requires admin privileges</p>
                </div>
                <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
                  <div className="flex items-center gap-2 mb-1">
                    <Monitor className="h-4 w-4 text-primary" />
                    <span className="font-medium text-sm">macOS</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Application layer override, native hardware UUID cannot be modified</p>
                </div>
                <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
                  <div className="flex items-center gap-2 mb-1">
                    <Monitor className="h-4 w-4 text-primary" />
                    <span className="font-medium text-sm">Linux</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Modifies /etc/machine-id, requires root privileges</p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Modifying machine ID may affect some software licenses, please proceed with caution
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
