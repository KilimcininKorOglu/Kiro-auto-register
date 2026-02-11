import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '../ui'
import { X, Save, RefreshCw } from 'lucide-react'

interface SteeringEditorProps {
  filename: string
  onClose: () => void
  onSaved?: () => void
}

export function SteeringEditor({ filename, onClose, onSaved }: SteeringEditorProps) {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [modified, setModified] = useState(false)

  useEffect(() => {
    loadContent()
  }, [filename])

  const loadContent = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.api.readKiroSteeringFile(filename)
      if (result.success && result.content !== undefined) {
        setContent(result.content)
        setModified(false)
      } else {
        setError(result.error || 'Failed to read file')
      }
    } catch (err) {
      setError('Failed to read file')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const saveContent = async () => {
    setSaving(true)
    setError(null)
    try {
      const result = await window.api.saveKiroSteeringFile(filename, content)
      if (result.success) {
        setModified(false)
        onSaved?.()
      } else {
        setError(result.error || 'Failed to save file')
      }
    } catch (err) {
      setError('Failed to save file')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const handleClose = () => {
    if (modified) {
      if (confirm('File has been modified. Are you sure you want to close? Unsaved changes will be lost.')) {
        onClose()
      }
    } else {
      onClose()
    }
  }

  const handleChange = (value: string) => {
    setContent(value)
    setModified(true)
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />
      
      {/* Dialog */}
      <div className="relative bg-background rounded-lg shadow-xl w-[90vw] max-w-4xl h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">Edit Steering File</h2>
            <span className="text-sm text-muted-foreground font-mono">{filename}</span>
            {modified && <span className="text-xs text-orange-500">- Modified</span>}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={loadContent} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button 
              variant="default" 
              size="sm" 
              onClick={saveContent} 
              disabled={saving || !modified}
            >
              <Save className="h-4 w-4 mr-1" />
              {saving ? 'Saving...' : 'Save'}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="px-4 py-2 bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        {/* Editor */}
        <div className="flex-1 p-4 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <textarea
              value={content}
              onChange={(e) => handleChange(e.target.value)}
              className="w-full h-full p-4 font-mono text-sm bg-muted rounded-lg border-0 resize-none focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Edit Steering rules here..."
              spellCheck={false}
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t text-xs text-muted-foreground">
          Tip: Steering files use Markdown format to define AI assistant behavior rules
        </div>
      </div>
    </div>,
    document.body
  )
}
