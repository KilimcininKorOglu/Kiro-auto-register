import { useState } from 'react'
import { Button, Card, CardContent, CardHeader, CardTitle } from '../ui'
import { useAccountsStore } from '@/store/accounts'
import type { AccountGroup } from '@/types/account'
import { X, Plus, Edit2, Trash2, Users, Check, FolderOpen } from 'lucide-react'

interface GroupManageDialogProps {
  isOpen: boolean
  onClose: () => void
}

export function GroupManageDialog({ isOpen, onClose }: GroupManageDialogProps): React.ReactNode {
  const { groups, accounts, addGroup, updateGroup, removeGroup, moveAccountsToGroup } = useAccountsStore()

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editColor, setEditColor] = useState('#3b82f6')

  // Create state
  const [isCreating, setIsCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newColor, setNewColor] = useState('#3b82f6')

  // Assign accounts state
  const [assigningGroupId, setAssigningGroupId] = useState<string | null>(null)

  // Get account count in group
  const getGroupAccountCount = (groupId: string): number => {
    return Array.from(accounts.values()).filter(acc => acc.groupId === groupId).length
  }

  // Get ungrouped account count
  const getUngroupedCount = (): number => {
    return Array.from(accounts.values()).filter(acc => !acc.groupId).length
  }

  // Create group
  const handleCreate = () => {
    if (!newName.trim()) return
    addGroup({
      name: newName.trim(),
      description: newDescription.trim() || undefined,
      color: newColor
    })
    setNewName('')
    setNewDescription('')
    setNewColor('#3b82f6')
    setIsCreating(false)
  }

  // Start editing
  const handleStartEdit = (group: AccountGroup) => {
    setEditingId(group.id)
    setEditName(group.name)
    setEditDescription(group.description || '')
    setEditColor(group.color || '#3b82f6')
  }

  // Save edit
  const handleSaveEdit = () => {
    if (!editingId || !editName.trim()) return
    updateGroup(editingId, {
      name: editName.trim(),
      description: editDescription.trim() || undefined,
      color: editColor
    })
    setEditingId(null)
  }

  // Delete group
  const handleDelete = (id: string, name: string) => {
    const count = getGroupAccountCount(id)
    const msg = count > 0
      ? `Are you sure you want to delete group "${name}"?\nThis group contains ${count} accounts, they will become ungrouped after deletion.`
      : `Are you sure you want to delete group "${name}"?`
    if (confirm(msg)) {
      removeGroup(id)
    }
  }

  // Batch assign accounts to group (don't exit assign mode, allow continuous operations)
  const handleAssignAccounts = (groupId: string | undefined, accountIds: string[]) => {
    moveAccountsToGroup(accountIds, groupId)
  }

  // Get assignable accounts list
  const getAssignableAccounts = (groupId: string) => {
    return Array.from(accounts.values()).filter(acc => acc.groupId !== groupId)
  }

  // Get accounts in group
  const getGroupAccounts = (groupId: string) => {
    return Array.from(accounts.values()).filter(acc => acc.groupId === groupId)
  }

  const groupList = Array.from(groups.values()).sort((a, b) => a.order - b.order)

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <Card className="relative w-full max-w-2xl max-h-[85vh] overflow-hidden z-10 flex flex-col">
        <CardHeader className="flex flex-row items-center justify-between pb-2 shrink-0">
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            Group Management
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent className="flex-1 overflow-auto space-y-4">
          {/* Statistics */}
          <div className="flex gap-4 text-sm text-muted-foreground">
            <span>{groupList.length} groups total</span>
            <span>-</span>
            <span>{getUngroupedCount()} ungrouped accounts</span>
          </div>

          {/* Create group */}
          {isCreating ? (
            <div className="p-4 border rounded-lg space-y-3 bg-muted/30">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer"
                />
                <input
                  type="text"
                  placeholder="Group name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="flex-1 px-3 py-2 border rounded-lg text-sm"
                  autoFocus
                />
              </div>
              <input
                type="text"
                placeholder="Group description (optional)"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setIsCreating(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleCreate} disabled={!newName.trim()}>
                  <Check className="h-4 w-4 mr-1" />
                  Create
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" className="w-full" onClick={() => setIsCreating(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Group
            </Button>
          )}

          {/* Group list */}
          <div className="space-y-2">
            {groupList.map((group) => (
              <div
                key={group.id}
                className="p-3 border rounded-lg hover:bg-muted/30 transition-colors"
              >
                {editingId === group.id ? (
                  // Edit mode
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={editColor}
                        onChange={(e) => setEditColor(e.target.value)}
                        className="w-8 h-8 rounded cursor-pointer"
                      />
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 px-3 py-1.5 border rounded text-sm"
                        autoFocus
                      />
                    </div>
                    <input
                      type="text"
                      placeholder="Group description"
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      className="w-full px-3 py-1.5 border rounded text-sm"
                    />
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                      <Button size="sm" onClick={handleSaveEdit}>
                        Save
                      </Button>
                    </div>
                  </div>
                ) : assigningGroupId === group.id ? (
                  // Assign accounts mode
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-4 h-4 rounded"
                        style={{ backgroundColor: group.color || '#3b82f6' }}
                      />
                      <span className="font-medium">{group.name}</span>
                      <span className="text-sm text-muted-foreground">- Select accounts to add</span>
                    </div>
                    
                    {/* Accounts in current group */}
                    {getGroupAccounts(group.id).length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Accounts in this group:</p>
                        <div className="flex flex-wrap gap-1">
                          {getGroupAccounts(group.id).map(acc => (
                            <span
                              key={acc.id}
                              className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded text-xs"
                            >
                              {acc.email}
                              <button
                                onClick={() => handleAssignAccounts(undefined, [acc.id])}
                                className="hover:text-destructive"
                                title="Remove from group"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Assignable accounts */}
                    {getAssignableAccounts(group.id).length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Click to add to this group:</p>
                        <div className="flex flex-wrap gap-1 max-h-32 overflow-auto">
                          {getAssignableAccounts(group.id).map(acc => (
                            <button
                              key={acc.id}
                              onClick={() => handleAssignAccounts(group.id, [acc.id])}
                              className="px-2 py-0.5 bg-muted hover:bg-primary/20 rounded text-xs transition-colors"
                            >
                              {acc.email}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex justify-end">
                      <Button variant="outline" size="sm" onClick={() => setAssigningGroupId(null)}>
                        Done
                      </Button>
                    </div>
                  </div>
                ) : (
                  // Display mode
                  <div className="flex items-center gap-3">
                    <div
                      className="w-4 h-4 rounded shrink-0"
                      style={{ backgroundColor: group.color || '#3b82f6' }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{group.name}</span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {getGroupAccountCount(group.id)}
                        </span>
                      </div>
                      {group.description && (
                        <p className="text-xs text-muted-foreground truncate">{group.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setAssigningGroupId(group.id)}
                        title="Manage accounts"
                      >
                        <Users className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleStartEdit(group)}
                        title="Edit"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(group.id, group.name)}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {groupList.length === 0 && !isCreating && (
              <div className="text-center py-8 text-muted-foreground">
                <FolderOpen className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No groups yet</p>
                <p className="text-sm">Click the button above to create your first group</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
