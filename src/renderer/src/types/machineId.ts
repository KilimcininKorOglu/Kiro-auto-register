/**
 * Machine ID management type definitions
 */

// Operating system type
export type OSType = 'windows' | 'macos' | 'linux' | 'unknown'

// Machine ID configuration
export interface MachineIdConfig {
  // Auto-switch machine ID (auto-change when switching accounts)
  autoSwitchOnAccountChange: boolean
  // Bind machine ID to account (each account has unique machine ID)
  bindMachineIdToAccount: boolean
  // Use bound unique machine ID (otherwise generate random)
  useBindedMachineId: boolean
}

// Machine ID state
export interface MachineIdState {
  // Current system machine ID
  currentMachineId: string
  // Backed up original machine ID
  originalMachineId: string | null
  // Original machine ID backup time
  originalBackupTime: number | null
  // Operating system type
  osType: OSType
  // Has admin privileges
  hasAdminPrivilege: boolean
  // Is operation in progress
  isOperating: boolean
  // Last operation error
  lastError: string | null
  // Configuration
  config: MachineIdConfig
  // Account-bound machine ID mapping (accountId -> machineId)
  accountMachineIds: Record<string, string>
  // Machine ID history
  history: MachineIdHistoryEntry[]
}

// Machine ID history entry
export interface MachineIdHistoryEntry {
  id: string
  machineId: string
  timestamp: number
  action: 'initial' | 'manual' | 'auto_switch' | 'restore' | 'bind'
  accountId?: string
  accountEmail?: string
}

// Machine ID operation result
export interface MachineIdResult {
  success: boolean
  machineId?: string
  error?: string
  requiresAdmin?: boolean
}

// Main process API interface
export interface MachineIdAPI {
  // Get current machine ID
  getCurrentMachineId: () => Promise<MachineIdResult>
  // Set new machine ID
  setMachineId: (newMachineId: string) => Promise<MachineIdResult>
  // Generate random machine ID
  generateRandomMachineId: () => string
  // Check admin privileges
  checkAdminPrivilege: () => Promise<boolean>
  // Request admin restart
  requestAdminRestart: () => Promise<boolean>
  // Get operating system type
  getOSType: () => OSType
  // Backup machine ID to file
  backupMachineIdToFile: (machineId: string, path: string) => Promise<boolean>
  // Restore machine ID from file
  restoreMachineIdFromFile: (path: string) => Promise<MachineIdResult>
}
