import { memo, useState, useMemo } from 'react'
import { Card, CardContent, Badge, Button, Progress } from '../ui'
import { useAccountsStore } from '@/store/accounts'
import type { Account, AccountTag, AccountGroup } from '@/types/account'
import {
  Check,
  RefreshCw,
  Trash2,
  Edit,
  Copy,
  AlertTriangle,
  Clock,
  Loader2,
  Info,
  FolderOpen,
  Power,
  Calendar,
  AlertCircle,
  KeyRound
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Parse ARGB color to CSS rgba
function toRgba(argbColor: string): string {
  // Supports formats: #AARRGGBB or #RRGGBB
  let alpha = 255
  let rgb = argbColor
  if (argbColor.length === 9 && argbColor.startsWith('#')) {
    alpha = parseInt(argbColor.slice(1, 3), 16)
    rgb = '#' + argbColor.slice(3)
  }
  const hex = rgb.startsWith('#') ? rgb.slice(1) : rgb
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha / 255})`
}

// Generate tag glow style
function generateGlowStyle(tagColors: string[]): React.CSSProperties {
  if (tagColors.length === 0) return {}
  
  if (tagColors.length === 1) {
    const color = toRgba(tagColors[0])
    const colorTransparent = color.replace('1)', '0.15)') // Reduce shadow opacity
    return {
      boxShadow: `0 0 0 1px ${color}, 0 4px 12px -2px ${colorTransparent}`
    }
  }
  
  // Multiple tags: use gradient border effect
  const gradientColors = tagColors.map((c, i) => {
    const percent = (i / tagColors.length) * 100
    const nextPercent = ((i + 1) / tagColors.length) * 100
    return `${toRgba(c)} ${percent}%, ${toRgba(c)} ${nextPercent}%`
  }).join(', ')
  
  return {
    background: `linear-gradient(white, white) padding-box, linear-gradient(135deg, ${gradientColors}) border-box`,
    border: '1.5px solid transparent',
    boxShadow: '0 4px 12px -2px rgba(0, 0, 0, 0.05)'
  }
}

interface AccountCardProps {
  account: Account
  tags: Map<string, AccountTag>
  groups: Map<string, AccountGroup>
  isSelected: boolean
  onSelect: () => void
  onEdit: () => void
  onShowDetail: () => void
}

const getSubscriptionColor = (type: string, title?: string): string => {
  const text = (title || type).toUpperCase()
  // KIRO PRO+ / PRO_PLUS - purple
  if (text.includes('PRO+') || text.includes('PRO_PLUS') || text.includes('PROPLUS')) return 'bg-purple-500'
  // KIRO POWER - gold
  if (text.includes('POWER')) return 'bg-amber-500'
  // KIRO PRO - blue
  if (text.includes('PRO')) return 'bg-blue-500'
  // KIRO FREE - gray
  return 'bg-gray-500'
}

const StatusLabels: Record<string, string> = {
  active: 'Active',
  expired: 'Expired',
  error: 'Error',
  refreshing: 'Refreshing',
  unknown: 'Unknown'
}

// Format token expiry time
function formatTokenExpiry(expiresAt: number): string {
  const now = Date.now()
  const diff = expiresAt - now
  
  if (diff <= 0) return 'Expired'
  
  const minutes = Math.floor(diff / (60 * 1000))
  const hours = Math.floor(diff / (60 * 60 * 1000))
  
  if (minutes < 60) {
    return `${minutes} min`
  } else if (hours < 24) {
    const remainingMinutes = minutes % 60
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`
  } else {
    const days = Math.floor(hours / 24)
    const remainingHours = hours % 24
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`
  }
}

export const AccountCard = memo(function AccountCard({
  account,
  tags,
  groups,
  isSelected,
  onSelect,
  onEdit,
  onShowDetail
}: AccountCardProps) {
  const {
    setActiveAccount,
    removeAccount,
    checkAccountStatus,
    refreshAccountToken,
    toggleSelection,
    maskEmail,
    maskNickname
  } = useAccountsStore()

  const handleSwitch = async (): Promise<void> => {
    const { credentials } = account
    
    // Social login only needs refreshToken, IdC login needs clientId and clientSecret
    if (!credentials.refreshToken) {
      alert('Account credentials incomplete (missing refreshToken), cannot switch')
      return
    }
    if (credentials.authMethod !== 'social' && (!credentials.clientId || !credentials.clientSecret)) {
      alert('Account credentials incomplete (missing clientId or clientSecret), cannot switch')
      return
    }
    
    // Write credentials to local SSO cache
    const result = await window.api.switchAccount({
      accessToken: credentials.accessToken,
      refreshToken: credentials.refreshToken,
      clientId: credentials.clientId || '',
      clientSecret: credentials.clientSecret || '',
      region: credentials.region || 'us-east-1',
      authMethod: credentials.authMethod,
      provider: credentials.provider
    })
    
    if (result.success) {
      setActiveAccount(account.id)
    } else {
      alert(`Switch failed: ${result.error}`)
    }
  }

  // Check if credentials are complete (for switch button state)
  const hasValidCredentials = (): boolean => {
    const { credentials } = account
    if (!credentials.refreshToken) return false
    if (credentials.authMethod !== 'social' && (!credentials.clientId || !credentials.clientSecret)) return false
    return true
  }

  const handleRefresh = async (): Promise<void> => {
    // Get latest usage data
    await checkAccountStatus(account.id)
  }

  const [isRefreshingToken, setIsRefreshingToken] = useState(false)
  const handleRefreshToken = async (): Promise<void> => {
    setIsRefreshingToken(true)
    try {
      await refreshAccountToken(account.id)
    } finally {
      setIsRefreshingToken(false)
    }
  }

  const handleDelete = (): void => {
    if (confirm(`Are you sure you want to delete account ${maskEmail(account.email)}?`)) {
      removeAccount(account.id)
    }
  }

  const [copied, setCopied] = useState(false)

  const handleCopyCredentials = (): void => {
    const credentials = {
      refreshToken: account.credentials.refreshToken,
      clientId: account.credentials.clientId,
      clientSecret: account.credentials.clientSecret
    }
    navigator.clipboard.writeText(JSON.stringify(credentials, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const accountTags = account.tags
    .map((id) => tags.get(id))
    .filter((t): t is AccountTag => t !== undefined)

  // Get group info
  const accountGroup = account.groupId ? groups.get(account.groupId) : undefined

  // Generate glow style
  const glowStyle = useMemo(() => {
    const tagColors = accountTags.map(t => t.color)
    return generateGlowStyle(tagColors)
  }, [accountTags])

  const isExpiringSoon = account.subscription.daysRemaining !== undefined &&
                         account.subscription.daysRemaining <= 7

  const isHighUsage = account.usage.percentUsed > 80

  // UnauthorizedException and AccountSuspendedException both indicate banned/suspended account
  const isUnauthorized = account.lastError?.includes('UnauthorizedException') || 
                         account.lastError?.includes('AccountSuspendedException')

  // Banned status style (red) - highest priority
  const unauthorizedStyle: React.CSSProperties = isUnauthorized ? {
    backgroundColor: 'var(--card-unauthorized-bg)',
    borderColor: 'var(--card-unauthorized-border)',
    boxShadow: `
      0 0 0 1px var(--card-unauthorized-ring),
      0 4px 20px -2px var(--card-unauthorized-shadow),
      inset 0 0 20px var(--card-unauthorized-glow)
    `
  } : {}

  // Current active premium style (gold) - second priority
  const activeGlowStyle: React.CSSProperties = account.isActive ? {
    backgroundColor: 'var(--card-active-bg)',
    borderColor: 'var(--card-active-border)',
    boxShadow: `
      0 0 0 1px var(--card-active-ring),
      0 8px 24px -4px var(--card-active-shadow),
      inset 4px 0 0 0 var(--card-active-accent)
    `
  } : {}

  // Final style merge logic
  let finalStyle: React.CSSProperties = {}
  
  if (isUnauthorized) {
    // Banned status: ignore all other styles (tag glow, active glow), only show banned style
    finalStyle = unauthorizedStyle
  } else if (account.isActive) {
    // Current active: combine tag glow and active glow
    finalStyle = { ...glowStyle, ...activeGlowStyle }
  } else {
    // Normal status: only show tag glow
    finalStyle = glowStyle
  }

  return (
    <Card
      className={cn(
        'relative transition-all duration-300 hover:shadow-lg cursor-pointer h-full flex flex-col overflow-hidden border',
        // Border color priority
        isUnauthorized ? 'border-red-400/50' :
        account.isActive ? 'border-amber-400/50 dark:border-amber-400/30' :
        '',
        
        isSelected && !account.isActive && !isUnauthorized && 'bg-primary/5',
        
        // Hide default border when has glow (except for active and banned)
        accountTags.length > 0 && !account.isActive && !isUnauthorized && 'border-transparent'
      )}
      style={finalStyle}
      onClick={() => toggleSelection(account.id)}
    >
      <CardContent className="p-4 flex-1 flex flex-col gap-3 overflow-hidden">
        {/* Header: Checkbox, Email/Nickname, Group */}
        <div className="flex gap-3 items-start">
           {/* Checkbox */}
           <div
            className={cn(
              'w-5 h-5 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0 mt-0.5 cursor-pointer',
              isSelected
                ? 'bg-primary border-primary text-primary-foreground'
                : 'border-muted-foreground/30 hover:border-primary'
            )}
            onClick={(e) => {
              e.stopPropagation()
              onSelect()
            }}
          >
            {isSelected && <Check className="h-3.5 w-3.5" />}
          </div>

           <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                 <h3 className="font-semibold text-sm truncate text-foreground/90" title={maskEmail(account.email)}>{maskEmail(account.email)}</h3>
                 {/* Status Badge */}
                 <div className={cn(
                    "text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1 flex-shrink-0",
                    isUnauthorized ? "text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/30" :
                    account.status === 'active' ? "text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/30" :
                    account.status === 'error' ? "text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/30" :
                    account.status === 'expired' ? "text-orange-600 bg-orange-100 dark:text-orange-400 dark:bg-orange-900/30" :
                    account.status === 'refreshing' ? "text-primary bg-primary/10" :
                    "text-muted-foreground bg-muted"
                 )}>
                    {account.status === 'refreshing' && <Loader2 className="h-3 w-3 animate-spin" />}
                    {isUnauthorized && <AlertCircle className="h-3 w-3" />}
                    {isUnauthorized ? 'Banned' : StatusLabels[account.status]}
                 </div>
              </div>
              <div className="flex items-center gap-2 mt-1">
                  {account.nickname && <span className="text-xs text-muted-foreground truncate">{maskNickname(account.nickname)}</span>}
                  {accountGroup && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground flex items-center gap-1"
                      style={{ color: accountGroup.color, backgroundColor: accountGroup.color + '15' }}
                    >
                      <FolderOpen className="w-3 h-3" /> {accountGroup.name}
                    </span>
                  )}
              </div>
           </div>
        </div>

        {/* Badges Row */}
        <div className="flex items-center gap-2 flex-wrap">
            <Badge className={cn('text-white text-[10px] h-5 px-2 border-0', getSubscriptionColor(account.subscription.type, account.subscription.title))}>
                {account.subscription.title || account.subscription.type}
            </Badge>
            <Badge variant="outline" className="text-[10px] h-5 px-2 text-muted-foreground font-normal border-muted-foreground/30 bg-muted/30">
                {account.idp}
            </Badge>
            {account.isActive && (
              <Badge variant="default" className="ml-auto h-5 bg-green-500 text-white border-0 hover:bg-green-600">
                Current
              </Badge>
            )}
        </div>

        {/* Usage Section */}
        <div className="bg-muted/30 p-3 rounded-lg space-y-2 border border-border/50">
            <div className="flex justify-between items-end text-xs">
                <span className="text-muted-foreground font-medium">Usage</span>
                <span className={cn("font-mono font-medium", isHighUsage ? "text-amber-600" : "text-foreground")}>
                   {(account.usage.percentUsed * 100).toFixed(0)}%
                </span>
            </div>
            <Progress
              value={account.usage.percentUsed * 100}
              className="h-1.5"
              indicatorClassName={isHighUsage ? "bg-amber-500" : "bg-primary"}
            />
            <div className="flex justify-between text-[10px] text-muted-foreground pt-0.5">
                <span>{account.usage.current.toLocaleString()} / {account.usage.limit.toLocaleString()}</span>
                {account.usage.nextResetDate && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                     {(() => {
                      const d = account.usage.nextResetDate as unknown
                      try {
                         return (typeof d === 'string' ? d : new Date(d as Date).toISOString()).split('T')[0]
                      } catch { return 'Unknown' }
                    })()} Reset
                  </span>
                )}
            </div>
        </div>

        {/* Detailed Quotas - Compact list */}
        <div className="space-y-1.5 min-h-0 overflow-y-auto pr-1 text-[10px] max-h-24">
           {/* Base quota */}
           {account.usage.baseLimit !== undefined && account.usage.baseLimit > 0 && (
             <div className="flex items-center gap-2">
               <div className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
               <span className="text-muted-foreground">Base:</span>
               <span className="font-medium">{account.usage.baseCurrent ?? 0}/{account.usage.baseLimit}</span>
             </div>
           )}
           {/* Trial quota */}
           {account.usage.freeTrialLimit !== undefined && account.usage.freeTrialLimit > 0 && (
             <div className="flex items-center gap-2">
               <div className="w-1.5 h-1.5 rounded-full bg-purple-500 flex-shrink-0" />
               <span className="text-muted-foreground">Trial:</span>
               <span className="font-medium">{account.usage.freeTrialCurrent ?? 0}/{account.usage.freeTrialLimit}</span>
               {account.usage.freeTrialExpiry && (
                 <span className="text-muted-foreground/70 ml-auto">
                   until {(() => {
                      const d = account.usage.freeTrialExpiry as unknown
                      try { return (typeof d === 'string' ? d : new Date(d as Date).toISOString()).split('T')[0] } catch { return '' }
                   })()}
                 </span>
               )}
             </div>
           )}
           {/* Bonus quota */}
           {account.usage.bonuses?.map((bonus) => (
             <div key={bonus.code} className="flex items-center gap-2">
               <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 flex-shrink-0" />
               <span className="text-muted-foreground truncate max-w-[80px]" title={bonus.name}>{bonus.name}:</span>
               <span className="font-medium">{bonus.current}/{bonus.limit}</span>
               {bonus.expiresAt && (
                 <span className="text-muted-foreground/70 ml-auto">
                   until {(() => {
                      const d = bonus.expiresAt as unknown
                      try { return (typeof d === 'string' ? d : new Date(d as Date).toISOString()).split('T')[0] } catch { return '' }
                   })()}
                 </span>
               )}
             </div>
           ))}
        </div>
        
        {/* Tags - placed before footer */}
        {accountTags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-auto pt-2">
            {accountTags.slice(0, 4).map((tag) => (
              <span
                key={tag.id}
                className="px-1.5 py-0.5 text-[10px] rounded-sm text-white font-medium shadow-sm"
                style={{ backgroundColor: toRgba(tag.color) }}
              >
                {tag.name}
              </span>
            ))}
             {accountTags.length > 4 && (
              <span className="px-1.5 py-0.5 text-[10px] text-muted-foreground bg-muted rounded-sm">
                +{accountTags.length - 4}
              </span>
            )}
          </div>
        )}

        {/* Footer Actions */}
        <div className="pt-3 border-t flex items-center justify-between mt-auto gap-2 shrink-0">
            {/* Left: Token expiry info */}
            <div className="text-[10px] text-muted-foreground flex flex-col leading-tight gap-0.5">
                <div className="flex items-center gap-1">
                   <Clock className="h-3 w-3" />
                   <span className={isExpiringSoon ? "text-amber-600 font-medium" : ""}>
                      {account.subscription.daysRemaining !== undefined ? `${account.subscription.daysRemaining}d left` : '-'}
                   </span>
                </div>
                <div className="flex items-center gap-1" title={account.credentials.expiresAt ? new Date(account.credentials.expiresAt).toLocaleString() : 'Unknown'}>
                   <KeyRound className="h-3 w-3" />
                   <span className={account.credentials.expiresAt && account.credentials.expiresAt - Date.now() < 5 * 60 * 1000 ? "text-red-500 font-medium" : ""}>
                      Token: {account.credentials.expiresAt ? formatTokenExpiry(account.credentials.expiresAt) : '-'}
                   </span>
                </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-0.5">
               {/* Switch button: show for non-active accounts */}
               {!account.isActive && (
                 <Button
                   size="icon"
                   variant="ghost"
                   className={cn(
                     "h-7 w-7 transition-colors",
                     hasValidCredentials() 
                       ? "hover:bg-primary/10 hover:text-primary" 
                       : "text-muted-foreground/50 hover:text-muted-foreground"
                   )}
                   onClick={(e) => { e.stopPropagation(); handleSwitch() }}
                   title={hasValidCredentials() ? "Switch to this account" : "Credentials incomplete, click for details"}
                 >
                   <Power className="h-3.5 w-3.5" />
                 </Button>
               )}
               
               <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); handleRefresh() }} disabled={account.status === 'refreshing'} title="Check account info (usage, subscription, ban status)">
                  <RefreshCw className={cn("h-3.5 w-3.5", account.status === 'refreshing' && "animate-spin")} />
               </Button>
               <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); handleRefreshToken() }} disabled={isRefreshingToken} title="Refresh Token (access token only)">
                  <KeyRound className={cn("h-3.5 w-3.5", isRefreshingToken && "animate-pulse")} />
               </Button>
               
               <Button size="icon" variant="ghost" className={cn("h-7 w-7 text-muted-foreground hover:text-foreground", copied && "text-green-500")} onClick={(e) => { e.stopPropagation(); handleCopyCredentials() }} title="Copy credentials">
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
               </Button>

               <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); onShowDetail() }} title="Details">
                  <Info className="h-3.5 w-3.5" />
               </Button>
               
               <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); onEdit() }} title="Edit">
                  <Edit className="h-3.5 w-3.5" />
               </Button>
               
               <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive transition-colors" onClick={(e) => { e.stopPropagation(); handleDelete() }} title="Delete">
                  <Trash2 className="h-3.5 w-3.5" />
               </Button>
            </div>
        </div>

        {/* Error Message (Non-banned) */}
        {account.lastError && !isUnauthorized && (
          <div className="bg-red-50 text-red-600 text-[10px] p-1.5 rounded flex items-center gap-1.5 truncate mt-1" title={account.lastError}>
             <AlertTriangle className="h-3 w-3 shrink-0" />
             <span className="truncate">{account.lastError}</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
})
