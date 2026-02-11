// ============================================
// Multi-Account Manager Type Definitions
// ============================================

export type IdpType = 'Google' | 'Github' | 'BuilderId' | 'AWSIdC' | 'Internal'

export type SubscriptionType = 'Free' | 'Pro' | 'Pro_Plus' | 'Enterprise' | 'Teams'

export type AccountStatus = 'active' | 'expired' | 'error' | 'refreshing' | 'unknown'

/**
 * Account credentials
 */
export interface AccountCredentials {
  accessToken: string
  csrfToken: string
  refreshToken?: string
  clientId?: string      // OIDC client ID (for token refresh)
  clientSecret?: string  // OIDC client secret
  region?: string        // AWS region, default us-east-1
  expiresAt: number      // Timestamp
  authMethod?: 'IdC' | 'social'  // Auth method: IdC (BuilderId) or social (GitHub/Google)
  provider?: 'BuilderId' | 'Github' | 'Google'  // Identity provider
}

/**
 * Bonus usage info
 */
export interface BonusUsage {
  code: string
  name: string
  current: number
  limit: number
  expiresAt?: string
}

/**
 * Account usage info
 */
export interface AccountUsage {
  current: number
  limit: number
  percentUsed: number
  lastUpdated: number
  // Detailed quota breakdown
  baseLimit?: number      // Base quota
  baseCurrent?: number    // Base used
  freeTrialLimit?: number // Trial quota
  freeTrialCurrent?: number
  freeTrialExpiry?: string
  bonuses?: BonusUsage[]  // Bonus quota list
  nextResetDate?: string  // Reset date
  resourceDetail?: ResourceDetail // Resource details
}

/**
 * Account subscription info
 */
export interface AccountSubscription {
  type: SubscriptionType
  title?: string // Original subscription title, e.g. "KIRO PRO+"
  rawType?: string // Original subscription type, e.g. "Q_DEVELOPER_STANDALONE_PRO_PLUS"
  expiresAt?: number // Subscription expiry timestamp
  daysRemaining?: number
  upgradeCapability?: string // Upgrade capability
  overageCapability?: string // Overage capability
  managementTarget?: string // Subscription management target
}

/**
 * Resource usage details
 */
export interface ResourceDetail {
  resourceType?: string // CREDIT
  displayName?: string // Credit
  displayNamePlural?: string // Credits
  currency?: string // USD
  unit?: string // INVOCATIONS
  overageRate?: number // 0.04
  overageCap?: number // 10000
  overageEnabled?: boolean
}

/**
 * Account tag
 */
export interface AccountTag {
  id: string
  name: string
  color: string // hex color
}

/**
 * Account entity
 */
export interface Account {
  // Basic info
  id: string
  email: string
  nickname?: string // Custom alias
  idp: IdpType
  userId?: string
  visitorId?: string

  // Auth info
  credentials: AccountCredentials

  // Subscription info
  subscription: AccountSubscription

  // Usage
  usage: AccountUsage

  // Group and tags
  groupId?: string
  tags: string[] // tag ids

  // Status
  status: AccountStatus
  lastError?: string
  isActive: boolean // Is current active account

  // Timestamps
  createdAt: number
  lastUsedAt: number
  lastCheckedAt?: number // Last status check time
}

/**
 * Account group
 */
export interface AccountGroup {
  id: string
  name: string
  description?: string
  color?: string
  order: number
  createdAt: number
}

/**
 * Filter conditions
 */
export interface AccountFilter {
  search?: string // Search keyword (email/alias)
  subscriptionTypes?: SubscriptionType[]
  statuses?: AccountStatus[]
  idps?: IdpType[]
  groupIds?: string[]
  tagIds?: string[]
  usageMin?: number // Usage percentage
  usageMax?: number
  daysRemainingMin?: number
  daysRemainingMax?: number
}

/**
 * Sort options
 */
export type SortField =
  | 'email'
  | 'nickname'
  | 'subscription'
  | 'usage'
  | 'daysRemaining'
  | 'lastUsedAt'
  | 'createdAt'
  | 'status'

export type SortOrder = 'asc' | 'desc'

export interface AccountSort {
  field: SortField
  order: SortOrder
}

/**
 * Import/Export format
 */
export interface AccountExportData {
  version: string
  exportedAt: number
  accounts: Omit<Account, 'isActive'>[]
  groups: AccountGroup[]
  tags: AccountTag[]
}

/**
 * Account import item (simplified format)
 */
export interface AccountImportItem {
  email: string
  refreshToken: string
  accessToken?: string
  csrfToken?: string
  clientId?: string
  clientSecret?: string
  region?: string
  idp?: IdpType | string
  nickname?: string
  groupId?: string
  tags?: string[]
}

/**
 * Batch operation result
 */
export interface BatchOperationResult {
  success: number
  failed: number
  errors: { id: string; error: string }[]
}

/**
 * Account statistics
 */
export interface AccountStats {
  total: number
  byStatus: Record<AccountStatus, number>
  bySubscription: Record<SubscriptionType, number>
  byIdp: Record<IdpType, number>
  activeCount: number
  expiringSoonCount: number // Expiring within 7 days
}
