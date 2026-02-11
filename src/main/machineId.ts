/**
 * Machine ID Management Module - Main Process
 * Supports Windows, macOS, Linux platforms
 */

import { exec, execSync } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { app, dialog } from 'electron'

const execAsync = promisify(exec)

export type OSType = 'windows' | 'macos' | 'linux' | 'unknown'

export interface MachineIdResult {
  success: boolean
  machineId?: string
  error?: string
  requiresAdmin?: boolean
}

/**
 * Get operating system type
 */
export function getOSType(): OSType {
  switch (process.platform) {
    case 'win32':
      return 'windows'
    case 'darwin':
      return 'macos'
    case 'linux':
      return 'linux'
    default:
      return 'unknown'
  }
}

/**
 * Generate random machine ID (GUID format)
 */
export function generateRandomMachineId(): string {
  // Generate UUID matching Windows MachineGuid format
  return crypto.randomUUID().toLowerCase()
}

/**
 * Get current machine ID
 */
export async function getCurrentMachineId(): Promise<MachineIdResult> {
  const osType = getOSType()

  try {
    switch (osType) {
      case 'windows':
        return await getWindowsMachineId()
      case 'macos':
        return await getMacOSMachineId()
      case 'linux':
        return await getLinuxMachineId()
      default:
        return { success: false, error: 'Unsupported operating system' }
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get machine ID'
    }
  }
}

/**
 * Set new machine ID
 */
export async function setMachineId(newMachineId: string): Promise<MachineIdResult> {
  const osType = getOSType()

  // Validate machine ID format
  if (!isValidMachineId(newMachineId)) {
    return { success: false, error: 'Invalid machine ID format' }
  }

  try {
    switch (osType) {
      case 'windows':
        return await setWindowsMachineId(newMachineId)
      case 'macos':
        return await setMacOSMachineId(newMachineId)
      case 'linux':
        return await setLinuxMachineId(newMachineId)
      default:
        return { success: false, error: 'Unsupported operating system' }
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Failed to set machine ID'
    // Check if admin privileges are required
    if (
      errorMsg.includes('Access is denied') ||
      errorMsg.includes('permission denied') ||
      errorMsg.includes('Operation not permitted') ||
      errorMsg.includes('EPERM') ||
      errorMsg.includes('EACCES')
    ) {
      return { success: false, error: 'Admin privileges required', requiresAdmin: true }
    }
    return { success: false, error: errorMsg }
  }
}

/**
 * Check if running with admin privileges
 */
export async function checkAdminPrivilege(): Promise<boolean> {
  const osType = getOSType()

  try {
    switch (osType) {
      case 'windows':
        // Try to write to system directory to detect privileges
        try {
          execSync('net session', { stdio: 'ignore' })
          return true
        } catch {
          return false
        }
      case 'macos':
      case 'linux':
        // Check if running as root
        return process.getuid?.() === 0
      default:
        return false
    }
  } catch {
    return false
  }
}

/**
 * Request to restart app with admin privileges
 */
export async function requestAdminRestart(): Promise<boolean> {
  const osType = getOSType()
  const appPath = app.getPath('exe')

  console.log('[MachineId] Requesting admin restart, appPath:', appPath)

  try {
    switch (osType) {
      case 'windows': {
        // Windows: Use cmd to launch PowerShell with Start-Process
        // This approach is more reliable, avoids parameter parsing issues
        const command = `powershell -NoProfile -Command "Start-Process -FilePath \\"${appPath.replace(/\\/g, '\\\\')}\\" -Verb RunAs"`
        console.log('[MachineId] Running command:', command)
        
        exec(command, { windowsHide: true }, (error) => {
          if (error) {
            console.error('[MachineId] Admin restart failed:', error)
          }
        })
        
        // Delay exit to ensure command has time to execute
        setTimeout(() => {
          console.log('[MachineId] Quitting app...')
          app.quit()
        }, 1000)
        return true
      }

      case 'macos': {
        // macOS: Use osascript to request admin privileges
        const escapedPath = appPath.replace(/'/g, "\\'")
        const script = `do shell script "open -n '${escapedPath}'" with administrator privileges`
        exec(`osascript -e '${script}'`, (error) => {
          if (error) {
            console.error('[MachineId] Admin restart failed:', error)
          }
        })
        setTimeout(() => app.quit(), 1000)
        return true
      }

      case 'linux': {
        // Linux: Try using pkexec or gksudo
        const sudoCommands = ['pkexec', 'gksudo', 'kdesudo']
        for (const cmd of sudoCommands) {
          try {
            execSync(`which ${cmd}`, { stdio: 'ignore' })
            exec(`${cmd} "${appPath}"`, (error) => {
              if (error) {
                console.error('[MachineId] Admin restart failed:', error)
              }
            })
            setTimeout(() => app.quit(), 1000)
            return true
          } catch {
            continue
          }
        }
        return false
      }

      default:
        return false
    }
  } catch (error) {
    console.error('Failed to request admin privileges:', error)
    return false
  }
}

/**
 * Validate machine ID format
 */
function isValidMachineId(machineId: string): boolean {
  // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  // Pure 32-character hex (Linux machine-id format)
  const hexRegex = /^[0-9a-f]{32}$/i
  return uuidRegex.test(machineId) || hexRegex.test(machineId)
}

// ==================== Windows ====================

async function getWindowsMachineId(): Promise<MachineIdResult> {
  try {
    const { stdout } = await execAsync(
      'reg query "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid'
    )
    const match = stdout.match(/MachineGuid\s+REG_SZ\s+([a-f0-9-]+)/i)
    if (match && match[1]) {
      return { success: true, machineId: match[1].toLowerCase() }
    }
    return { success: false, error: 'Unable to parse machine ID' }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get Windows machine ID'
    }
  }
}

async function setWindowsMachineId(newMachineId: string): Promise<MachineIdResult> {
  try {
    // Requires admin privileges
    await execAsync(
      `reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid /t REG_SZ /d "${newMachineId}" /f`
    )
    return { success: true, machineId: newMachineId }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : ''
    if (errorMsg.includes('Access is denied')) {
      return { success: false, error: 'Admin privileges required', requiresAdmin: true }
    }
    return { success: false, error: errorMsg || 'Failed to set Windows machine ID' }
  }
}

// ==================== macOS ====================

async function getMacOSMachineId(): Promise<MachineIdResult> {
  try {
    // Method 1: Use ioreg to get hardware UUID
    const { stdout } = await execAsync(
      "ioreg -rd1 -c IOPlatformExpertDevice | awk '/IOPlatformUUID/ { print $3 }'"
    )
    const machineId = stdout.trim().replace(/"/g, '').toLowerCase()
    if (machineId && isValidMachineId(machineId)) {
      return { success: true, machineId }
    }

    // Method 2: Read /var/db/SystemConfiguration/com.apple.SystemConfiguration.GenerationID.plist
    // This file can be modified
    return { success: false, error: 'Unable to get macOS machine ID' }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get macOS machine ID'
    }
  }
}

async function setMacOSMachineId(newMachineId: string): Promise<MachineIdResult> {
  // macOS hardware UUID cannot be directly modified
  // But we can modify application-level identifier
  // Using a workaround: create an override file
  const overridePath = path.join(app.getPath('userData'), 'machine-id-override')

  try {
    fs.writeFileSync(overridePath, newMachineId, 'utf-8')
    return { success: true, machineId: newMachineId }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to set macOS machine ID'
    }
  }
}

// ==================== Linux ====================

async function getLinuxMachineId(): Promise<MachineIdResult> {
  const paths = ['/etc/machine-id', '/var/lib/dbus/machine-id']

  for (const filePath of paths) {
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8').trim()
        if (content) {
          // Linux machine-id is 32-character hex, convert to UUID format
          const formattedId = formatAsUUID(content)
          return { success: true, machineId: formattedId }
        }
      }
    } catch {
      continue
    }
  }

  return { success: false, error: 'Unable to get Linux machine ID' }
}

async function setLinuxMachineId(newMachineId: string): Promise<MachineIdResult> {
  // Convert to 32-character hex format (remove hyphens)
  const rawId = newMachineId.replace(/-/g, '').toLowerCase()

  const paths = ['/etc/machine-id', '/var/lib/dbus/machine-id']

  for (const filePath of paths) {
    try {
      if (fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, rawId + '\n', 'utf-8')
        return { success: true, machineId: newMachineId }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : ''
      if (errorMsg.includes('EACCES') || errorMsg.includes('EPERM')) {
        return { success: false, error: 'Admin privileges required', requiresAdmin: true }
      }
    }
  }

  return { success: false, error: 'Failed to set Linux machine ID' }
}

/**
 * Convert 32-character hex to UUID format
 */
function formatAsUUID(hex: string): string {
  const clean = hex.replace(/-/g, '').toLowerCase()
  if (clean.length !== 32) return clean
  return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20)}`
}

/**
 * Backup machine ID to file
 */
export async function backupMachineIdToFile(
  machineId: string,
  filePath: string
): Promise<boolean> {
  try {
    const backupData = {
      machineId,
      backupTime: Date.now(),
      osType: getOSType(),
      appVersion: app.getVersion()
    }
    fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2), 'utf-8')
    return true
  } catch (error) {
    console.error('Failed to backup machine ID:', error)
    return false
  }
}

/**
 * Restore machine ID from file
 */
export async function restoreMachineIdFromFile(filePath: string): Promise<MachineIdResult> {
  try {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'Backup file does not exist' }
    }
    const content = fs.readFileSync(filePath, 'utf-8')
    const data = JSON.parse(content)
    if (!data.machineId || !isValidMachineId(data.machineId)) {
      return { success: false, error: 'Invalid backup file format' }
    }
    return { success: true, machineId: data.machineId }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to read backup file'
    }
  }
}

/**
 * Show admin privileges required dialog
 */
export async function showAdminRequiredDialog(): Promise<boolean> {
  const result = await dialog.showMessageBox({
    type: 'warning',
    title: 'Admin Privileges Required',
    message: 'Modifying machine ID requires admin privileges',
    detail: 'Would you like to restart the application with admin privileges?',
    buttons: ['Cancel', 'Restart as Admin'],
    defaultId: 1,
    cancelId: 0
  })
  return result.response === 1
}
