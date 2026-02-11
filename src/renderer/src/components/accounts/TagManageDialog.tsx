import { useState } from 'react'
import { Button, Card, CardContent, CardHeader, CardTitle } from '../ui'
import { useAccountsStore } from '@/store/accounts'
import type { AccountTag } from '@/types/account'
import { X, Plus, Edit2, Trash2, Tag, Check, Palette } from 'lucide-react'

interface TagManageDialogProps {
  isOpen: boolean
  onClose: () => void
}

// Preset colors (with alpha)
const PRESET_COLORS = [
  { name: 'Red', value: '#ffef4444' },
  { name: 'Orange', value: '#fff97316' },
  { name: 'Yellow', value: '#ffeab308' },
  { name: 'Green', value: '#ff22c55e' },
  { name: 'Cyan', value: '#ff06b6d4' },
  { name: 'Blue', value: '#ff3b82f6' },
  { name: 'Purple', value: '#ff8b5cf6' },
  { name: 'Pink', value: '#ffec4899' },
  { name: 'Gray', value: '#ff6b7280' },
  // Semi-transparent versions
  { name: 'Light Red', value: '#80ef4444' },
  { name: 'Light Green', value: '#8022c55e' },
  { name: 'Light Blue', value: '#803b82f6' },
  { name: 'Light Purple', value: '#808b5cf6' },
]

// Parse ARGB color
function parseArgb(color: string): { alpha: number; rgb: string } {
  // Supports format: #AARRGGBB or #RRGGBB
  if (color.length === 9 && color.startsWith('#')) {
    const alpha = parseInt(color.slice(1, 3), 16)
    const rgb = '#' + color.slice(3)
    return { alpha, rgb }
  }
  return { alpha: 255, rgb: color }
}

// Convert to ARGB format
function toArgb(rgb: string, alpha: number): string {
  const hex = rgb.startsWith('#') ? rgb.slice(1) : rgb
  const alphaHex = Math.round(alpha).toString(16).padStart(2, '0')
  return `#${alphaHex}${hex}`
}

// Convert to CSS rgba
function toRgba(argbColor: string): string {
  const { alpha, rgb } = parseArgb(argbColor)
  const hex = rgb.startsWith('#') ? rgb.slice(1) : rgb
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha / 255})`
}

export function TagManageDialog({ isOpen, onClose }: TagManageDialogProps): React.ReactNode {
  const { tags, accounts, addTag, updateTag, removeTag, addTagToAccounts, removeTagFromAccounts } = useAccountsStore()

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('#ff3b82f6')
  const [editAlpha, setEditAlpha] = useState(255)

  // Create state
  const [isCreating, setIsCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#3b82f6')
  const [newAlpha, setNewAlpha] = useState(255)

  // Assign accounts state
  const [assigningTagId, setAssigningTagId] = useState<string | null>(null)

  // Get tag account count
  const getTagAccountCount = (tagId: string): number => {
    return Array.from(accounts.values()).filter(acc => acc.tags.includes(tagId)).length
  }

  // Get untagged account count
  const getUntaggedCount = (): number => {
    return Array.from(accounts.values()).filter(acc => acc.tags.length === 0).length
  }

  // Create tag
  const handleCreate = () => {
    if (!newName.trim()) return
    const argbColor = toArgb(newColor, newAlpha)
    addTag({
      name: newName.trim(),
      color: argbColor
    })
    setNewName('')
    setNewColor('#3b82f6')
    setNewAlpha(255)
    setIsCreating(false)
  }

  // Start editing
  const handleStartEdit = (tag: AccountTag) => {
    setEditingId(tag.id)
    setEditName(tag.name)
    const { alpha, rgb } = parseArgb(tag.color)
    setEditColor(rgb)
    setEditAlpha(alpha)
  }

  // Save edit
  const handleSaveEdit = () => {
    if (!editingId || !editName.trim()) return
    const argbColor = toArgb(editColor, editAlpha)
    updateTag(editingId, {
      name: editName.trim(),
      color: argbColor
    })
    setEditingId(null)
  }

  // Delete tag
  const handleDelete = (id: string, name: string) => {
    const count = getTagAccountCount(id)
    const msg = count > 0
      ? `Are you sure you want to delete tag "${name}"?\nThis tag is applied to ${count} accounts, it will be removed from them.`
      : `Are you sure you want to delete tag "${name}"?`
    if (confirm(msg)) {
      removeTag(id)
    }
  }

  // Get accounts with this tag
  const getTaggedAccounts = (tagId: string) => {
    return Array.from(accounts.values()).filter(acc => acc.tags.includes(tagId))
  }

  // Get accounts without this tag
  const getUntaggedByTag = (tagId: string) => {
    return Array.from(accounts.values()).filter(acc => !acc.tags.includes(tagId))
  }

  const tagList = Array.from(tags.values())

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <Card className="relative w-full max-w-2xl max-h-[85vh] overflow-hidden z-10 flex flex-col">
        <CardHeader className="flex flex-row items-center justify-between pb-2 shrink-0">
          <CardTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            Tag Management
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent className="flex-1 overflow-auto space-y-4">
          {/* Statistics */}
          <div className="flex gap-4 text-sm text-muted-foreground">
            <span>{tagList.length} tags total</span>
            <span>-</span>
            <span>{getUntaggedCount()} untagged accounts</span>
          </div>

          {/* Create tag */}
          {isCreating ? (
            <div className="p-4 border rounded-lg space-y-3 bg-muted/30">
              <div className="flex items-center gap-2">
                <div 
                  className="w-8 h-8 rounded border cursor-pointer flex items-center justify-center"
                  style={{ backgroundColor: toRgba(toArgb(newColor, newAlpha)) }}
                >
                  <input
                    type="color"
                    value={newColor}
                    onChange={(e) => setNewColor(e.target.value)}
                    className="w-full h-full opacity-0 cursor-pointer"
                  />
                </div>
                <input
                  type="text"
                  placeholder="Tag name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="flex-1 px-3 py-2 border rounded-lg text-sm"
                  autoFocus
                />
              </div>
              
              {/* Opacity slider */}
              <div className="flex items-center gap-3">
                <Palette className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground w-16">Opacity</span>
                <input
                  type="range"
                  min="0"
                  max="255"
                  value={newAlpha}
                  onChange={(e) => setNewAlpha(parseInt(e.target.value))}
                  className="flex-1"
                />
                <span className="text-sm w-12 text-right">{Math.round(newAlpha / 255 * 100)}%</span>
              </div>

              {/* Preset colors */}
              <div className="flex flex-wrap gap-1">
                {PRESET_COLORS.map((preset) => (
                  <button
                    key={preset.value}
                    className="w-6 h-6 rounded border hover:scale-110 transition-transform"
                    style={{ backgroundColor: toRgba(preset.value) }}
                    onClick={() => {
                      const { alpha, rgb } = parseArgb(preset.value)
                      setNewColor(rgb)
                      setNewAlpha(alpha)
                    }}
                    title={preset.name}
                  />
                ))}
              </div>

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
              New Tag
            </Button>
          )}

          {/* Tag list */}
          <div className="space-y-2">
            {tagList.map((tag) => (
              <div
                key={tag.id}
                className="p-3 border rounded-lg hover:bg-muted/30 transition-colors"
              >
                {editingId === tag.id ? (
                  // Edit mode
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-8 h-8 rounded border cursor-pointer flex items-center justify-center"
                        style={{ backgroundColor: toRgba(toArgb(editColor, editAlpha)) }}
                      >
                        <input
                          type="color"
                          value={editColor}
                          onChange={(e) => setEditColor(e.target.value)}
                          className="w-full h-full opacity-0 cursor-pointer"
                        />
                      </div>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 px-3 py-1.5 border rounded text-sm"
                        autoFocus
                      />
                    </div>
                    
                    {/* Opacity slider */}
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground w-16">Opacity</span>
                      <input
                        type="range"
                        min="0"
                        max="255"
                        value={editAlpha}
                        onChange={(e) => setEditAlpha(parseInt(e.target.value))}
                        className="flex-1"
                      />
                      <span className="text-sm w-12 text-right">{Math.round(editAlpha / 255 * 100)}%</span>
                    </div>

                    {/* Preset colors */}
                    <div className="flex flex-wrap gap-1">
                      {PRESET_COLORS.map((preset) => (
                        <button
                          key={preset.value}
                          className="w-6 h-6 rounded border hover:scale-110 transition-transform"
                          style={{ backgroundColor: toRgba(preset.value) }}
                          onClick={() => {
                            const { alpha, rgb } = parseArgb(preset.value)
                            setEditColor(rgb)
                            setEditAlpha(alpha)
                          }}
                          title={preset.name}
                        />
                      ))}
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                      <Button size="sm" onClick={handleSaveEdit}>
                        Save
                      </Button>
                    </div>
                  </div>
                ) : assigningTagId === tag.id ? (
                  // Assign accounts mode
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium text-white"
                        style={{ backgroundColor: toRgba(tag.color) }}
                      >
                        {tag.name}
                      </span>
                      <span className="text-sm text-muted-foreground">- Select accounts to tag</span>
                    </div>
                    
                    {/* Tagged accounts */}
                    {getTaggedAccounts(tag.id).length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Tagged accounts:</p>
                        <div className="flex flex-wrap gap-1">
                          {getTaggedAccounts(tag.id).map(acc => (
                            <span
                              key={acc.id}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs"
                              style={{ backgroundColor: toRgba(tag.color), color: 'white' }}
                            >
                              {acc.email}
                              <button
                                onClick={() => removeTagFromAccounts([acc.id], tag.id)}
                                className="hover:opacity-70"
                                title="Remove tag"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Accounts to add tag */}
                    {getUntaggedByTag(tag.id).length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Click to add tag:</p>
                        <div className="flex flex-wrap gap-1 max-h-32 overflow-auto">
                          {getUntaggedByTag(tag.id).map(acc => (
                            <button
                              key={acc.id}
                              onClick={() => addTagToAccounts([acc.id], tag.id)}
                              className="px-2 py-0.5 bg-muted hover:bg-primary/20 rounded text-xs transition-colors"
                            >
                              {acc.email}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex justify-end">
                      <Button variant="outline" size="sm" onClick={() => setAssigningTagId(null)}>
                        Done
                      </Button>
                    </div>
                  </div>
                ) : (
                  // Display mode
                  <div className="flex items-center gap-3">
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium text-white shrink-0"
                      style={{ backgroundColor: toRgba(tag.color) }}
                    >
                      {tag.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {getTagAccountCount(tag.id)} accounts
                    </span>
                    <div className="flex-1" />
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setAssigningTagId(tag.id)}
                        title="Manage accounts"
                      >
                        <Tag className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleStartEdit(tag)}
                        title="Edit"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(tag.id, tag.name)}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {tagList.length === 0 && !isCreating && (
              <div className="text-center py-8 text-muted-foreground">
                <Tag className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No tags yet</p>
                <p className="text-sm">Click the button above to create your first tag</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// Export utility functions for other components
export { toRgba, parseArgb, toArgb }
