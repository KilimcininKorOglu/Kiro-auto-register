import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, Button, Toggle, Select } from '../ui'
import { SteeringEditor, McpServerEditor } from '../kiro'
import { 
  FileText, 
  ChevronDown, 
  ChevronUp, 
  Plus, 
  Trash2, 
  RefreshCw,
  ExternalLink,
  FolderOpen,
  Save,
  AlertCircle,
  Edit,
  Sparkles,
  Shield,
  Zap,
  Settings2,
  Terminal
} from 'lucide-react'

interface KiroSettings {
  agentAutonomy: string
  modelSelection: string
  enableDebugLogs: boolean
  enableTabAutocomplete: boolean
  enableCodebaseIndexing: boolean
  usageSummary: boolean
  codeReferences: boolean
  configureMCP: string
  trustedCommands: string[]
  commandDenylist: string[]
  ignoreFiles: string[]
  mcpApprovedEnvVars: string[]
  // Notification settings
  notificationsActionRequired: boolean
  notificationsFailure: boolean
  notificationsSuccess: boolean
  notificationsBilling: boolean
}

interface McpServer {
  command: string
  args?: string[]
  env?: Record<string, string>
}

interface McpConfig {
  mcpServers: Record<string, McpServer>
}

// Default dangerous commands to deny
const defaultDenyCommands = [
  'rm -rf *',
  'rm -rf /',
  'rm -rf ~',
  'del /f /s /q *',
  'format',
  'mkfs',
  'dd if=',
  ':(){:|:&};:',
  'chmod -R 777 /',
  'chown -R',
  '> /dev/sda',
  'wget * | sh',
  'curl * | sh',
  'shutdown',
  'reboot',
  'init 0',
  'init 6'
]

// Kiro default settings (consistent with Kiro IDE built-in defaults)
const defaultSettings: KiroSettings = {
  agentAutonomy: 'Autopilot',
  modelSelection: 'auto',
  enableDebugLogs: false,
  enableTabAutocomplete: false,
  enableCodebaseIndexing: false,
  usageSummary: true,
  codeReferences: false,
  configureMCP: 'Enabled',
  trustedCommands: [],
  commandDenylist: [],
  ignoreFiles: [],
  mcpApprovedEnvVars: [],
  notificationsActionRequired: true,
  notificationsFailure: false,
  notificationsSuccess: false,
  notificationsBilling: true
}

const modelOptions = [
  { value: 'auto', label: 'Auto', description: 'Automatically select best model' },
  { value: 'claude-sonnet-4.5', label: 'Claude Sonnet 4.5', description: 'Latest Sonnet model' },
  { value: 'claude-sonnet-4', label: 'Claude Sonnet 4', description: 'Hybrid reasoning and coding' },
  { value: 'claude-haiku-4.5', label: 'Claude Haiku 4.5', description: 'Latest Haiku model' },
  { value: 'claude-opus-4.5', label: 'Claude Opus 4.5', description: 'Most powerful model' }
]

const autonomyOptions = [
  { value: 'Autopilot', label: 'Autopilot (Auto Execute)', description: 'Agent executes tasks automatically' },
  { value: 'Supervised', label: 'Supervised (Confirm)', description: 'Each step requires manual confirmation' }
]

const mcpOptions = [
  { value: 'Enabled', label: 'Enabled', description: 'Allow MCP server connections' },
  { value: 'Disabled', label: 'Disabled', description: 'Disable all MCP features' }
]

export function KiroSettingsPage() {
  const [settings, setSettings] = useState<KiroSettings>(defaultSettings)
  const [mcpConfig, setMcpConfig] = useState<McpConfig>({ mcpServers: {} })
  const [steeringFiles, setSteeringFiles] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [expandedSections, setExpandedSections] = useState({
    agent: true,
    mcp: true,
    steering: true,
    commands: false
  })

  const [newTrustedCommand, setNewTrustedCommand] = useState('')
  const [newDenyCommand, setNewDenyCommand] = useState('')
  const [editingFile, setEditingFile] = useState<string | null>(null)
  const [editingMcp, setEditingMcp] = useState<{ name?: string; server?: McpServer } | null>(null)

  useEffect(() => {
    loadKiroSettings()
  }, [])

  const loadKiroSettings = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.api.getKiroSettings()
      if (result.settings) {
        // Filter out undefined values to avoid overwriting defaults
        const filteredSettings = Object.fromEntries(
          Object.entries(result.settings).filter(([, v]) => v !== undefined)
        ) as Partial<KiroSettings>
        setSettings({ ...defaultSettings, ...filteredSettings })
      }
      if (result.mcpConfig) {
        setMcpConfig(result.mcpConfig as McpConfig)
      }
      if (result.steeringFiles) {
        setSteeringFiles(result.steeringFiles)
      }
    } catch (err) {
      setError('Failed to load Kiro settings')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const saveSettings = async () => {
    setSaving(true)
    setError(null)
    try {
      await window.api.saveKiroSettings(settings as unknown as Record<string, unknown>)
    } catch (err) {
      setError('Failed to save settings')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))
  }

  const openKiroSettingsFile = async () => {
    // Open Kiro settings.json file
    try {
      await window.api.openKiroSettingsFile()
    } catch (err) {
      console.error(err)
    }
  }

  const openMcpConfig = async (type: 'user' | 'workspace') => {
    try {
      await window.api.openKiroMcpConfig(type)
    } catch (err) {
      console.error(err)
    }
  }

  const openSteeringFolder = async () => {
    try {
      await window.api.openKiroSteeringFolder()
    } catch (err) {
      console.error(err)
    }
  }

  const openSteeringFile = (filename: string) => {
    setEditingFile(filename)
  }

  const openSteeringFileExternal = async (filename: string) => {
    try {
      await window.api.openKiroSteeringFile(filename)
    } catch (err) {
      console.error(err)
    }
  }

  const createDefaultRules = async () => {
    try {
      const result = await window.api.createKiroDefaultRules()
      if (result.success) {
        // Reload settings to get newly created files
        await loadKiroSettings()
      }
    } catch (err) {
      console.error(err)
    }
  }

  const deleteSteeringFile = async (filename: string) => {
    if (!confirm(`Are you sure you want to delete "${filename}"? This action cannot be undone.`)) {
      return
    }
    try {
      const result = await window.api.deleteKiroSteeringFile(filename)
      if (result.success) {
        await loadKiroSettings()
      } else {
        setError(result.error || 'Failed to delete file')
      }
    } catch (err) {
      console.error(err)
      setError('Failed to delete file')
    }
  }

  const deleteMcpServer = async (name: string) => {
    if (!confirm(`Are you sure you want to delete MCP server "${name}"?`)) {
      return
    }
    try {
      const result = await window.api.deleteMcpServer(name)
      if (result.success) {
        await loadKiroSettings()
      } else {
        setError(result.error || 'Failed to delete server')
      }
    } catch (err) {
      console.error(err)
      setError('Failed to delete server')
    }
  }

  const addTrustedCommand = () => {
    if (newTrustedCommand.trim()) {
      setSettings(prev => ({
        ...prev,
        trustedCommands: [...prev.trustedCommands, newTrustedCommand.trim()]
      }))
      setNewTrustedCommand('')
    }
  }

  const removeTrustedCommand = (index: number) => {
    setSettings(prev => ({
      ...prev,
      trustedCommands: prev.trustedCommands.filter((_, i) => i !== index)
    }))
  }

  const addDenyCommand = () => {
    if (newDenyCommand.trim()) {
      setSettings(prev => ({
        ...prev,
        commandDenylist: [...prev.commandDenylist, newDenyCommand.trim()]
      }))
      setNewDenyCommand('')
    }
  }

  const addDefaultDenyCommands = () => {
    setSettings(prev => {
      // Filter out already existing commands
      const newCommands = defaultDenyCommands.filter(
        cmd => !prev.commandDenylist.includes(cmd)
      )
      return {
        ...prev,
        commandDenylist: [...prev.commandDenylist, ...newCommands]
      }
    })
  }

  const removeDenyCommand = (index: number) => {
    setSettings(prev => ({
      ...prev,
      commandDenylist: prev.commandDenylist.filter((_, i) => i !== index)
    }))
  }

  if (loading) {
    return (
      <div className="flex-1 p-6 flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex-1 p-6 space-y-6 overflow-auto">
      {/* Page header */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 p-6 border border-primary/20">
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-primary/20 to-transparent rounded-full blur-2xl" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-primary/20 to-transparent rounded-full blur-2xl" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-primary shadow-lg shadow-primary/25">
              <Sparkles className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-primary">Kiro Settings</h1>
              <p className="text-muted-foreground">Manage Kiro IDE configuration, MCP servers, and user rules</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadKiroSettings} className="bg-background/50 backdrop-blur-sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={openKiroSettingsFile} className="bg-background/50 backdrop-blur-sm">
              <ExternalLink className="h-4 w-4 mr-2" />
              Open Settings File
            </Button>
            <Button size="sm" onClick={saveSettings} disabled={saving}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* Agent settings */}
      <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardHeader className="pb-2 cursor-pointer hover:bg-muted/30 transition-colors rounded-t-lg" onClick={() => toggleSection('agent')}>
          <CardTitle className="text-base flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Settings2 className="h-4 w-4 text-primary" />
              </div>
              <span>Agent Settings</span>
            </div>
            {expandedSections.agent ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </CardTitle>
        </CardHeader>
        {expandedSections.agent && (
          <CardContent className="space-y-4">
            {/* Agent Autonomy */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Agent Autonomy Mode</p>
                <p className="text-sm text-muted-foreground">Control whether Agent executes automatically or requires confirmation</p>
              </div>
              <Select
                value={settings.agentAutonomy}
                options={autonomyOptions}
                onChange={(value) => setSettings(prev => ({ ...prev, agentAutonomy: value }))}
                className="w-[200px]"
              />
            </div>

            {/* Model Selection */}
            <div className="flex items-center justify-between border-t pt-4">
              <div>
                <p className="font-medium">Model Selection</p>
                <p className="text-sm text-muted-foreground">Select the AI model for Agent to use</p>
              </div>
              <Select
                value={settings.modelSelection}
                options={modelOptions}
                onChange={(value) => setSettings(prev => ({ ...prev, modelSelection: value }))}
                className="w-[200px]"
              />
            </div>

            {/* Toggle Options */}
            <div className="border-t pt-4 space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors">
                <div>
                  <p className="font-medium">Tab Autocomplete</p>
                  <p className="text-sm text-muted-foreground">Provide code suggestions while typing</p>
                </div>
                <Toggle
                  checked={settings.enableTabAutocomplete}
                  onChange={(checked) => setSettings(prev => ({ ...prev, enableTabAutocomplete: checked }))}
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors">
                <div>
                  <p className="font-medium">Usage Statistics</p>
                  <p className="text-sm text-muted-foreground">Show Agent execution time and usage</p>
                </div>
                <Toggle
                  checked={settings.usageSummary}
                  onChange={(checked) => setSettings(prev => ({ ...prev, usageSummary: checked }))}
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors">
                <div>
                  <p className="font-medium">Code Reference Tracking</p>
                  <p className="text-sm text-muted-foreground">Allow generating code with public code references</p>
                </div>
                <Toggle
                  checked={settings.codeReferences}
                  onChange={(checked) => setSettings(prev => ({ ...prev, codeReferences: checked }))}
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors">
                <div>
                  <p className="font-medium">Codebase Indexing</p>
                  <p className="text-sm text-muted-foreground">Enable codebase indexing to improve search performance</p>
                </div>
                <Toggle
                  checked={settings.enableCodebaseIndexing}
                  onChange={(checked) => setSettings(prev => ({ ...prev, enableCodebaseIndexing: checked }))}
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors">
                <div>
                  <p className="font-medium">Debug Logs</p>
                  <p className="text-sm text-muted-foreground">Show debug logs in output panel</p>
                </div>
                <Toggle
                  checked={settings.enableDebugLogs}
                  onChange={(checked) => setSettings(prev => ({ ...prev, enableDebugLogs: checked }))}
                />
              </div>
            </div>

            {/* Notification settings */}
            <div className="border-t pt-4 space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-primary" />
                <p className="font-medium text-sm">Notification Settings</p>
              </div>
              
              <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors">
                <div>
                  <p className="font-medium">Action Required Notification</p>
                  <p className="text-sm text-muted-foreground">Send notification when Agent needs confirmation</p>
                </div>
                <Toggle
                  checked={settings.notificationsActionRequired}
                  onChange={(checked) => setSettings(prev => ({ ...prev, notificationsActionRequired: checked }))}
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors">
                <div>
                  <p className="font-medium">Failure Notification</p>
                  <p className="text-sm text-muted-foreground">Send notification when Agent execution fails</p>
                </div>
                <Toggle
                  checked={settings.notificationsFailure}
                  onChange={(checked) => setSettings(prev => ({ ...prev, notificationsFailure: checked }))}
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors">
                <div>
                  <p className="font-medium">Success Notification</p>
                  <p className="text-sm text-muted-foreground">Send notification when Agent execution succeeds</p>
                </div>
                <Toggle
                  checked={settings.notificationsSuccess}
                  onChange={(checked) => setSettings(prev => ({ ...prev, notificationsSuccess: checked }))}
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors">
                <div>
                  <p className="font-medium">Billing Notification</p>
                  <p className="text-sm text-muted-foreground">Billing related notifications</p>
                </div>
                <Toggle
                  checked={settings.notificationsBilling}
                  onChange={(checked) => setSettings(prev => ({ ...prev, notificationsBilling: checked }))}
                />
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* MCP settings */}
      <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardHeader className="pb-2 cursor-pointer hover:bg-muted/30 transition-colors rounded-t-lg" onClick={() => toggleSection('mcp')}>
          <CardTitle className="text-base flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Zap className="h-4 w-4 text-primary" />
              </div>
              <span>MCP Servers</span>
              <span className="px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary">
                {Object.keys(mcpConfig.mcpServers).length} servers
              </span>
            </div>
            {expandedSections.mcp ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </CardTitle>
        </CardHeader>
        {expandedSections.mcp && (
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Enable MCP</p>
                <p className="text-sm text-muted-foreground">Allow connections to external tools and data sources</p>
              </div>
              <Select
                value={settings.configureMCP}
                options={mcpOptions}
                onChange={(value) => setSettings(prev => ({ ...prev, configureMCP: value }))}
              />
            </div>

            <div className="border-t pt-4">
              <p className="font-medium mb-2">Configured MCP Servers</p>
              {Object.keys(mcpConfig.mcpServers).length === 0 ? (
                <p className="text-sm text-muted-foreground">No MCP servers configured</p>
              ) : (
                <div className="space-y-2">
                  {Object.entries(mcpConfig.mcpServers).map(([name, server]) => (
                    <div key={name} className="flex items-center justify-between p-2 bg-muted rounded-md">
                      <div className="flex-1">
                        <p className="font-medium text-sm">{name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{server.command}</p>
                      </div>
                      <div className="flex gap-1">
                        <button
                          className="p-1 hover:bg-background rounded transition-colors"
                          onClick={() => setEditingMcp({ name, server })}
                          title="Edit"
                        >
                          <Edit className="h-4 w-4 text-primary" />
                        </button>
                        <button
                          className="p-1 hover:bg-background rounded transition-colors"
                          onClick={() => deleteMcpServer(name)}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setEditingMcp({})}>
                <Plus className="h-4 w-4 mr-2" />
                Add MCP Server
              </Button>
              <Button variant="outline" size="sm" onClick={() => openMcpConfig('user')}>
                <FolderOpen className="h-4 w-4 mr-2" />
                User MCP Config
              </Button>
              <Button variant="outline" size="sm" onClick={() => openMcpConfig('workspace')}>
                <FolderOpen className="h-4 w-4 mr-2" />
                Workspace MCP Config
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Steering user rules */}
      <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardHeader className="pb-2 cursor-pointer hover:bg-muted/30 transition-colors rounded-t-lg" onClick={() => toggleSection('steering')}>
          <CardTitle className="text-base flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <FileText className="h-4 w-4 text-primary" />
              </div>
              <span>User Rules (Steering)</span>
              <span className="px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary">
                {steeringFiles.length} files
              </span>
            </div>
            {expandedSections.steering ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </CardTitle>
        </CardHeader>
        {expandedSections.steering && (
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Steering files define behavior rules and context for the AI assistant
            </p>

            {steeringFiles.length === 0 ? (
              <p className="text-sm text-muted-foreground">No Steering files</p>
            ) : (
              <div className="space-y-2">
                {steeringFiles.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 p-2 bg-muted rounded-md"
                  >
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-mono flex-1">{file}</span>
                    <button
                      className="p-1 hover:bg-background rounded transition-colors"
                      onClick={() => openSteeringFile(file)}
                      title="Edit internally"
                    >
                      <Edit className="h-4 w-4 text-primary" />
                    </button>
                    <button
                      className="p-1 hover:bg-background rounded transition-colors"
                      onClick={() => openSteeringFileExternal(file)}
                      title="Open externally"
                    >
                      <ExternalLink className="h-4 w-4 text-muted-foreground" />
                    </button>
                    <button
                      className="p-1 hover:bg-background rounded transition-colors"
                      onClick={() => deleteSteeringFile(file)}
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={createDefaultRules}>
                <Plus className="h-4 w-4 mr-2" />
                Create Rules File
              </Button>
              <Button variant="outline" size="sm" onClick={openSteeringFolder}>
                <FolderOpen className="h-4 w-4 mr-2" />
                Open Steering Directory
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Command settings */}
      <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardHeader className="pb-2 cursor-pointer hover:bg-muted/30 transition-colors rounded-t-lg" onClick={() => toggleSection('commands')}>
          <CardTitle className="text-base flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Terminal className="h-4 w-4 text-primary" />
              </div>
              <span>Command Configuration</span>
            </div>
            {expandedSections.commands ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </CardTitle>
        </CardHeader>
        {expandedSections.commands && (
          <CardContent className="space-y-6">
            {/* Trusted Commands */}
            <div className="p-4 rounded-lg bg-muted/50 border border-border">
              <div className="flex items-center gap-2 mb-3">
                <Shield className="h-4 w-4 text-primary" />
                <p className="font-medium">Trusted Commands</p>
              </div>
              <p className="text-sm text-muted-foreground mb-3">These commands will execute automatically without confirmation</p>
              <div className="space-y-2">
                {settings.trustedCommands.map((cmd, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <code className="flex-1 px-2 py-1 bg-muted rounded text-sm">{cmd}</code>
                    <Button variant="ghost" size="sm" onClick={() => removeTrustedCommand(index)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newTrustedCommand}
                    onChange={(e) => setNewTrustedCommand(e.target.value)}
                    placeholder="e.g.: npm *"
                    className="flex-1 px-3 py-1.5 rounded-md border bg-background text-sm"
                    onKeyDown={(e) => e.key === 'Enter' && addTrustedCommand()}
                  />
                  <Button variant="outline" size="sm" onClick={addTrustedCommand}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Command Denylist */}
            <div className="p-4 rounded-lg bg-destructive/5 border border-destructive/20">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="h-4 w-4 text-destructive" />
                <p className="font-medium text-destructive">Denied Commands</p>
              </div>
              <p className="text-sm text-muted-foreground mb-3">These commands always require manual confirmation</p>
              <div className="space-y-2">
                {settings.commandDenylist.map((cmd, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <code className="flex-1 px-2 py-1 bg-muted rounded text-sm">{cmd}</code>
                    <Button variant="ghost" size="sm" onClick={() => removeDenyCommand(index)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newDenyCommand}
                    onChange={(e) => setNewDenyCommand(e.target.value)}
                    placeholder="e.g.: rm -rf *"
                    className="flex-1 px-3 py-1.5 rounded-md border bg-background text-sm"
                    onKeyDown={(e) => e.key === 'Enter' && addDenyCommand()}
                  />
                  <Button variant="outline" size="sm" onClick={addDenyCommand}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={addDefaultDenyCommands}
                  className="mt-2"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Default Denied Commands
                </Button>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Steering file editor */}
      {editingFile && (
        <SteeringEditor
          filename={editingFile}
          onClose={() => setEditingFile(null)}
          onSaved={loadKiroSettings}
        />
      )}

      {/* MCP server editor */}
      {editingMcp && (
        <McpServerEditor
          serverName={editingMcp.name}
          server={editingMcp.server}
          onClose={() => setEditingMcp(null)}
          onSaved={loadKiroSettings}
        />
      )}
    </div>
  )
}
