/**
 * AWS Builder ID Auto Registration Module
 * Fully integrated in Electron, no external Python scripts required
 * 
 * Email parameter format: email|password|refresh_token|client_id
 * - refresh_token: OAuth2 refresh token (e.g. M.C509_xxx...)
 * - client_id: Graph API client ID (e.g. 9e5f94bc-xxx...)
 */

import { chromium, Browser, Page } from 'playwright'

// Log callback type
type LogCallback = (message: string) => void

// Verification code regex - consistent with Python version
const CODE_PATTERNS = [
  // AWS/Amazon verification code format
  /(?:verification\s*code|Your code is|code is)[：:\s]*(\d{6})/gi,
  /(?:is)[：:\s]*(\d{6})\b/gi,
  // Verification code usually on its own line or in specific context
  /^\s*(\d{6})\s*$/gm,  // 6-digit number on its own line
  />\s*(\d{6})\s*</g,   // 6-digit number between HTML tags
]

// AWS verification code senders
const AWS_SENDERS = [
  'no-reply@signin.aws',        // AWS new sender
  'no-reply@login.awsapps.com',
  'noreply@amazon.com',
  'account-update@amazon.com',
  'no-reply@aws.amazon.com',
  'noreply@aws.amazon.com',
  'aws'  // Fuzzy match
]

// Random name generation
const FIRST_NAMES = ['James', 'Robert', 'John', 'Michael', 'David', 'William', 'Richard', 'Maria', 'Elizabeth', 'Jennifer', 'Linda', 'Barbara', 'Susan', 'Jessica']
const LAST_NAMES = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Wilson', 'Anderson', 'Thomas', 'Taylor']

function generateRandomName(): string {
  const first = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)]
  const last = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)]
  return `${first} ${last}`
}

// HTML to text - improved version
function htmlToText(html: string): string {
  if (!html) return ''
  
  let text = html
  
  // Decode HTML entities
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
  
  // Remove style and script tags and their content
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
  
  // Convert br and p tags to newlines
  text = text.replace(/<br\s*\/?>/gi, '\n')
  text = text.replace(/<\/p>/gi, '\n')
  text = text.replace(/<\/div>/gi, '\n')
  
  // Remove all HTML tags
  text = text.replace(/<[^>]+>/g, ' ')
  
  // Clean extra whitespace
  text = text.replace(/\s+/g, ' ')
  
  return text.trim()
}

// Extract verification code from text - improved version, consistent with Python
function extractCode(text: string): string | null {
  if (!text) return null
  
  for (const pattern of CODE_PATTERNS) {
    // Reset regex lastIndex
    pattern.lastIndex = 0
    
    let match
    while ((match = pattern.exec(text)) !== null) {
      const code = match[1]
      if (code && /^\d{6}$/.test(code)) {
        // Get context for exclusion check
        const start = Math.max(0, match.index - 20)
        const end = Math.min(text.length, match.index + match[0].length + 20)
        const context = text.slice(start, end)
        
        // Exclude color codes (#XXXXXX)
        if (context.includes('#' + code)) continue
        
        // Exclude CSS color related
        if (/color[:\s]*[^;]*\d{6}/i.test(context)) continue
        if (/rgb|rgba|hsl/i.test(context)) continue
        
        // Exclude numbers longer than 6 digits (phone numbers, zip codes, etc.)
        if (/\d{7,}/.test(context)) continue
        
        return code
      }
    }
  }
  return null
}


/**
 * Get verification code from Outlook email
 * Uses Microsoft Graph API, consistent with Python version
 */
export async function getOutlookVerificationCode(
  refreshToken: string,
  clientId: string,
  log: LogCallback,
  timeout: number = 120,
  clientSecret?: string
): Promise<string | null> {
  log('========== Starting email verification code fetch ==========')
  log(`client_id: ${clientId}`)
  log(`refresh_token: ${refreshToken.substring(0, 30)}...`)
  
  const startTime = Date.now()
  const checkInterval = 5000 // Check every 5 seconds
  const checkedIds = new Set<string>()
  
  while (Date.now() - startTime < timeout * 1000) {
    try {
      // Refresh access_token
      log('Refreshing access_token...')
      let accessToken: string | null = null
      
      const tokenAttempts = [
        { url: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token', scope: null },
        { url: 'https://login.microsoftonline.com/common/oauth2/v2.0/token', scope: null },
      ]
      
      for (const attempt of tokenAttempts) {
        try {
          const tokenBody = new URLSearchParams()
          tokenBody.append('client_id', clientId)
          tokenBody.append('refresh_token', refreshToken)
          tokenBody.append('grant_type', 'refresh_token')
          if (clientSecret) {
            tokenBody.append('client_secret', clientSecret)
          }
          if (attempt.scope) {
            tokenBody.append('scope', attempt.scope)
          }
          
          const tokenResponse = await fetch(attempt.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: tokenBody.toString()
          })
          
          if (tokenResponse.ok) {
            const tokenResult = await tokenResponse.json() as { access_token: string }
            accessToken = tokenResult.access_token
            log('Successfully got access_token')
            break
          } else {
            const errorText = await tokenResponse.text()
            log(`Token refresh attempt failed: ${tokenResponse.status} - ${errorText.substring(0, 200)}`)
          }
        } catch (e) {
          log(`Token refresh exception: ${e}`)
          continue
        }
      }
      
      if (!accessToken) {
        log('Token refresh failed')
        return null
      }
      
      // Get emails
      log('Fetching email list...')
      const graphParams = new URLSearchParams({
        '$top': '50',
        '$orderby': 'receivedDateTime desc',
        '$select': 'id,subject,from,receivedDateTime,bodyPreview,body'
      })
      
      const mailResponse = await fetch(`https://graph.microsoft.com/v1.0/me/messages?${graphParams}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (!mailResponse.ok) {
        log(`Failed to fetch emails: ${mailResponse.status}`)
        await new Promise(r => setTimeout(r, checkInterval))
        continue
      }
      
      const mailData = await mailResponse.json() as {
        value: Array<{
          id: string
          subject: string
          from: { emailAddress: { address: string } }
          body: { content: string }
          bodyPreview: string
          receivedDateTime: string
        }>
      }
      
      log(`Got ${mailData.value?.length || 0} emails`)
      
      // Search for latest AWS email
      for (const mail of mailData.value || []) {
        const fromEmail = mail.from?.emailAddress?.address?.toLowerCase() || ''
        const isAwsSender = AWS_SENDERS.some(s => fromEmail.includes(s.toLowerCase()))
        
        if (isAwsSender && !checkedIds.has(mail.id)) {
          checkedIds.add(mail.id)
          
          log(`\n=== Checking AWS email ===`)
          log(`  From: ${fromEmail}`)
          log(`  Subject: ${mail.subject?.substring(0, 50)}`)
          
          // Extract verification code
          let code: string | null = null
          const bodyText = htmlToText(mail.body?.content || '')
          if (bodyText) {
            code = extractCode(bodyText)
          }
          if (!code) {
            code = extractCode(mail.body?.content || '')
          }
          if (!code) {
            code = extractCode(mail.bodyPreview || '')
          }
          
          if (code) {
            log(`\n========== Found verification code: ${code} ==========`)
            return code
          }
        }
      }
      
      log(`Verification code not found, retrying in ${checkInterval / 1000} seconds...`)
      await new Promise(r => setTimeout(r, checkInterval))
      
    } catch (error) {
      log(`Error getting verification code: ${error}`)
      await new Promise(r => setTimeout(r, checkInterval))
    }
  }
  
  log('Verification code fetch timeout')
  return null
}


/**
 * Wait for input field to appear and fill content
 */
async function waitAndFill(
  page: Page,
  selector: string,
  value: string,
  log: LogCallback,
  description: string,
  timeout: number = 30000
): Promise<boolean> {
  log(`Waiting for ${description} to appear...`)
  try {
    const element = page.locator(selector).first()
    await element.waitFor({ state: 'visible', timeout })
    await page.waitForTimeout(500)
    await element.clear()
    await element.fill(value)
    log(`Filled ${description}: ${value}`)
    return true
  } catch (error) {
    log(`${description} operation failed: ${error}`)
    return false
  }
}

/**
 * Try clicking multiple selectors
 */
async function tryClickSelectors(
  page: Page,
  selectors: string[],
  log: LogCallback,
  description: string,
  timeout: number = 15000
): Promise<boolean> {
  for (const selector of selectors) {
    try {
      const element = page.locator(selector).first()
      await element.waitFor({ state: 'visible', timeout: timeout / selectors.length })
      await page.waitForTimeout(300)
      await element.click()
      log(`Clicked ${description}`)
      return true
    } catch {
      continue
    }
  }
  log(`${description} not found`)
  return false
}

/**
 * Detect AWS error popup and retry clicking button
 * Error popup selector: div.awsui_content_mx3cw_97dyn_391 contains "Sorry, there was an error processing your request"
 */
async function checkAndRetryOnError(
  page: Page,
  buttonSelector: string,
  log: LogCallback,
  description: string,
  maxRetries: number = 3,
  retryDelay: number = 2000
): Promise<boolean> {
  // Multiple possible selectors for error popup
  const errorSelectors = [
    'div.awsui_content_mx3cw_97dyn_391',
    '[class*="awsui_content_"]',
    '.awsui-flash-error',
    '[data-testid="flash-error"]'
  ]
  
  const errorTexts = [
    'Sorry, there was an error processing your request',
    'error processing your request',
    'Please try again'
  ]
  
  for (let retry = 0; retry < maxRetries; retry++) {
    // Wait for page to respond
    await page.waitForTimeout(1500)
    
    // Check for error popup
    let hasError = false
    for (const selector of errorSelectors) {
      try {
        const errorElements = await page.locator(selector).all()
        for (const el of errorElements) {
          const text = await el.textContent()
          if (text && errorTexts.some(errText => text.includes(errText))) {
            hasError = true
            log(`Warning: Detected error popup: "${text.substring(0, 50)}..."`)
            break
          }
        }
        if (hasError) break
      } catch {
        continue
      }
    }
    
    if (!hasError) {
      // No error, operation successful
      return true
    }
    
    if (retry < maxRetries - 1) {
      log(`Retrying ${description} (${retry + 2}/${maxRetries})...`)
      await page.waitForTimeout(retryDelay)
      
      // Re-click button
      try {
        const button = page.locator(buttonSelector).first()
        await button.waitFor({ state: 'visible', timeout: 5000 })
        await button.click()
        log(`Re-clicked ${description}`)
      } catch (e) {
        log(`Failed to re-click ${description}: ${e}`)
      }
    }
  }
  
  log(`${description} still failed after multiple retries`)
  return false
}

/**
 * Wait for button to appear and click, with error detection and auto retry
 */
async function waitAndClickWithRetry(
  page: Page,
  selector: string,
  log: LogCallback,
  description: string,
  timeout: number = 30000,
  maxRetries: number = 3
): Promise<boolean> {
  log(`Waiting for ${description} to appear...`)
  try {
    const element = page.locator(selector).first()
    await element.waitFor({ state: 'visible', timeout })
    await page.waitForTimeout(500)
    await element.click()
    log(`Clicked ${description}`)
    
    // Check for error popup, retry if found
    const success = await checkAndRetryOnError(page, selector, log, description, maxRetries)
    return success
  } catch (error) {
    log(`Failed to click ${description}: ${error}`)
    return false
  }
}

/**
 * Outlook Email Activation
 * Activate Outlook email before AWS registration to ensure verification codes can be received
 */
export async function activateOutlook(
  email: string,
  emailPassword: string,
  log: LogCallback
): Promise<{ success: boolean; error?: string }> {
  const activationUrl = 'https://go.microsoft.com/fwlink/p/?linkid=2125442'
  let browser: Browser | null = null
  
  log('========== Starting Outlook Email Activation ==========')
  log(`Email: ${email}`)
  
  try {
    // Launch browser
    log('\nStep 1: Launching browser, visiting Outlook activation page...')
    browser = await chromium.launch({
      headless: false,
      args: ['--disable-blink-features=AutomationControlled']
    })
    
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    })
    
    const page = await context.newPage()
    
    await page.goto(activationUrl, { waitUntil: 'networkidle', timeout: 60000 })
    log('Page loaded successfully')
    await page.waitForTimeout(2000)
    
    // Step 2: Wait for email input field and enter email
    log('\nStep 2: Entering email...')
    const emailInputSelectors = [
      'input#i0116[type="email"]',
      'input[name="loginfmt"]',
      'input[type="email"]'
    ]
    
    let emailFilled = false
    for (const selector of emailInputSelectors) {
      try {
        const element = page.locator(selector).first()
        await element.waitFor({ state: 'visible', timeout: 10000 })
        await element.fill(email)
        log(`Entered email: ${email}`)
        emailFilled = true
        break
      } catch {
        continue
      }
    }
    
    if (!emailFilled) {
      throw new Error('Email input field not found')
    }
    
    await page.waitForTimeout(1000)
    
    // Step 3: Click first next button
    log('\nStep 3: Clicking next button...')
    const firstNextSelectors = [
      'input#idSIButton9[type="submit"]',
      'input[type="submit"][value="Next"]'
    ]
    
    if (!await tryClickSelectors(page, firstNextSelectors, log, 'first next button')) {
      throw new Error('Failed to click first next button')
    }
    
    await page.waitForTimeout(3000)
    
    // Step 4: Wait for password input field and enter password
    log('\nStep 4: Entering password...')
    const passwordInputSelectors = [
      'input#passwordEntry[type="password"]',
      'input#i0118[type="password"]',
      'input[name="passwd"][type="password"]',
      'input[type="password"]'
    ]
    
    let passwordFilled = false
    for (const selector of passwordInputSelectors) {
      try {
        const element = page.locator(selector).first()
        await element.waitFor({ state: 'visible', timeout: 15000 })
        await element.fill(emailPassword)
        log('Entered password')
        passwordFilled = true
        break
      } catch {
        continue
      }
    }
    
    if (!passwordFilled) {
      throw new Error('Password input field not found')
    }
    
    await page.waitForTimeout(1000)
    
    // Step 5: Click second next/login button
    log('\nStep 5: Clicking login button...')
    const loginButtonSelectors = [
      'button[type="submit"][data-testid="primaryButton"]',
      'input#idSIButton9[type="submit"]',
      'button:has-text("Sign in")',
      'button:has-text("Next")'
    ]
    
    if (!await tryClickSelectors(page, loginButtonSelectors, log, 'login button')) {
      throw new Error('Failed to click login button')
    }
    
    await page.waitForTimeout(3000)
    
    // Step 6: Wait for first "Skip for now" link and click
    log('\nStep 6: Clicking first "Skip for now" link...')
    const skipSelector = 'a#iShowSkip'
    try {
      const skipElement = page.locator(skipSelector).first()
      await skipElement.waitFor({ state: 'visible', timeout: 30000 })
      await skipElement.click()
      log('Clicked first "Skip for now"')
      await page.waitForTimeout(3000)
    } catch {
      log('First "Skip for now" link not found, may have skipped this step')
    }
    
    // Step 7: Wait for second "Skip for now" link and click
    log('\nStep 7: Clicking second "Skip for now" link...')
    try {
      const skipElement = page.locator(skipSelector).first()
      await skipElement.waitFor({ state: 'visible', timeout: 15000 })
      await skipElement.click()
      log('Clicked second "Skip for now"')
      await page.waitForTimeout(3000)
    } catch {
      log('Second "Skip for now" link not found, may have skipped this step')
    }
    
    // Step 8: Wait for "Cancel" button (passkey creation dialog) and click
    log('\nStep 8: Clicking "Cancel" button (skip passkey creation)...')
    const cancelButtonSelectors = [
      'button[data-testid="secondaryButton"]:has-text("Cancel")',
      'button[type="button"]:has-text("Cancel")'
    ]
    
    if (!await tryClickSelectors(page, cancelButtonSelectors, log, '"Cancel" button', 15000)) {
      log('"Cancel" button not found, may have skipped this step')
    }
    
    await page.waitForTimeout(3000)
    
    // Step 9: Wait for "Yes" button (stay signed in) and click
    log('\nStep 9: Clicking "Yes" button (stay signed in)...')
    const yesButtonSelectors = [
      'button[type="submit"][data-testid="primaryButton"]:has-text("Yes")',
      'input#idSIButton9[value="Yes"]',
      'button:has-text("Yes")'
    ]
    
    if (!await tryClickSelectors(page, yesButtonSelectors, log, '"Yes" button', 15000)) {
      log('"Yes" button not found, may have skipped this step')
    }
    
    await page.waitForTimeout(5000)
    
    // Step 10: Wait for Outlook email to load
    log('\nStep 10: Waiting for Outlook email to load...')
    const newMailSelectors = [
      'button[aria-label="New mail"]',
      'button:has-text("New mail")',
      'span:has-text("New mail")',
      '[data-automation-type="RibbonSplitButton"]'
    ]
    
    let outlookLoaded = false
    for (const selector of newMailSelectors) {
      try {
        const element = page.locator(selector).first()
        await element.waitFor({ state: 'visible', timeout: 30000 })
        log('Outlook email activation successful!')
        outlookLoaded = true
        break
      } catch {
        continue
      }
    }
    
    if (!outlookLoaded) {
      // Check if already on inbox page
      const currentUrl = page.url()
      if (currentUrl.toLowerCase().includes('outlook') || currentUrl.toLowerCase().includes('mail')) {
        log('Already on Outlook email page, activation successful!')
        outlookLoaded = true
      }
    }
    
    await page.waitForTimeout(2000)
    await browser.close()
    browser = null
    
    if (outlookLoaded) {
      log('\n========== Outlook Email Activation Complete ==========')
      return { success: true }
    } else {
      log('\nWarning: Outlook email activation may not be complete')
      return { success: false, error: 'Outlook email activation may not be complete' }
    }
    
  } catch (error) {
    log(`\nOutlook activation failed: ${error}`)
    if (browser) {
      try { await browser.close() } catch {}
    }
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * AWS Builder ID Auto Registration
 * @param email Email address
 * @param refreshToken OAuth2 refresh token
 * @param clientId Graph API client ID
 * @param log Log callback
 * @param emailPassword Email password (for Outlook activation)
 * @param skipOutlookActivation Whether to skip Outlook activation
 * @param proxyUrl Proxy address (only for AWS registration, not for Outlook activation and verification code fetch)
 * @param clientSecret Graph API client secret (required for token refresh)
 */
export async function autoRegisterAWS(
  email: string,
  refreshToken: string,
  clientId: string,
  log: LogCallback,
  emailPassword?: string,
  skipOutlookActivation: boolean = false,
  proxyUrl?: string,
  clientSecret?: string
): Promise<{ success: boolean; ssoToken?: string; name?: string; error?: string }> {
  const password = 'admin123456aA!'
  const randomName = generateRandomName()
  let browser: Browser | null = null
  
  // If Outlook email and password provided, activate first (without proxy)
  if (!skipOutlookActivation && email.toLowerCase().includes('outlook') && emailPassword) {
    log('Detected Outlook email, activating first (without proxy)...')
    const activationResult = await activateOutlook(email, emailPassword, log)
    if (!activationResult.success) {
      log(`Warning: Outlook activation may not be complete: ${activationResult.error}`)
      log('Continuing with AWS registration...')
    } else {
      log('Outlook activation successful, starting AWS registration...')
    }
    // Wait before continuing
    await new Promise(r => setTimeout(r, 2000))
  }
  
  log('========== Starting AWS Builder ID Registration ==========')
  log(`Email: ${email}`)
  log(`Name: ${randomName}`)
  log(`Password: ${password}`)
  if (proxyUrl) {
    log(`Proxy: ${proxyUrl}`)
  }
  
  try {
    // Step 1: Create browser, go to registration page (using proxy)
    log('\nStep 1: Launching browser, going to registration page...')
    browser = await chromium.launch({
      headless: false,
      proxy: proxyUrl ? { server: proxyUrl } : undefined,
      args: ['--disable-blink-features=AutomationControlled']
    })
    
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    })
    
    const page = await context.newPage()
    
    const registerUrl = 'https://view.awsapps.com/start/#/device?user_code=PQCF-FCCN'
    await page.goto(registerUrl, { waitUntil: 'networkidle', timeout: 60000 })
    log('Page loaded')
    await page.waitForTimeout(2000)
    
    // Wait for email input field and enter email
    // Selector: input[placeholder="username@example.com"]
    const emailInputSelector = 'input[placeholder="username@example.com"]'
    if (!await waitAndFill(page, emailInputSelector, email, log, 'email input field')) {
      throw new Error('Email input field not found')
    }
    
    await page.waitForTimeout(1000)
    
    // Click first continue button (with error detection and auto retry)
    // Selector: button[data-testid="test-primary-button"]
    const firstContinueSelector = 'button[data-testid="test-primary-button"]'
    if (!await waitAndClickWithRetry(page, firstContinueSelector, log, 'first continue button')) {
      throw new Error('Failed to click first continue button')
    }
    
    await page.waitForTimeout(3000)
    
    // Detect if this is a registered account (login page or verification page)
    // Login page indicator 1: span contains "Sign in with your AWS Builder ID"
    // Login page indicator 2: page contains "verify" and has verification code input
    const loginHeadingSelector = 'span[class*="awsui_heading-text"]:has-text("Sign in with your AWS Builder ID")'
    const verifyHeadingSelector = 'span[class*="awsui_heading-text"]:has-text("Verify")'
    const verifyCodeInputSelector = 'input[placeholder="6-digit"]'
    const nameInputSelector = 'input[placeholder="Maria José Silva"]'
    
    let isLoginFlow = false
    let isVerifyFlow = false  // Login flow that goes directly to verification code step
    
    try {
      // Simultaneously detect login page, verification page and registration page elements
      const loginHeading = page.locator(loginHeadingSelector).first()
      const verifyHeading = page.locator(verifyHeadingSelector).first()
      const verifyCodeInput = page.locator(verifyCodeInputSelector).first()
      const nameInput = page.locator(nameInputSelector).first()
      
      // Wait for one of the elements to appear
      const result = await Promise.race([
        loginHeading.waitFor({ state: 'visible', timeout: 10000 }).then(() => 'login'),
        verifyHeading.waitFor({ state: 'visible', timeout: 10000 }).then(() => 'verify'),
        verifyCodeInput.waitFor({ state: 'visible', timeout: 10000 }).then(() => 'verify-input'),
        nameInput.waitFor({ state: 'visible', timeout: 10000 }).then(() => 'register')
      ])
      
      if (result === 'login') {
        isLoginFlow = true
      } else if (result === 'verify' || result === 'verify-input') {
        isLoginFlow = true
        isVerifyFlow = true
      }
    } catch {
      // If none found, try detecting individually
      try {
        await page.locator(loginHeadingSelector).first().waitFor({ state: 'visible', timeout: 3000 })
        isLoginFlow = true
      } catch {
        try {
          // Detect verify heading or verification code input
          const hasVerify = await page.locator(verifyHeadingSelector).first().isVisible().catch(() => false)
          const hasVerifyInput = await page.locator(verifyCodeInputSelector).first().isVisible().catch(() => false)
          if (hasVerify || hasVerifyInput) {
            isLoginFlow = true
            isVerifyFlow = true
          }
        } catch {
          isLoginFlow = false
        }
      }
    }
    
    if (isLoginFlow) {
      // ========== Login Flow (Email Already Registered) ==========
      if (isVerifyFlow) {
        log('\nWarning: Detected verification page, email already registered, going directly to verification code step...')
      } else {
        log('\nWarning: Detected email already registered, switching to login flow...')
      }
      
      // If not direct verification flow, need to enter password first
      if (!isVerifyFlow) {
        // Step 2 (Login): Enter password
        log('\nStep 2 (Login): Entering password...')
        const loginPasswordSelector = 'input[placeholder="Enter password"]'
        if (!await waitAndFill(page, loginPasswordSelector, password, log, 'login password input field')) {
          throw new Error('Login password input field not found')
        }
        
        await page.waitForTimeout(1000)
        
        // Click continue button
        const loginContinueSelector = 'button[data-testid="test-primary-button"]'
        if (!await waitAndClickWithRetry(page, loginContinueSelector, log, 'login continue button')) {
          throw new Error('Failed to click login continue button')
        }
        
        await page.waitForTimeout(3000)
      }
      
      // Step 3 (Login): Wait for verification code input, get and enter code
      log('\nStep 3 (Login): Getting and entering verification code...')
      // Login verification code input selectors (support multiple placeholders)
      const loginCodeSelectors = [
        'input[placeholder="6-digit"]',
        'input[class*="awsui_input"][type="text"]'
      ]
      
      let loginCodeInput: string | null = null
      for (const selector of loginCodeSelectors) {
        try {
          await page.locator(selector).first().waitFor({ state: 'visible', timeout: 10000 })
          loginCodeInput = selector
          log('Login verification code input field appeared')
          break
        } catch {
          continue
        }
      }
      
      if (!loginCodeInput) {
        throw new Error('Login verification code input field not found')
      }
      
      await page.waitForTimeout(1000)
      
      // Auto-fetch verification code
      let loginVerificationCode: string | null = null
      if (refreshToken && clientId) {
        loginVerificationCode = await getOutlookVerificationCode(refreshToken, clientId, log, 120, clientSecret)
      } else {
        log('Missing refresh_token or client_id, cannot auto-fetch verification code')
      }
      
      if (!loginVerificationCode) {
        throw new Error('Unable to get login verification code')
      }
      
      // Enter verification code
      if (!await waitAndFill(page, loginCodeInput, loginVerificationCode, log, 'login verification code')) {
        throw new Error('Failed to enter login verification code')
      }
      
      await page.waitForTimeout(1000)
      
      // Click verification code confirm button
      const loginVerifySelector = 'button[data-testid="test-primary-button"]'
      if (!await waitAndClickWithRetry(page, loginVerifySelector, log, 'login verification code confirm button')) {
        throw new Error('Failed to click login verification code confirm button')
      }
      
      await page.waitForTimeout(5000)
      
    } else {
      // ========== Registration Flow (New Account) ==========
      // Step 2: Wait for name input field, enter name
      log('\nStep 2: Entering name...')
      if (!await waitAndFill(page, nameInputSelector, randomName, log, 'name input field')) {
        throw new Error('Name input field not found')
      }
      
      await page.waitForTimeout(1000)
      
      // Click second continue button (with error detection and auto retry)
      // Selector: button[data-testid="signup-next-button"]
      const secondContinueSelector = 'button[data-testid="signup-next-button"]'
      if (!await waitAndClickWithRetry(page, secondContinueSelector, log, 'second continue button')) {
        throw new Error('Failed to click second continue button')
      }
      
      await page.waitForTimeout(3000)
      
      // Step 3: Wait for verification code input, get and enter code
      log('\nStep 3: Getting and entering verification code...')
      // Selector: input[placeholder="6-digit"]
      const codeInputSelector = 'input[placeholder="6-digit"]'
      
      // Wait for verification code input to appear
      log('Waiting for verification code input field...')
      try {
        await page.locator(codeInputSelector).first().waitFor({ state: 'visible', timeout: 30000 })
        log('Verification code input field appeared')
      } catch {
        throw new Error('Verification code input field not found')
      }
      
      await page.waitForTimeout(1000)
      
      // Auto-fetch verification code
      let verificationCode: string | null = null
      if (refreshToken && clientId) {
        verificationCode = await getOutlookVerificationCode(refreshToken, clientId, log, 120, clientSecret)
      } else {
        log('Missing refresh_token or client_id, cannot auto-fetch verification code')
      }
      
      if (!verificationCode) {
        throw new Error('Unable to get verification code')
      }
      
      // Enter verification code
      if (!await waitAndFill(page, codeInputSelector, verificationCode, log, 'verification code')) {
        throw new Error('Failed to enter verification code')
      }
      
      await page.waitForTimeout(1000)
      
      // Click Continue button (with error detection and auto retry)
      // Selector: button[data-testid="email-verification-verify-button"]
      const verifyButtonSelector = 'button[data-testid="email-verification-verify-button"]'
      if (!await waitAndClickWithRetry(page, verifyButtonSelector, log, 'Continue button')) {
        throw new Error('Failed to click Continue button')
      }
      
      await page.waitForTimeout(3000)
      
      // Step 4: Wait for password input, enter password
      log('\nStep 4: Entering password...')
      // Selector: input[placeholder="Enter password"]
      const passwordInputSelector = 'input[placeholder="Enter password"]'
      if (!await waitAndFill(page, passwordInputSelector, password, log, 'password input field')) {
        throw new Error('Password input field not found')
      }
      
      await page.waitForTimeout(500)
      
      // Enter confirm password
      // Selector: input[placeholder="Re-enter password"]
      const confirmPasswordSelector = 'input[placeholder="Re-enter password"]'
      if (!await waitAndFill(page, confirmPasswordSelector, password, log, 'confirm password input field')) {
        throw new Error('Confirm password input field not found')
      }
      
      await page.waitForTimeout(1000)
      
      // Click third continue button (with error detection and auto retry)
      // Selector: button[data-testid="test-primary-button"]
      const thirdContinueSelector = 'button[data-testid="test-primary-button"]'
      if (!await waitAndClickWithRetry(page, thirdContinueSelector, log, 'third continue button')) {
        throw new Error('Failed to click third continue button')
      }
      
      await page.waitForTimeout(5000)
    }
    
    // Step 5: Get SSO Token (shared by login and registration flows)
    log('\nStep 5: Getting SSO Token...')
    let ssoToken: string | null = null
    
    for (let i = 0; i < 30; i++) {
      const cookies = await context.cookies()
      const ssoCookie = cookies.find(c => c.name === 'x-amz-sso_authn')
      if (ssoCookie) {
        ssoToken = ssoCookie.value
        log(`Successfully got SSO Token (x-amz-sso_authn)!`)
        break
      }
      log(`Waiting for SSO Token... (${i + 1}/30)`)
      await page.waitForTimeout(1000)
    }
    
    await browser.close()
    browser = null
    
    if (ssoToken) {
      log('\n========== Operation Successful! ==========')
      return { success: true, ssoToken, name: randomName }
    } else {
      throw new Error('Failed to get SSO Token, operation may not be complete')
    }
    
  } catch (error) {
    log(`\nRegistration failed: ${error}`)
    if (browser) {
      try { await browser.close() } catch {}
    }
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}
