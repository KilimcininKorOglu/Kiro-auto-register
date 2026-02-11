import { useState, useRef, useEffect } from 'react'
import { Button, Badge } from '../ui'
import { useAccountsStore } from '@/store/accounts'
import { AccountFilterPanel } from './AccountFilter'
import {
  Search,
  Plus,
  Upload,
  Download,
  RefreshCw,
  Trash2,
  Tag,
  FolderPlus,
  CheckSquare,
  Square,
  Loader2,
  Eye,
  EyeOff,
  Filter,
  ChevronDown,
  Check,
  X,
  Minus
} from 'lucide-react'

interface AccountToolbarProps {
  onAddAccount: () => void
  onImport: () => void
  onExport: () => void
  onManageGroups: () => void
  onManageTags: () => void
  isFilterExpanded: boolean
  onToggleFilter: () => void
}

export function AccountToolbar({
  onAddAccount,
  onImport,
  onExport,
  onManageGroups,
  onManageTags,
  isFilterExpanded,
  onToggleFilter
}: AccountToolbarProps): React.ReactNode {
  const {
    filter,
    setFilter,
    selectedIds,
    selectAll,
    deselectAll,
    removeAccounts,
    batchRefreshTokens,
    batchCheckStatus,
    getFilteredAccounts,
    getStats,
    privacyMode,
    setPrivacyMode,
    groups,
    tags,
    accounts,
    moveAccountsToGroup,
    addTagToAccounts,
    removeTagFromAccounts
  } = useAccountsStore()

  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isChecking, setIsChecking] = useState(false)
  const [showGroupMenu, setShowGroupMenu] = useState(false)
  const [showTagMenu, setShowTagMenu] = useState(false)
  
  const groupMenuRef = useRef<HTMLDivElement>(null)
  const tagMenuRef = useRef<HTMLDivElement>(null)
  
  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (groupMenuRef.current && !groupMenuRef.current.contains(e.target as Node)) {
        setShowGroupMenu(false)
      }
      if (tagMenuRef.current && !tagMenuRef.current.contains(e.target as Node)) {
        setShowTagMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])
  
  // Get selected accounts group status
  const getSelectedAccountsGroupStatus = () => {
    const selectedAccounts = Array.from(selectedIds).map(id => accounts.get(id)).filter(Boolean)
    const groupCounts = new Map<string | undefined, number>()
    
    selectedAccounts.forEach(acc => {
      if (acc) {
        const gid = acc.groupId
        groupCounts.set(gid, (groupCounts.get(gid) || 0) + 1)
      }
    })
    
    return { selectedAccounts, groupCounts }
  }
  
  const getSelectedAccountsTagStatus = () => {
    const selectedAccounts = Array.from(selectedIds).map(id => accounts.get(id)).filter(Boolean)
    const tagCounts = new Map<string, number>()
    
    selectedAccounts.forEach(acc => {
      if (acc?.tags) {
        acc.tags.forEach(tagId => {
          tagCounts.set(tagId, (tagCounts.get(tagId) || 0) + 1)
        })
      }
    })
    
    return { selectedAccounts, tagCounts, total: selectedAccounts.length }
  }
  
  // Handle group operation
  const handleMoveToGroup = (groupId: string | undefined) => {
    if (selectedIds.size === 0) return
    moveAccountsToGroup(Array.from(selectedIds), groupId)
    setShowGroupMenu(false)
  }
  
  // Handle tag operation
  const handleAddTag = (tagId: string) => {
    if (selectedIds.size === 0) return
    addTagToAccounts(Array.from(selectedIds), tagId)
  }
  
  const handleRemoveTag = (tagId: string) => {
    if (selectedIds.size === 0) return
    removeTagFromAccounts(Array.from(selectedIds), tagId)
  }
  
  const handleToggleTag = (tagId: string) => {
    const { tagCounts, total } = getSelectedAccountsTagStatus()
    const count = tagCounts.get(tagId) || 0
    
    if (count === total) {
      // All selected accounts have this tag, remove
      handleRemoveTag(tagId)
    } else {
      // Some or no accounts have this tag, add
      handleAddTag(tagId)
    }
  }

  const stats = getStats()
  const filteredCount = getFilteredAccounts().length
  const selectedCount = selectedIds.size

  const handleSearch = (value: string): void => {
    setFilter({ ...filter, search: value || undefined })
  }

  const handleBatchRefresh = async (): Promise<void> => {
    if (selectedCount === 0) return
    setIsRefreshing(true)
    await batchRefreshTokens(Array.from(selectedIds))
    setIsRefreshing(false)
  }

  const handleBatchCheck = async (): Promise<void> => {
    if (selectedCount === 0) return
    setIsChecking(true)
    await batchCheckStatus(Array.from(selectedIds))
    setIsChecking(false)
  }

  const handleBatchDelete = (): void => {
    if (selectedCount === 0) return
    if (confirm(`Are you sure you want to delete ${selectedCount} selected accounts?`)) {
      removeAccounts(Array.from(selectedIds))
    }
  }

  const handleToggleSelectAll = (): void => {
    if (selectedCount === filteredCount && filteredCount > 0) {
      deselectAll()
    } else {
      selectAll()
    }
  }

  return (
    <div className="space-y-3">
      {/* Search and main actions */}
      <div className="flex items-center gap-3">
        {/* Search box */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search accounts..."
            className="w-full pl-9 pr-4 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
            value={filter.search ?? ''}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>

        {/* Main action buttons */}
        <Button onClick={onAddAccount}>
          <Plus className="h-4 w-4 mr-1" />
          Add Account
        </Button>
        <Button variant="outline" onClick={onImport}>
          <Upload className="h-4 w-4 mr-1" />
          Import
        </Button>
        <Button variant="outline" onClick={onExport}>
          <Download className="h-4 w-4 mr-1" />
          Export
        </Button>
      </div>

      {/* Stats and selection actions */}
      <div className="flex items-center justify-between">
        {/* Left: Statistics */}
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">
            Total <span className="font-medium text-foreground">{stats.total}</span> accounts
            {filteredCount !== stats.total && (
              <span>, filtered <span className="font-medium text-foreground">{filteredCount}</span></span>
            )}
          </span>
          {stats.expiringSoonCount > 0 && (
            <Badge variant="destructive" className="gap-1">
              {stats.expiringSoonCount} expiring soon
            </Badge>
          )}
        </div>

        {/* Right: Selection actions and management */}
        <div className="flex items-center gap-2">
          {/* Group dropdown menu */}
          <div className="relative" ref={groupMenuRef}>
            <Button 
              variant={showGroupMenu ? "default" : "ghost"} 
              size="sm" 
              onClick={() => {
                if (selectedCount > 0) {
                  setShowGroupMenu(!showGroupMenu)
                  setShowTagMenu(false)
                } else {
                  onManageGroups()
                }
              }}
              title={selectedCount > 0 ? "Batch set group" : "Manage groups"}
            >
              <FolderPlus className="h-4 w-4 mr-1" />
              Groups
              {selectedCount > 0 && <ChevronDown className="h-3 w-3 ml-1" />}
            </Button>
            
            {showGroupMenu && selectedCount > 0 && (
              <div className="absolute left-0 top-full mt-2 z-50 min-w-[200px] bg-popover border rounded-lg shadow-lg p-2">
                <div className="absolute -top-2 left-4 w-4 h-4 bg-popover border-l border-t rotate-45" />
                <div className="text-xs text-muted-foreground px-2 py-1 mb-1">
                  {selectedCount} accounts selected
                </div>
                <div className="border-t my-1" />
                
                {/* Remove from group */}
                <button
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-muted text-left"
                  onClick={() => handleMoveToGroup(undefined)}
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                  <span>Remove from group</span>
                  {(() => {
                    const { groupCounts, selectedAccounts } = getSelectedAccountsGroupStatus()
                    const noGroupCount = groupCounts.get(undefined) || 0
                    if (noGroupCount === selectedAccounts.length) {
                      return <Check className="h-4 w-4 ml-auto text-primary" />
                    }
                    return null
                  })()}
                </button>
                
                <div className="border-t my-1" />
                
                {/* Group list */}
                {Array.from(groups.values()).map(group => {
                  const { groupCounts, selectedAccounts } = getSelectedAccountsGroupStatus()
                  const count = groupCounts.get(group.id) || 0
                  const isAllInGroup = count === selectedAccounts.length
                  
                  return (
                    <button
                      key={group.id}
                      className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-muted text-left"
                      onClick={() => handleMoveToGroup(group.id)}
                    >
                      <div 
                        className="w-3 h-3 rounded-full shrink-0" 
                        style={{ backgroundColor: group.color || '#888' }} 
                      />
                      <span className="truncate flex-1">{group.name}</span>
                      {isAllInGroup && <Check className="h-4 w-4 text-primary" />}
                      {count > 0 && !isAllInGroup && (
                        <span className="text-xs text-muted-foreground">{count}</span>
                      )}
                    </button>
                  )
                })}
                
                {groups.size === 0 && (
                  <div className="text-sm text-muted-foreground px-2 py-2 text-center">
                    No groups
                  </div>
                )}
                
                <div className="border-t my-1" />
                <button
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-muted text-primary"
                  onClick={() => {
                    setShowGroupMenu(false)
                    onManageGroups()
                  }}
                >
                  <Plus className="h-4 w-4" />
                  <span>Manage Groups</span>
                </button>
              </div>
            )}
          </div>
          
          {/* Tag dropdown menu */}
          <div className="relative" ref={tagMenuRef}>
            <Button 
              variant={showTagMenu ? "default" : "ghost"} 
              size="sm" 
              onClick={() => {
                if (selectedCount > 0) {
                  setShowTagMenu(!showTagMenu)
                  setShowGroupMenu(false)
                } else {
                  onManageTags()
                }
              }}
              title={selectedCount > 0 ? "Batch set tags" : "Manage tags"}
            >
              <Tag className="h-4 w-4 mr-1" />
              Tags
              {selectedCount > 0 && <ChevronDown className="h-3 w-3 ml-1" />}
            </Button>
            
            {showTagMenu && selectedCount > 0 && (
              <div className="absolute left-0 top-full mt-2 z-50 min-w-[220px] bg-popover border rounded-lg shadow-lg p-2">
                <div className="absolute -top-2 left-4 w-4 h-4 bg-popover border-l border-t rotate-45" />
                <div className="text-xs text-muted-foreground px-2 py-1 mb-1">
                  {selectedCount} accounts selected (multi-select)
                </div>
                <div className="border-t my-1" />
                
                {/* Tag list */}
                <div className="max-h-[300px] overflow-y-auto">
                  {Array.from(tags.values()).map(tag => {
                    const { tagCounts, total } = getSelectedAccountsTagStatus()
                    const count = tagCounts.get(tag.id) || 0
                    const isAll = count === total
                    const isPartial = count > 0 && count < total
                    
                    return (
                      <button
                        key={tag.id}
                        className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-muted text-left"
                        onClick={() => handleToggleTag(tag.id)}
                      >
                        <div 
                          className="w-4 h-4 rounded border flex items-center justify-center shrink-0"
                          style={{ 
                            backgroundColor: isAll ? (tag.color || '#888') : 'transparent',
                            borderColor: tag.color || '#888'
                          }}
                        >
                          {isAll && <Check className="h-3 w-3 text-white" />}
                          {isPartial && <Minus className="h-3 w-3" style={{ color: tag.color || '#888' }} />}
                        </div>
                        <span className="truncate flex-1">{tag.name}</span>
                        {isPartial && (
                          <span className="text-xs text-muted-foreground">{count}/{total}</span>
                        )}
                      </button>
                    )
                  })}
                </div>
                
                {tags.size === 0 && (
                  <div className="text-sm text-muted-foreground px-2 py-2 text-center">
                    No tags
                  </div>
                )}
                
                <div className="border-t my-1" />
                <button
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-muted text-primary"
                  onClick={() => {
                    setShowTagMenu(false)
                    onManageTags()
                  }}
                >
                  <Plus className="h-4 w-4" />
                  <span>Manage Tags</span>
                </button>
              </div>
            )}
          </div>
          <Button
            variant={privacyMode ? "default" : "ghost"}
            size="sm"
            onClick={() => setPrivacyMode(!privacyMode)}
            title={privacyMode ? "Disable privacy mode" : "Enable privacy mode"}
          >
            {privacyMode ? (
              <EyeOff className="h-4 w-4 mr-1" />
            ) : (
              <Eye className="h-4 w-4 mr-1" />
            )}
            Privacy
          </Button>
          {/* Filter button and bubble */}
          <div className="relative">
            <Button
              variant={isFilterExpanded ? "default" : "ghost"}
              size="sm"
              onClick={onToggleFilter}
              title="Expand/collapse advanced filter"
            >
              <Filter className="h-4 w-4 mr-1" />
              Filter
            </Button>
            {/* Filter bubble panel */}
            {isFilterExpanded && (
              <div className="absolute right-0 top-full mt-2 z-50 min-w-[600px] bg-popover border rounded-lg shadow-lg">
                {/* Bubble arrow */}
                <div className="absolute -top-2 right-4 w-4 h-4 bg-popover border-l border-t rotate-45" />
                <AccountFilterPanel />
              </div>
            )}
          </div>

          <div className="w-px h-6 bg-border mx-2" />

          {/* Batch operations */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBatchCheck}
            disabled={isChecking || selectedCount === 0}
            title="Check account info: refresh usage, subscription details, ban status, etc."
          >
            {isChecking ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1" />
            )}
            Check
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={handleBatchDelete}
            disabled={selectedCount === 0}
            title="Delete selected accounts"
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBatchRefresh}
            disabled={isRefreshing || selectedCount === 0}
            title="Refresh Token: only refresh access token to maintain login status"
          >
            {isRefreshing ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1" />
            )}
            Refresh
          </Button>

          <div className="w-px h-6 bg-border mx-2" />

          {/* Select all */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleToggleSelectAll}
          >
            {selectedCount === filteredCount && filteredCount > 0 ? (
              <CheckSquare className="h-4 w-4 mr-1" />
            ) : (
              <Square className="h-4 w-4 mr-1" />
            )}
            {selectedCount > 0 ? `${selectedCount} selected` : 'Select All'}
          </Button>
        </div>
      </div>
    </div>
  )
}
