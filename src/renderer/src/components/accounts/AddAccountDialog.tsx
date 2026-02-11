import { useState, useEffect, useRef } from 'react'
import { Button, Card, CardContent, CardHeader, CardTitle } from '../ui'
import { useAccountsStore } from '@/store/accounts'
import type { SubscriptionType } from '@/types/account'
import { X, Loader2, Download, Copy, Check, ExternalLink, Info } from 'lucide-react'

interface AddAccountDialogProps {
  isOpen: boolean
  onClose: () => void
}

interface BonusData {
  code: string
  name: string
  current: number
  limit: number
  expiresAt?: string
}

interface VerifiedData {
  email: string
  userId: string
  accessToken: string
  refreshToken: string
  expiresIn?: number
  subscriptionType: string
  subscriptionTitle: string
  subscription?: {
    managementTarget?: string
    upgradeCapability?: string
    overageCapability?: string
  }
  usage: { 
    current: number
    limit: number
    baseLimit?: number
    baseCurrent?: number
    freeTrialLimit?: number
    freeTrialCurrent?: number
    freeTrialExpiry?: string
    bonuses?: BonusData[]
    nextResetDate?: string
    resourceDetail?: {
      displayName?: string
      displayNamePlural?: string
      resourceType?: string
      currency?: string
      unit?: string
      overageRate?: number
      overageCap?: number
      overageEnabled?: boolean
    }
  }
  daysRemaining?: number
  expiresAt?: number
}

type ImportMode = 'oidc' | 'sso' | 'login'
type LoginType = 'builderid' | 'google' | 'github'

export function AddAccountDialog({ isOpen, onClose }: AddAccountDialogProps): React.ReactNode {
  const { addAccount, accounts, batchImportConcurrency } = useAccountsStore()

  // Check if account already exists
  const isAccountExists = (email: string, userId: string): boolean => {
    return Array.from(accounts.values()).some(
      acc => acc.email === email || acc.userId === userId
    )
  }

  // Import mode
  const [importMode, setImportMode] = useState<ImportMode>('login')

  // OIDC credential input
  const [refreshToken, setRefreshToken] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [region, setRegion] = useState('us-east-1')
  const [authMethod, setAuthMethod] = useState<'IdC' | 'social'>('IdC')
  const [provider, setProvider] = useState('BuilderId')  // 'BuilderId', 'Github', 'Google'

  // SSO Token import
  const [ssoToken, setSsoToken] = useState('')
  const [batchImportResult, setBatchImportResult] = useState<{ total: number; success: number; failed: number; errors: string[] } | null>(null)

  // OIDC batch import
  const [oidcImportMode, setOidcImportMode] = useState<'single' | 'batch'>('single')
  const [oidcBatchData, setOidcBatchData] = useState('')
  const [oidcBatchImportResult, setOidcBatchImportResult] = useState<{ total: number; success: number; failed: number; errors: string[] } | null>(null)

  // Verified data (kept for conditional rendering)
  const [verifiedData, setVerifiedData] = useState<VerifiedData | null>(null)

  // State
  const [isVerifying, setIsVerifying] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Login related state
  const [loginType, setLoginType] = useState<LoginType>('builderid')
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [builderIdLoginData, setBuilderIdLoginData] = useState<{
    userCode: string
    verificationUri: string
    expiresIn: number
    interval: number
  } | null>(null)
  const [copied, setCopied] = useState(false)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Cleanup polling
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
    }
  }, [])

  // Listen for Social Auth callback
  useEffect(() => {
    if (!isLoggingIn || loginType === 'builderid') return

    const unsubscribe = window.api.onSocialAuthCallback(async (data) => {
      console.log('[AddAccountDialog] Social auth callback:', data)
      
      if (data.error) {
        setError(`Login failed: ${data.error}`)
        setIsLoggingIn(false)
        return
      }

      if (data.code && data.state) {
        try {
          const result = await window.api.exchangeSocialToken(data.code, data.state)
          if (result.success) {
            await handleLoginSuccess({
              accessToken: result.accessToken!,
              refreshToken: result.refreshToken!,
              authMethod: 'social',
              provider: result.provider
            })
          } else {
            setError(result.error || 'Token exchange failed')
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Login failed')
        } finally {
          setIsLoggingIn(false)
        }
      }
    })

    return () => unsubscribe()
  }, [isLoggingIn, loginType])

  // Handle login success
  const handleLoginSuccess = async (tokenData: {
    accessToken: string
    refreshToken: string
    clientId?: string
    clientSecret?: string
    region?: string
    authMethod?: string
    provider?: string
  }) => {
    console.log('[AddAccountDialog] Login successful, verifying credentials...')
    
    try {
      // Verify credentials and get account info
      const result = await window.api.verifyAccountCredentials({
        refreshToken: tokenData.refreshToken,
        clientId: tokenData.clientId || '',
        clientSecret: tokenData.clientSecret || '',
        region: tokenData.region || 'us-east-1',
        authMethod: tokenData.authMethod,
        provider: tokenData.provider
      })

      if (result.success && result.data) {
        const { email, userId } = result.data
        
        // Check if account already exists
        if (isAccountExists(email, userId)) {
          setError('This account already exists, no need to add again')
          return
        }
        
        // Add account
        const now = Date.now()
        addAccount({
          email,
          userId,
          nickname: email ? email.split('@')[0] : undefined,
          idp: (tokenData.provider || 'BuilderId') as 'BuilderId' | 'Google' | 'Github',
          credentials: {
            accessToken: result.data.accessToken,
            csrfToken: '',
            refreshToken: result.data.refreshToken,
            clientId: tokenData.clientId || '',
            clientSecret: tokenData.clientSecret || '',
            region: tokenData.region || 'us-east-1',
            expiresAt: result.data.expiresIn ? now + result.data.expiresIn * 1000 : now + 3600 * 1000,
            authMethod: tokenData.authMethod as 'IdC' | 'social',
            provider: (tokenData.provider || 'BuilderId') as 'BuilderId' | 'Github' | 'Google'
          },
          subscription: {
            type: result.data.subscriptionType as SubscriptionType,
            title: result.data.subscriptionTitle,
            rawType: result.data.subscription?.rawType,
            daysRemaining: result.data.daysRemaining,
            expiresAt: result.data.expiresAt,
            managementTarget: result.data.subscription?.managementTarget,
            upgradeCapability: result.data.subscription?.upgradeCapability,
            overageCapability: result.data.subscription?.overageCapability
          },
          usage: {
            current: result.data.usage.current,
            limit: result.data.usage.limit,
            percentUsed: result.data.usage.limit > 0 
              ? result.data.usage.current / result.data.usage.limit 
              : 0,
            lastUpdated: now,
            baseLimit: result.data.usage.baseLimit,
            baseCurrent: result.data.usage.baseCurrent,
            freeTrialLimit: result.data.usage.freeTrialLimit,
            freeTrialCurrent: result.data.usage.freeTrialCurrent,
            freeTrialExpiry: result.data.usage.freeTrialExpiry,
            bonuses: result.data.usage.bonuses,
            nextResetDate: result.data.usage.nextResetDate,
            resourceDetail: result.data.usage.resourceDetail
          },
          groupId: undefined,
          tags: [],
          status: 'active',
          lastUsedAt: now
        })

        resetForm()
        onClose()
      } else {
        setError(result.error || 'Verification failed')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add account')
    }
  }

  // Start Builder ID login
  const handleStartBuilderIdLogin = async () => {
    setIsLoggingIn(true)
    setError(null)
    setBuilderIdLoginData(null)

    try {
      const result = await window.api.startBuilderIdLogin(region)
      
      if (result.success && result.userCode && result.verificationUri) {
        setBuilderIdLoginData({
          userCode: result.userCode,
          verificationUri: result.verificationUri,
          expiresIn: result.expiresIn || 600,
          interval: result.interval || 5
        })

        // Open browser
        window.api.openExternal(result.verificationUri)

        // Start polling
        startPolling(result.interval || 5)
      } else {
        setError(result.error || 'Failed to start login')
        setIsLoggingIn(false)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start login')
      setIsLoggingIn(false)
    }
  }

  // Start polling Builder ID authorization
  const startPolling = (interval: number) => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
    }

    pollIntervalRef.current = setInterval(async () => {
      try {
        const result = await window.api.pollBuilderIdAuth(region)
        
        if (!result.success) {
          setError(result.error || 'Authorization failed')
          setIsLoggingIn(false)
          setBuilderIdLoginData(null)
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
          }
          return
        }

        if (result.completed) {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
          }
          
          await handleLoginSuccess({
            accessToken: result.accessToken!,
            refreshToken: result.refreshToken!,
            clientId: result.clientId,
            clientSecret: result.clientSecret,
            region: result.region,
            authMethod: 'IdC',
            provider: 'BuilderId'
          })
          
          setIsLoggingIn(false)
          setBuilderIdLoginData(null)
        }
        // If pending or slow_down, continue polling
      } catch (e) {
        console.error('[AddAccountDialog] Poll error:', e)
      }
    }, interval * 1000)
  }

  // Cancel login
  const handleCancelLogin = async () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }

    if (loginType === 'builderid') {
      await window.api.cancelBuilderIdLogin()
    } else {
      await window.api.cancelSocialLogin()
    }

    setIsLoggingIn(false)
    setBuilderIdLoginData(null)
    setError(null)
  }

  // Start Social Auth login (Google/GitHub)
  const handleStartSocialLogin = async (socialProvider: 'Google' | 'Github') => {
    setIsLoggingIn(true)
    setError(null)

    try {
      const result = await window.api.startSocialLogin(socialProvider)
      
      if (!result.success) {
        setError(result.error || 'Failed to start login')
        setIsLoggingIn(false)
      }
      // Wait for callback on success
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start login')
      setIsLoggingIn(false)
    }
  }

  // Copy user_code
  const handleCopyUserCode = async () => {
    if (builderIdLoginData?.userCode) {
      await navigator.clipboard.writeText(builderIdLoginData.userCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // Import from local config
  const handleImportFromLocal = async () => {
    try {
      const result = await window.api.loadKiroCredentials()
      if (result.success && result.data) {
        setRefreshToken(result.data.refreshToken)
        setClientId(result.data.clientId)
        setClientSecret(result.data.clientSecret)
        setRegion(result.data.region)
        setAuthMethod(result.data.authMethod as 'IdC' | 'social' || 'IdC')
        setProvider(result.data.provider || 'BuilderId')
        setError(null)
      } else {
        setError(result.error || 'Import failed')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
    }
  }

  // Import from SSO Token and add account (supports batch)
  const handleSsoImport = async () => {
    if (!ssoToken.trim()) {
      setError('Please enter the x-amz-sso_authn value')
      return
    }

    // Parse multiple tokens (one per line)
    const tokens = ssoToken
      .split('\n')
      .map(t => t.trim())
      .filter(t => t.length > 0)

    if (tokens.length === 0) {
      setError('Please enter at least one token')
      return
    }

    setIsVerifying(true)
    setError(null)
    setBatchImportResult(null)

    const importResult = { total: tokens.length, success: 0, failed: 0, errors: [] as string[], failedIndices: [] as number[] }

    // Single token import function
    const importSingleToken = async (token: string, index: number): Promise<void> => {
      try {
        const result = await window.api.importFromSsoToken(token, region)
        
        if (result.success && result.data) {
          const { email, userId } = result.data
          
          // Check if account already exists (also remove from input if exists)
          if (email && userId && isAccountExists(email, userId)) {
            importResult.errors.push(`#${index + 1}: ${email} already exists`)
            return
          }
          
          // Add account
          const now = Date.now()
          addAccount({
            email: email || '',
            userId: userId || '',
            nickname: email ? email.split('@')[0] : undefined,
            idp: 'BuilderId',
            credentials: {
              accessToken: result.data.accessToken,
              csrfToken: '',
              refreshToken: result.data.refreshToken,
              clientId: result.data.clientId,
              clientSecret: result.data.clientSecret,
              region: result.data.region,
              expiresAt: result.data.expiresIn ? now + result.data.expiresIn * 1000 : now + 3600 * 1000
            },
            subscription: {
              type: (result.data.subscriptionType || 'Free') as SubscriptionType,
              title: result.data.subscriptionTitle || 'KIRO',
              daysRemaining: result.data.daysRemaining,
              managementTarget: result.data.subscription?.managementTarget,
              upgradeCapability: result.data.subscription?.upgradeCapability,
              overageCapability: result.data.subscription?.overageCapability
            },
            usage: {
              current: result.data.usage?.current || 0,
              limit: result.data.usage?.limit || 0,
              percentUsed: (result.data.usage?.limit || 0) > 0 
                ? (result.data.usage?.current || 0) / (result.data.usage?.limit || 1) 
                : 0,
              lastUpdated: now,
              baseLimit: result.data.usage?.baseLimit,
              baseCurrent: result.data.usage?.baseCurrent,
              freeTrialLimit: result.data.usage?.freeTrialLimit,
              freeTrialCurrent: result.data.usage?.freeTrialCurrent,
              freeTrialExpiry: result.data.usage?.freeTrialExpiry,
              bonuses: result.data.usage?.bonuses,
              nextResetDate: result.data.usage?.nextResetDate,
              resourceDetail: result.data.usage?.resourceDetail
            },
            groupId: undefined,
            tags: [],
            status: 'active',
            lastUsedAt: now
          })
          
          importResult.success++
        } else {
          importResult.failed++
          importResult.failedIndices.push(index)
          importResult.errors.push(`#${index + 1}: ${result.error?.message || 'Import failed'}`)
        }
      } catch (e) {
        importResult.failed++
        importResult.failedIndices.push(index)
        importResult.errors.push(`#${index + 1}: ${e instanceof Error ? e.message : 'Import failed'}`)
      }
    }

    try {
      // Concurrency control: use configured concurrency to avoid API rate limiting
      const BATCH_SIZE = batchImportConcurrency
      for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
        const batch = tokens.slice(i, i + BATCH_SIZE)
        await Promise.allSettled(
          batch.map((token, batchIndex) => importSingleToken(token, i + batchIndex))
        )
        // Add short delay between batches
        if (i + BATCH_SIZE < tokens.length) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      }
      
      setBatchImportResult(importResult)
      
      // If all successful, close dialog
      if (importResult.failed === 0) {
        resetForm()
        onClose()
      } else {
        // Keep failed tokens in input
        const failedTokens = importResult.failedIndices.map(i => tokens[i])
        if (failedTokens.length > 0) {
          setSsoToken(failedTokens.join('\n'))
        }
        if (importResult.success > 0) {
          setError(`Successfully imported ${importResult.success}, failed ${importResult.failed}`)
        } else {
          setError(`All imports failed (${importResult.failed})`)
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'SSO import failed')
    } finally {
      setIsVerifying(false)
    }
  }

  // OIDC batch import
  const handleOidcBatchAdd = async () => {
    if (!oidcBatchData.trim()) {
      setError('Please enter credential data')
      return
    }

    // Parse JSON data
    let credentials: Array<{
      refreshToken: string
      clientId?: string
      clientSecret?: string
      region?: string
      authMethod?: 'IdC' | 'social'
      provider?: string
    }>

    try {
      const parsed = JSON.parse(oidcBatchData.trim())
      credentials = Array.isArray(parsed) ? parsed : [parsed]
    } catch {
      setError('JSON format error, please check input')
      return
    }

    if (credentials.length === 0) {
      setError('Please enter at least one credential')
      return
    }

    setIsSubmitting(true)
    setError(null)
    setOidcBatchImportResult(null)

    const importResult = { total: credentials.length, success: 0, failed: 0, errors: [] as string[], failedIndices: [] as number[] }

    // Single credential import function
    const importSingleCredential = async (cred: typeof credentials[0], index: number): Promise<void> => {
      try {
        if (!cred.refreshToken) {
          importResult.failed++
          importResult.failedIndices.push(index)
          importResult.errors.push(`#${index + 1}: Missing refreshToken`)
          return
        }

        // Auto-determine authMethod based on provider
        const credProvider = cred.provider || 'BuilderId'
        const credAuthMethod = cred.authMethod || (credProvider === 'BuilderId' ? 'IdC' : 'social')

        const result = await window.api.verifyAccountCredentials({
          refreshToken: cred.refreshToken,
          clientId: cred.clientId || '',
          clientSecret: cred.clientSecret || '',
          region: cred.region || 'us-east-1',
          authMethod: credAuthMethod,
          provider: credProvider
        })

        if (result.success && result.data) {
          const { email, userId } = result.data
          
          if (isAccountExists(email, userId)) {
            // Existing accounts don't count as failed, also remove from input
            importResult.errors.push(`#${index + 1}: ${email} already exists`)
            return
          }
          
          // Determine idp and authMethod based on provider
          const provider = (cred.provider || 'BuilderId') as 'BuilderId' | 'Github' | 'Google'
          const idpMap: Record<string, 'BuilderId' | 'Github' | 'Google'> = {
            'BuilderId': 'BuilderId',
            'Github': 'Github',
            'Google': 'Google'
          }
          const idp = idpMap[provider] || 'BuilderId'
          // GitHub and Google use social auth method
          const authMethod = cred.authMethod || (provider === 'BuilderId' ? 'IdC' : 'social')
          
          const now = Date.now()
          addAccount({
            email,
            userId,
            nickname: email ? email.split('@')[0] : undefined,
            idp,
            credentials: {
              accessToken: result.data.accessToken,
              csrfToken: '',
              refreshToken: result.data.refreshToken,
              clientId: cred.clientId || '',
              clientSecret: cred.clientSecret || '',
              region: cred.region || 'us-east-1',
              expiresAt: result.data.expiresIn ? now + result.data.expiresIn * 1000 : now + 3600 * 1000,
              authMethod,
              provider
            },
            subscription: {
              type: result.data.subscriptionType as SubscriptionType,
              title: result.data.subscriptionTitle,
              daysRemaining: result.data.daysRemaining,
              expiresAt: result.data.expiresAt,
              managementTarget: result.data.subscription?.managementTarget,
              upgradeCapability: result.data.subscription?.upgradeCapability,
              overageCapability: result.data.subscription?.overageCapability
            },
            usage: {
              current: result.data.usage.current,
              limit: result.data.usage.limit,
              percentUsed: result.data.usage.limit > 0 
                ? result.data.usage.current / result.data.usage.limit 
                : 0,
              lastUpdated: now,
              baseLimit: result.data.usage.baseLimit,
              baseCurrent: result.data.usage.baseCurrent,
              freeTrialLimit: result.data.usage.freeTrialLimit,
              freeTrialCurrent: result.data.usage.freeTrialCurrent,
              freeTrialExpiry: result.data.usage.freeTrialExpiry,
              bonuses: result.data.usage.bonuses,
              nextResetDate: result.data.usage.nextResetDate,
              resourceDetail: result.data.usage.resourceDetail
            },
            groupId: undefined,
            tags: [],
            status: 'active',
            lastUsedAt: now
          })
          
          importResult.success++
        } else {
          importResult.failed++
          importResult.failedIndices.push(index)
          const err = result.error as { message?: string } | string | undefined
          const errorMsg = typeof err === 'object' ? (err?.message || 'Verification failed') : (err || 'Verification failed')
          importResult.errors.push(`#${index + 1}: ${errorMsg}`)
        }
      } catch (e) {
        importResult.failed++
        importResult.failedIndices.push(index)
        importResult.errors.push(`#${index + 1}: ${e instanceof Error ? e.message : 'Import failed'}`)
      }
    }

    try {
      // Concurrency control: use configured concurrency to avoid API rate limiting
      const BATCH_SIZE = batchImportConcurrency
      for (let i = 0; i < credentials.length; i += BATCH_SIZE) {
        const batch = credentials.slice(i, i + BATCH_SIZE)
        await Promise.allSettled(
          batch.map((cred, batchIndex) => importSingleCredential(cred, i + batchIndex))
        )
        // Add short delay between batches to further avoid rate limiting
        if (i + BATCH_SIZE < credentials.length) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      }
      
      setOidcBatchImportResult(importResult)
      
      if (importResult.failed === 0) {
        resetForm()
        onClose()
      } else {
        // Keep failed credentials in input
        const failedCredentials = importResult.failedIndices.map(i => credentials[i])
        if (failedCredentials.length > 0) {
          setOidcBatchData(JSON.stringify(failedCredentials, null, 2))
        }
        if (importResult.success > 0) {
          setError(`Successfully imported ${importResult.success}, failed ${importResult.failed}`)
        } else {
          setError(`All imports failed (${importResult.failed})`)
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'OIDC batch import failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  // OIDC credential add account (verify and add)
  const handleOidcAdd = async () => {
    if (!refreshToken) {
      setError('Please fill in Refresh Token')
      return
    }
    // Social login doesn't need clientId and clientSecret
    if (authMethod !== 'social' && (!clientId || !clientSecret)) {
      setError('Please fill in Client ID and Client Secret')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const result = await window.api.verifyAccountCredentials({
        refreshToken,
        clientId,
        clientSecret,
        region,
        authMethod,
        provider
      })

      if (result.success && result.data) {
        const { email, userId } = result.data
        
        // Check if account already exists
        if (isAccountExists(email, userId)) {
          setError('This account already exists, no need to add again')
          return
        }
        
        // Add account directly
        const now = Date.now()
        addAccount({
          email,
          userId,
          nickname: email ? email.split('@')[0] : undefined,
          idp: 'BuilderId',
          credentials: {
            accessToken: result.data.accessToken,
            csrfToken: '',
            refreshToken: result.data.refreshToken,
            clientId,
            clientSecret,
            region,
            expiresAt: result.data.expiresIn ? now + result.data.expiresIn * 1000 : now + 3600 * 1000,
            authMethod,
            provider: (provider || 'BuilderId') as 'BuilderId' | 'Github' | 'Google'
          },
          subscription: {
            type: result.data.subscriptionType as SubscriptionType,
            title: result.data.subscriptionTitle,
            daysRemaining: result.data.daysRemaining,
            expiresAt: result.data.expiresAt,
            managementTarget: result.data.subscription?.managementTarget,
            upgradeCapability: result.data.subscription?.upgradeCapability,
            overageCapability: result.data.subscription?.overageCapability
          },
          usage: {
            current: result.data.usage.current,
            limit: result.data.usage.limit,
            percentUsed: result.data.usage.limit > 0 
              ? result.data.usage.current / result.data.usage.limit 
              : 0,
            lastUpdated: now,
            baseLimit: result.data.usage.baseLimit,
            baseCurrent: result.data.usage.baseCurrent,
            freeTrialLimit: result.data.usage.freeTrialLimit,
            freeTrialCurrent: result.data.usage.freeTrialCurrent,
            freeTrialExpiry: result.data.usage.freeTrialExpiry,
            bonuses: result.data.usage.bonuses,
            nextResetDate: result.data.usage.nextResetDate,
            resourceDetail: result.data.usage.resourceDetail
          },
          groupId: undefined,
          tags: [],
          status: 'active',
          lastUsedAt: now
        })

        resetForm()
        onClose()
      } else {
        setError(result.error || 'Verification failed')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Add failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  const resetForm = () => {
    setImportMode('login')
    setRefreshToken('')
    setClientId('')
    setClientSecret('')
    setRegion('us-east-1')
    setAuthMethod('IdC')
    setProvider('BuilderId')
    setSsoToken('')
    setVerifiedData(null)
    setError(null)
    // Clean up login state
    setLoginType('builderid')
    setIsLoggingIn(false)
    setBuilderIdLoginData(null)
    setCopied(false)
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <Card className="relative w-full max-w-lg max-h-[90vh] overflow-auto z-10">
        <CardHeader className="pb-4 border-b">
          <div className="flex flex-row items-center justify-between">
            <CardTitle className="text-xl font-bold">Add Account</CardTitle>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-muted" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mt-1">Choose a method to add your Kiro account</p>
        </CardHeader>

        <CardContent className="space-y-6 pt-6">
          {/* Import mode switch */}
          <div className="grid grid-cols-3 gap-1 p-1 bg-muted/50 rounded-xl border">
            <button
              className={`py-2 px-3 text-sm rounded-lg transition-all duration-200 font-medium ${
                importMode === 'login' 
                  ? 'bg-background text-foreground shadow-sm ring-1 ring-black/5' 
                  : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
              }`}
              onClick={() => { setImportMode('login'); setError(null) }}
              disabled={!!verifiedData || isLoggingIn}
            >
              Online Login
            </button>
            <button
              className={`py-2 px-3 text-sm rounded-lg transition-all duration-200 font-medium ${
                importMode === 'oidc' 
                  ? 'bg-background text-foreground shadow-sm ring-1 ring-black/5' 
                  : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
              }`}
              onClick={() => { setImportMode('oidc'); setError(null) }}
              disabled={!!verifiedData || isLoggingIn}
            >
              OIDC Credentials
            </button>
            <button
              className={`py-2 px-3 text-sm rounded-lg transition-all duration-200 font-medium ${
                importMode === 'sso' 
                  ? 'bg-background text-foreground shadow-sm ring-1 ring-black/5' 
                  : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
              }`}
              onClick={() => { setImportMode('sso'); setError(null) }}
              disabled={!!verifiedData || isLoggingIn}
            >
              SSO Token
            </button>
          </div>

          {/* Login mode */}
          {importMode === 'login' && !verifiedData && (
            <div className="space-y-4">
              {/* Logging in state - Builder ID */}
              {isLoggingIn && builderIdLoginData && (
                <div className="space-y-4">
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-center">
                    <p className="text-sm text-blue-700 dark:text-blue-300 mb-2">
                      Please complete login in browser and enter the following code:
                    </p>
                    <div className="flex items-center justify-center gap-2">
                      <code className="text-2xl font-bold tracking-widest bg-white dark:bg-gray-800 px-4 py-2 rounded border">
                        {builderIdLoginData.userCode}
                      </code>
                      <Button 
                        variant="outline" 
                        size="icon"
                        onClick={handleCopyUserCode}
                        title="Copy code"
                      >
                        {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                    <div className="mt-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Waiting for authorization...
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      className="flex-1"
                      onClick={() => window.api.openExternal(builderIdLoginData.verificationUri)}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Reopen Browser
                    </Button>
                    <Button 
                      variant="destructive" 
                      className="flex-1"
                      onClick={handleCancelLogin}
                    >
                      Cancel Login
                    </Button>
                  </div>
                </div>
              )}

              {/* Logging in state - Social Auth */}
              {isLoggingIn && !builderIdLoginData && (
                <div className="space-y-4">
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-blue-500" />
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      Please complete login in browser...
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Will return automatically after login
                    </p>
                  </div>
                  
                  <Button 
                    variant="destructive" 
                    className="w-full"
                    onClick={handleCancelLogin}
                  >
                    Cancel Login
                  </Button>
                </div>
              )}

              {/* Not logged in state - Show login options */}
              {!isLoggingIn && (
                <div className="space-y-4 py-2">
                  <div className="text-center mb-6">
                    <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Check className="w-6 h-6 text-primary" />
                    </div>
                    <h3 className="text-lg font-semibold">Choose Login Method</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Multiple quick login methods supported
                    </p>
                  </div>
                  
                  <div className="space-y-3 px-2">
                    {/* Google */}
                    <button 
                      className="group w-full h-14 flex items-center px-4 gap-4 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl transition-all duration-200 hover:shadow-md hover:border-primary/30"
                      onClick={() => {
                        setLoginType('google')
                        handleStartSocialLogin('Google')
                      }}
                    >
                      <div className="w-8 h-8 flex items-center justify-center bg-white rounded-full shadow-sm border p-1.5 group-hover:scale-110 transition-transform">
                        <svg viewBox="0 0 24 24" className="w-full h-full">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                      </div>
                      <div className="flex flex-col items-start">
                        <span className="text-sm font-semibold text-foreground">Google Account</span>
                        <span className="text-xs text-muted-foreground">Quick login with Google account</span>
                      </div>
                    </button>

                    {/* GitHub */}
                    <button 
                      className="group w-full h-14 flex items-center px-4 gap-4 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl transition-all duration-200 hover:shadow-md hover:border-primary/30"
                      onClick={() => {
                        setLoginType('github')
                        handleStartSocialLogin('Github')
                      }}
                    >
                      <div className="w-8 h-8 flex items-center justify-center bg-white rounded-full shadow-sm border p-1.5 group-hover:scale-110 transition-transform">
                        <svg viewBox="0 0 24 24" fill="#24292f" className="w-full h-full">
                          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                        </svg>
                      </div>
                      <div className="flex flex-col items-start">
                        <span className="text-sm font-semibold text-foreground">GitHub Account</span>
                        <span className="text-xs text-muted-foreground">Quick login with GitHub account</span>
                      </div>
                    </button>

                    {/* AWS Builder ID */}
                    <button 
                      className="group w-full h-14 flex items-center px-4 gap-4 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl transition-all duration-200 hover:shadow-md hover:border-primary/30"
                      onClick={() => {
                        setLoginType('builderid')
                        handleStartBuilderIdLogin()
                      }}
                    >
                      <div className="w-8 h-8 flex items-center justify-center bg-white rounded-full shadow-sm border p-1.5 group-hover:scale-110 transition-transform">
                        <svg viewBox="0 0 24 24" fill="#232f3e" className="w-full h-full">
                          <text x="0" y="17" fontSize="12" fontWeight="bold" fontFamily="Arial">aws</text>
                        </svg>
                      </div>
                      <div className="flex flex-col items-start">
                        <span className="text-sm font-semibold text-foreground">AWS Builder ID</span>
                        <span className="text-xs text-muted-foreground">Login with AWS Builder ID</span>
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SSO Token import mode */}
          {importMode === 'sso' && !verifiedData && (
            <div className="space-y-5">
              <div className="p-4 bg-blue-50/50 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-blue-900/20">
                <div className="flex items-start gap-3">
                   <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
                      <Info className="w-4 h-4" />
                   </div>
                   <div className="flex-1">
                      <p className="text-sm font-semibold text-blue-700 dark:text-blue-300 mb-1.5">How to get Token?</p>
                      <ol className="text-xs text-blue-600/90 dark:text-blue-400/90 list-decimal list-inside space-y-1.5">
                        <li>Visit and login in browser: <a href="https://view.awsapps.com/start/#/device?user_code=PQCF-FCCN/start/#/device?user_code=PQCF-FCCN" target="_blank" className="underline hover:text-blue-800 font-medium">view.awsapps.com/start/#/device?user_code=PQCF-FCCN</a></li>
                        <li>Press F12 to open DevTools - Application - Cookies</li>
                        <li>Find and copy the value of <code className="px-1 py-0.5 bg-blue-100 dark:bg-blue-900/40 rounded font-mono text-[10px]">x-amz-sso_authn</code></li>
                      </ol>
                   </div>
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-1">
                    x-amz-sso_authn <span className="text-destructive">*</span>
                    <span className="text-xs text-muted-foreground font-normal ml-2">Supports batch import, one token per line</span>
                  </label>
                  <textarea
                    className="w-full min-h-[120px] px-3 py-2.5 text-sm rounded-xl border border-input bg-background/50 ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none font-mono"
                    placeholder="Paste token content, one per line&#10;eyJlbmMiOiJBMjU2...&#10;eyJlbmMiOiJBMjU2...&#10;eyJlbmMiOiJBMjU2..."
                    value={ssoToken}
                    onChange={(e) => { setSsoToken(e.target.value); setBatchImportResult(null) }}
                  />
                  {ssoToken.trim() && (
                    <p className="text-xs text-muted-foreground">
                      {ssoToken.split('\n').filter(t => t.trim()).length} tokens entered
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">AWS Region</label>
                  <select
                    className="w-full h-10 px-3 py-2 text-sm rounded-xl border border-input bg-background/50 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                  >
                    <option value="us-east-1">us-east-1 (N. Virginia)</option>
                    <option value="us-west-2">us-west-2 (Oregon)</option>
                    <option value="eu-west-1">eu-west-1 (Ireland)</option>
                  </select>
                </div>
              </div>

              {/* Batch import result */}
              {batchImportResult && (
                <div className={`p-3 rounded-lg text-sm ${batchImportResult.failed > 0 ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800' : 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'}`}>
                  <p className={`font-medium ${batchImportResult.failed > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-green-700 dark:text-green-300'}`}>
                    Import result: {batchImportResult.success}/{batchImportResult.total} succeeded
                  </p>
                  {batchImportResult.errors.length > 0 && (
                    <ul className="mt-2 text-xs text-amber-600 dark:text-amber-400 space-y-0.5 max-h-20 overflow-y-auto">
                      {batchImportResult.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <Button 
                type="button" 
                className="w-full h-11 text-sm font-medium rounded-xl shadow-sm"
                onClick={handleSsoImport}
                disabled={isVerifying || !ssoToken.trim()}
              >
                {isVerifying ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importing {ssoToken.split('\n').filter(t => t.trim()).length} accounts concurrently...
                  </>
                ) : (
                  ssoToken.split('\n').filter(t => t.trim()).length > 1 
                    ? `Batch import ${ssoToken.split('\n').filter(t => t.trim()).length} accounts`
                    : 'Import & Verify'
                )}
              </Button>
            </div>
          )}

          {/* OIDC credential input mode */}
          {importMode === 'oidc' && !verifiedData && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Enter OIDC Credentials</h3>
                <div className="flex items-center gap-2">
                  {/* Single/Batch toggle */}
                  <div className="flex bg-muted/50 rounded-lg p-0.5">
                    <button
                      className={`px-2.5 py-1 text-xs rounded-md transition-all ${oidcImportMode === 'single' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                      onClick={() => { setOidcImportMode('single'); setOidcBatchImportResult(null) }}
                    >
                      Single
                    </button>
                    <button
                      className={`px-2.5 py-1 text-xs rounded-md transition-all ${oidcImportMode === 'batch' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                      onClick={() => { setOidcImportMode('batch'); setOidcBatchImportResult(null) }}
                    >
                      Batch
                    </button>
                  </div>
                  {oidcImportMode === 'single' && (
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm"
                      className="h-7 rounded-lg text-xs"
                      onClick={handleImportFromLocal}
                    >
                      <Download className="h-3 w-3 mr-1" />
                      Local Import
                    </Button>
                  )}
                </div>
              </div>

              {/* Single import mode */}
              {oidcImportMode === 'single' && (
                <>
                  <div className="space-y-4">
                    {/* Login type selection */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Login Type</label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className={`flex-1 h-9 px-3 text-sm rounded-lg border transition-all ${authMethod === 'IdC' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-input hover:bg-muted'}`}
                          onClick={() => setAuthMethod('IdC')}
                        >
                          Builder ID (IdC)
                        </button>
                        <button
                          type="button"
                          className={`flex-1 h-9 px-3 text-sm rounded-lg border transition-all ${authMethod === 'social' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-input hover:bg-muted'}`}
                          onClick={() => setAuthMethod('social')}
                        >
                          GitHub / Google
                        </button>
                      </div>
                      {authMethod === 'social' && (
                        <p className="text-xs text-muted-foreground">
                          Social login doesn't need Client ID and Client Secret
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        Refresh Token <span className="text-destructive">*</span>
                      </label>
                      <textarea
                        className="w-full min-h-[80px] px-3 py-2.5 text-sm rounded-xl border border-input bg-background/50 ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none font-mono"
                        placeholder="Paste Refresh Token..."
                        value={refreshToken}
                        onChange={(e) => setRefreshToken(e.target.value)}
                      />
                    </div>

                    {/* IdC login needs Client ID, Client Secret and Region */}
                    {authMethod !== 'social' && (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-sm font-medium">
                              Client ID <span className="text-destructive">*</span>
                            </label>
                            <input
                              type="text"
                              className="w-full h-10 px-3 py-2 text-sm rounded-xl border border-input bg-background/50 ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 font-mono"
                              placeholder="Client ID"
                              value={clientId}
                              onChange={(e) => setClientId(e.target.value)}
                            />
                          </div>

                          <div className="space-y-2">
                            <label className="text-sm font-medium">
                              Client Secret <span className="text-destructive">*</span>
                            </label>
                            <input
                              type="password"
                              className="w-full h-10 px-3 py-2 text-sm rounded-xl border border-input bg-background/50 ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 font-mono"
                              placeholder="Client Secret"
                              value={clientSecret}
                              onChange={(e) => setClientSecret(e.target.value)}
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-sm font-medium">AWS Region</label>
                          <select
                            className="w-full h-10 px-3 py-2 text-sm rounded-xl border border-input bg-background/50 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                            value={region}
                            onChange={(e) => setRegion(e.target.value)}
                          >
                            <option value="us-east-1">us-east-1 (N. Virginia)</option>
                            <option value="us-west-2">us-west-2 (Oregon)</option>
                            <option value="eu-west-1">eu-west-1 (Ireland)</option>
                          </select>
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}

              {/* Batch import mode */}
              {oidcImportMode === 'batch' && (
                <>
                  <div className="p-3 bg-blue-50/50 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-blue-900/20">
                    <p className="text-xs text-blue-600 dark:text-blue-400">
                      Supports JSON array format. Required: <code className="px-1 bg-blue-100 dark:bg-blue-900/40 rounded">refreshToken</code>.
                      Optional: <code className="px-1 bg-blue-100 dark:bg-blue-900/40 rounded">provider</code> (BuilderId/Github/Google),
                      <code className="px-1 bg-blue-100 dark:bg-blue-900/40 rounded">clientId</code>,
                      <code className="px-1 bg-blue-100 dark:bg-blue-900/40 rounded">clientSecret</code>
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-2">
                      JSON Credential Data <span className="text-destructive">*</span>
                    </label>
                    <textarea
                      className="w-full min-h-[180px] px-3 py-2.5 text-sm rounded-xl border border-input bg-background/50 ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none font-mono text-xs"
                      placeholder={`[
  {
    "refreshToken": "xxx",
    "clientId": "xxx",
    "clientSecret": "xxx",
    "provider": "BuilderId"
  },
  {
    "refreshToken": "yyy",
    "provider": "Github"
  },
  {
    "refreshToken": "zzz",
    "provider": "Google"
  }
]`}
                      value={oidcBatchData}
                      onChange={(e) => { setOidcBatchData(e.target.value); setOidcBatchImportResult(null) }}
                    />
                    {oidcBatchData.trim() && (() => {
                      try {
                        const parsed = JSON.parse(oidcBatchData.trim())
                        const count = Array.isArray(parsed) ? parsed.length : 1
                        return <p className="text-xs text-muted-foreground">{count} credentials entered</p>
                      } catch {
                        return <p className="text-xs text-destructive">Invalid JSON format</p>
                      }
                    })()}
                  </div>

                  {/* Batch import result */}
                  {oidcBatchImportResult && (
                    <div className={`p-3 rounded-lg text-sm ${oidcBatchImportResult.failed > 0 ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800' : 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'}`}>
                      <p className={`font-medium ${oidcBatchImportResult.failed > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-green-700 dark:text-green-300'}`}>
                        Import result: {oidcBatchImportResult.success}/{oidcBatchImportResult.total} succeeded
                      </p>
                      {oidcBatchImportResult.errors.length > 0 && (
                        <ul className="mt-2 text-xs text-amber-600 dark:text-amber-400 space-y-0.5 max-h-20 overflow-y-auto">
                          {oidcBatchImportResult.errors.map((err, i) => (
                            <li key={i}>{err}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="p-3 bg-destructive/10 text-destructive rounded-xl text-sm flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
              <div className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0" />
              {error}
            </div>
          )}

          {/* Submit button - Only show in OIDC mode */}
          {importMode === 'oidc' && (
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={onClose} className="rounded-xl h-10 px-6">
                Cancel
              </Button>
              {oidcImportMode === 'single' ? (
                <Button 
                  onClick={handleOidcAdd} 
                  disabled={isSubmitting || !refreshToken || (authMethod !== 'social' && (!clientId || !clientSecret))}
                  className="rounded-xl h-10 px-6"
                >
                  {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Confirm Add
                </Button>
              ) : (
                <Button 
                  onClick={handleOidcBatchAdd} 
                  disabled={isSubmitting || !oidcBatchData.trim()}
                  className="rounded-xl h-10 px-6"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Importing concurrently...
                    </>
                  ) : (
                    (() => {
                      try {
                        const parsed = JSON.parse(oidcBatchData.trim())
                        const count = Array.isArray(parsed) ? parsed.length : 1
                        return `Batch import ${count} accounts`
                      } catch {
                        return 'Batch Import'
                      }
                    })()
                  )}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
