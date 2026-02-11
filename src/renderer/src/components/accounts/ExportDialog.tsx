import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Button, Badge } from '../ui'
import { X, FileJson, FileText, Table, Clipboard, Check, Download, Files } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAccountsStore } from '@/store/accounts'
import type { Account } from '@/types/account'

type ExportFormat = 'json' | 'json-single' | 'txt' | 'csv' | 'clipboard'

interface ExportDialogProps {
  open: boolean
  onClose: () => void
  accounts: Account[]
  selectedCount: number
}

export function ExportDialog({ open, onClose, accounts, selectedCount }: ExportDialogProps) {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('json')
  const [includeCredentials, setIncludeCredentials] = useState(true)
  const [copied, setCopied] = useState(false)
  const { exportAccounts } = useAccountsStore()

  if (!open) return null

  const formats: { id: ExportFormat; name: string; icon: typeof FileJson; desc: string }[] = [
    { id: 'json', name: 'JSON', icon: FileJson, desc: 'Full data, can be imported' },
    { id: 'json-single', name: 'Single JSON', icon: Files, desc: 'One JSON file per account' },
    { id: 'txt', name: 'TXT', icon: FileText, desc: includeCredentials ? 'Importable format: email,token,nickname,login method' : 'Plain text format, one account per line' },
    { id: 'csv', name: 'CSV', icon: Table, desc: includeCredentials ? 'Importable format, Excel compatible' : 'Excel compatible format' },
    { id: 'clipboard', name: 'Clipboard', icon: Clipboard, desc: includeCredentials ? 'Importable format: email,token' : 'Copy to clipboard' },
  ]

  // Generate single account full JSON data
  const generateSingleAccountJson = (acc: Account): string => {
    const singleExport = {
      version: '1.0',
      exportedAt: Date.now(),
      account: {
        ...acc,
        isActive: false, // Don't preserve active status on export
        credentials: includeCredentials ? acc.credentials : {
          ...acc.credentials,
          accessToken: '',
          refreshToken: '',
          csrfToken: ''
        }
      }
    }
    return JSON.stringify(singleExport, null, 2)
  }

  // Generate export content
  const generateContent = (format: ExportFormat): string => {
    switch (format) {
      case 'json':
        // Use store's exportAccounts function to export full data
        const exportData = exportAccounts(accounts.map(a => a.id))
        // If not including credentials, remove sensitive info
        if (!includeCredentials) {
          exportData.accounts = exportData.accounts.map(acc => ({
            ...acc,
            credentials: {
              ...acc.credentials,
              accessToken: '',
              refreshToken: '',
              csrfToken: ''
            }
          }))
        }
        return JSON.stringify(exportData, null, 2)

      case 'txt':
        if (includeCredentials) {
          // Include credentials: export importable format: email,RefreshToken,nickname,login method
          return accounts.map(acc => 
            [
              acc.email,
              acc.credentials?.refreshToken || '',
              acc.nickname || '',
              acc.idp || 'Google'
            ].join(',')
          ).join('\n')
        }
        // Without credentials: export summary info
        return accounts.map(acc => {
          const lines = [
            `Email: ${acc.email}`,
            acc.nickname ? `Nickname: ${acc.nickname}` : null,
            acc.idp ? `Login Method: ${acc.idp}` : null,
            acc.subscription?.title ? `Subscription: ${acc.subscription.title}` : null,
            acc.usage ? `Usage: ${acc.usage.current ?? 0}/${acc.usage.limit ?? 0}` : null,
          ].filter(Boolean)
          return lines.join('\n')
        }).join('\n\n---\n\n')

      case 'csv':
        // CSV format: can be imported when including credentials
        const headers = includeCredentials 
          ? ['Email', 'Nickname', 'Login Method', 'RefreshToken', 'ClientId', 'ClientSecret', 'Region']
          : ['Email', 'Nickname', 'Login Method', 'Subscription Type', 'Subscription Title', 'Used', 'Total']
        const rows = accounts.map(acc => includeCredentials 
          ? [
              acc.email,
              acc.nickname || '',
              acc.idp || '',
              acc.credentials?.refreshToken || '',
              acc.credentials?.clientId || '',
              acc.credentials?.clientSecret || '',
              acc.credentials?.region || 'us-east-1'
            ]
          : [
              acc.email,
              acc.nickname || '',
              acc.idp || '',
              acc.subscription?.type || '',
              acc.subscription?.title || '',
              String(acc.usage?.current ?? ''),
              String(acc.usage?.limit ?? '')
            ]
        )
        // Add BOM for Excel compatibility
        return '\ufeff' + [headers, ...rows].map(row => 
          row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
        ).join('\n')

      case 'clipboard':
        if (includeCredentials) {
          // Include credentials: export importable format: email,RefreshToken
          return accounts.map(acc => 
            `${acc.email},${acc.credentials?.refreshToken || ''}`
          ).join('\n')
        }
        // Without credentials: export summary info
        return accounts.map(acc => 
          `${acc.email}${acc.nickname ? ` (${acc.nickname})` : ''} - ${acc.subscription?.title || 'Unknown subscription'}`
        ).join('\n')

      default:
        return ''
    }
  }

  // Export handler
  const handleExport = async () => {
    const count = accounts.length

    // Single account JSON export: select folder, batch export all files
    if (selectedFormat === 'json-single') {
      const files = accounts.map(acc => {
        const content = generateSingleAccountJson(acc)
        const safeEmail = acc.email.replace(/[@.]/g, '_')
        const filename = `kiro-account-${safeEmail}.json`
        return { filename, content }
      })
      
      const result = await window.api.exportToFolder(files)
      if (result.success) {
        alert(`Exported ${result.count}/${count} accounts to folder`)
        onClose()
      }
      return
    }

    const content = generateContent(selectedFormat)

    if (selectedFormat === 'clipboard') {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => {
        setCopied(false)
        onClose()
      }, 1500)
      return
    }

    const extensions: Record<string, string> = {
      json: 'json',
      txt: 'txt',
      csv: 'csv'
    }
    const filename = `kiro-accounts-${new Date().toISOString().slice(0, 10)}.${extensions[selectedFormat]}`
    
    const success = await window.api.exportToFile(content, filename)
    if (success) {
      alert(`Exported ${count} accounts`)
      onClose()
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Background overlay */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Dialog */}
      <div className="relative bg-background rounded-xl shadow-2xl w-[450px] animate-in fade-in zoom-in-95 duration-200">
        {/* Title bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            <h2 className="text-lg font-semibold">Export Accounts</h2>
            <Badge variant="secondary">
              {selectedCount > 0 ? `${selectedCount} selected` : `All ${accounts.length}`}
            </Badge>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-8 w-8 p-0"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        
        {/* Format selection */}
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {formats.map(format => {
              const Icon = format.icon
              const isSelected = selectedFormat === format.id
              return (
                <button
                  key={format.id}
                  onClick={() => setSelectedFormat(format.id)}
                  className={cn(
                    "p-4 rounded-lg border-2 text-left transition-all",
                    isSelected 
                      ? "border-primary bg-primary/5" 
                      : "border-muted hover:border-muted-foreground/30"
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={cn("h-4 w-4", isSelected && "text-primary")} />
                    <span className={cn("font-medium", isSelected && "text-primary")}>
                      {format.name}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{format.desc}</p>
                </button>
              )
            })}
          </div>

          {/* Options */}
          {(selectedFormat === 'json' || selectedFormat === 'json-single') && (
            <label className="flex items-center gap-2 p-3 bg-muted rounded-lg cursor-pointer">
              <input
                type="checkbox"
                checked={includeCredentials}
                onChange={(e) => setIncludeCredentials(e.target.checked)}
                className="w-4 h-4 rounded"
              />
              <div>
                <p className="text-sm font-medium">Include Credentials</p>
                <p className="text-xs text-muted-foreground">Include tokens and sensitive data for full import</p>
              </div>
            </label>
          )}
        </div>

        {/* Footer buttons */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t bg-muted/30">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={copied}>
            {copied ? (
              <>
                <Check className="h-4 w-4 mr-2" />
                Copied
              </>
            ) : selectedFormat === 'clipboard' ? (
              <>
                <Clipboard className="h-4 w-4 mr-2" />
                Copy to Clipboard
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Export
              </>
            )}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}
