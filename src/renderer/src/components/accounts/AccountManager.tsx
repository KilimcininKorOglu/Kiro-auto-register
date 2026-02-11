import { useState, useEffect } from 'react'
import { useAccountsStore } from '@/store/accounts'
import { AccountToolbar } from './AccountToolbar'
import { AccountGrid } from './AccountGrid'
import { AddAccountDialog } from './AddAccountDialog'
import { EditAccountDialog } from './EditAccountDialog'
import { GroupManageDialog } from './GroupManageDialog'
import { TagManageDialog } from './TagManageDialog'
import { ExportDialog } from './ExportDialog'
import { Button } from '../ui'
import type { Account } from '@/types/account'
import { ArrowLeft, Loader2, Users, Settings, FolderOpen } from 'lucide-react'

interface AccountManagerProps {
  onBack?: () => void
}

export function AccountManager({ onBack }: AccountManagerProps): React.ReactNode {
  const {
    isLoading,
    accounts,
    importFromExportData,
    importAccounts,
    importSingleAccount,
    selectedIds,
    kiroPath,
    setKiroPath
  } = useAccountsStore()

  const [showAddDialog, setShowAddDialog] = useState(false)
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)
  const [showGroupDialog, setShowGroupDialog] = useState(false)
  const [showTagDialog, setShowTagDialog] = useState(false)
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [isFilterExpanded, setIsFilterExpanded] = useState(false)
  const [kiroDetected, setKiroDetected] = useState<boolean | null>(null)

  // Auto detect Kiro path
  useEffect(() => {
    const detectKiro = async () => {
      if (!kiroPath) {
        const result = await window.api.detectKiroPath()
        if (result.success) {
          setKiroPath(result.path)
          setKiroDetected(true)
        } else {
          setKiroDetected(false)
        }
      } else {
        setKiroDetected(true)
      }
    }
    detectKiro()
  }, [kiroPath, setKiroPath])

  // Manually select Kiro path
  const handleSelectKiroPath = async () => {
    const result = await window.api.selectKiroPath()
    if (result.success) {
      setKiroPath(result.path)
      setKiroDetected(true)
    }
  }

  // Get accounts list for export
  const getExportAccounts = () => {
    const accountList = Array.from(accounts.values())
    if (selectedIds.size > 0) {
      return accountList.filter(acc => selectedIds.has(acc.id))
    }
    return accountList
  }

  // Export
  const handleExport = (): void => {
    setShowExportDialog(true)
  }

  // Parse CSV line (handle quotes and commas)
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    result.push(current.trim())
    return result
  }

  // Import
  const handleImport = async (): Promise<void> => {
    const fileData = await window.api.importFromFile()

    if (!fileData) return

    try {
      // Handle multi-file import
      if ('isMultiple' in fileData && fileData.isMultiple) {
        let successCount = 0
        let failedCount = 0
        let skippedCount = 0
        
        for (const file of fileData.files) {
          if (file.format !== 'json') {
            failedCount++
            continue
          }
          
          try {
            const data = JSON.parse(file.content)
            
            // Single account JSON format
            if (data.version && data.account && !data.accounts) {
              const result = importSingleAccount(data)
              if (result.success) {
                successCount++
              } else if (result.error === 'Account already exists') {
                skippedCount++
              } else {
                failedCount++
              }
            }
            // Full export data format
            else if (data.version && data.accounts) {
              const result = importFromExportData(data)
              successCount += result.success
              failedCount += result.failed
              const skippedInfo = result.errors.find(e => e.id === 'skipped')
              if (skippedInfo) {
                const match = skippedInfo.error.match(/Skipped (\d+)/)
                if (match) skippedCount += parseInt(match[1])
              }
            } else {
              failedCount++
            }
          } catch {
            failedCount++
          }
        }
        
        let msg = `Batch import complete: ${successCount} succeeded`
        if (skippedCount > 0) msg += `, ${skippedCount} skipped (already exist)`
        if (failedCount > 0) msg += `, ${failedCount} failed`
        alert(msg)
        return
      }

      // Single file import
      if (!('content' in fileData)) return
      const { content, format } = fileData

      if (format === 'json') {
        // JSON format: full export data or single account data
        const data = JSON.parse(content)
        
        // Check if single account JSON format
        if (data.version && data.account && !data.accounts) {
          const result = importSingleAccount(data)
          if (result.success) {
            alert('Import successful: 1 account')
          } else {
            alert(`Import failed: ${result.error}`)
          }
          return
        }
        
        // Full export data format
        if (data.version && data.accounts) {
          const result = importFromExportData(data)
          const skippedInfo = result.errors.find(e => e.id === 'skipped')
          const skippedMsg = skippedInfo ? `, ${skippedInfo.error}` : ''
          alert(`Import complete: ${result.success} succeeded${skippedMsg}`)
        } else {
          alert('Invalid JSON file format')
        }
      } else if (format === 'csv') {
        // CSV format: email,nickname,login_method,RefreshToken,ClientId,ClientSecret,Region
        const lines = content.split('\n').filter(line => line.trim())
        if (lines.length < 2) {
          alert('CSV file is empty or only has header row')
          return
        }

        // Skip header row, parse data rows
        const items = lines.slice(1).map(line => {
          const cols = parseCSVLine(line)
          return {
            email: cols[0] || '',
            nickname: cols[1] || undefined,
            idp: cols[2] || 'Google',
            refreshToken: cols[3] || '',
            clientId: cols[4] || '',
            clientSecret: cols[5] || '',
            region: cols[6] || 'us-east-1'
          }
        }).filter(item => item.email && item.refreshToken)

        if (items.length === 0) {
          alert('No valid account data found (requires email and RefreshToken)')
          return
        }

        const result = importAccounts(items)
        alert(`Import complete: ${result.success} succeeded, ${result.failed} failed`)
      } else if (format === 'txt') {
        // TXT format: one account per line, format: email,RefreshToken or email|RefreshToken
        const lines = content.split('\n').filter(line => line.trim() && !line.startsWith('#'))
        
        const items = lines.map(line => {
          // Support comma or pipe separator
          const parts = line.includes('|') ? line.split('|') : line.split(',')
          return {
            email: parts[0]?.trim() || '',
            refreshToken: parts[1]?.trim() || '',
            nickname: parts[2]?.trim() || undefined,
            idp: parts[3]?.trim() || 'Google'
          }
        }).filter(item => item.email && item.refreshToken)

        if (items.length === 0) {
          alert('No valid account data found (format: email,RefreshToken)')
          return
        }

        const result = importAccounts(items)
        alert(`Import complete: ${result.success} succeeded, ${result.failed} failed`)
      } else {
        alert(`Unsupported file format: ${format}`)
      }
    } catch (e) {
      console.error('Import error:', e)
      alert('Failed to parse import file')
    }
  }

  // Manage groups
  const handleManageGroups = (): void => {
    setShowGroupDialog(true)
  }

  // Manage tags
  const handleManageTags = (): void => {
    setShowTagDialog(true)
  }

  // Edit account
  const handleEditAccount = (account: Account): void => {
    setEditingAccount(account)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading account data...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Kiro path not detected warning */}
      {kiroDetected === false && (
        <div className="px-6 py-3 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <Settings className="h-4 w-4" />
            <span className="text-sm">Kiro installation path not detected, cannot auto-start Kiro after switching accounts</span>
          </div>
          <Button variant="outline" size="sm" onClick={handleSelectKiroPath} className="gap-1">
            <FolderOpen className="h-4 w-4" />
            Set Path
          </Button>
        </div>
      )}

      {/* Top toolbar */}
      <header className="flex items-center justify-between gap-4 px-6 py-4 border-b bg-gradient-to-r from-primary/5 to-transparent">
        <div className="flex items-center gap-4">
          {onBack && (
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-lg font-semibold text-primary">Account Manager</h1>
          </div>
          {/* Kiro path status indicator */}
          {kiroDetected && kiroPath && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleSelectKiroPath}
              className="text-xs text-muted-foreground hover:text-foreground gap-1"
              title={`Kiro path: ${kiroPath}`}
            >
              <Settings className="h-3 w-3" />
              Kiro Configured
            </Button>
          )}
        </div>
        
        {/* Toolbar */}
        <AccountToolbar
          onAddAccount={() => setShowAddDialog(true)}
          onImport={handleImport}
          onExport={handleExport}
          onManageGroups={handleManageGroups}
          onManageTags={handleManageTags}
          isFilterExpanded={isFilterExpanded}
          onToggleFilter={() => setIsFilterExpanded(!isFilterExpanded)}
        />
      </header>

      {/* Main content area */}
      <div className="flex-1 overflow-hidden flex flex-col px-6 py-4 gap-4">
        {/* Account grid */}
        <div className="flex-1 overflow-hidden">
          <AccountGrid
            onAddAccount={() => setShowAddDialog(true)}
            onEditAccount={handleEditAccount}
          />
        </div>
      </div>

      {/* Add account dialog */}
      <AddAccountDialog
        isOpen={showAddDialog}
        onClose={() => setShowAddDialog(false)}
      />

      {/* Edit account dialog */}
      <EditAccountDialog
        open={!!editingAccount}
        onOpenChange={(open) => !open && setEditingAccount(null)}
        account={editingAccount}
      />

      {/* Group management dialog */}
      <GroupManageDialog
        isOpen={showGroupDialog}
        onClose={() => setShowGroupDialog(false)}
      />

      {/* Tag management dialog */}
      <TagManageDialog
        isOpen={showTagDialog}
        onClose={() => setShowTagDialog(false)}
      />

      {/* Export dialog */}
      <ExportDialog
        open={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        accounts={getExportAccounts()}
        selectedCount={selectedIds.size}
      />
    </div>
  )
}
