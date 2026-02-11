/**
 * Microsoft Graph API OAuth2 Token Fetcher
 * 
 * Usage:
 * 1. Copy this file: cp scripts/get-outlook-token.example.js scripts/get-outlook-token.js
 * 2. Fill in your CLIENT_ID and CLIENT_SECRET from Azure Portal
 * 3. Run: node scripts/get-outlook-token.js
 * 4. Open the URL in browser and login with your Outlook account
 */

const http = require('http')
const https = require('https')
const { URL } = require('url')

// ============================================
// FILL IN YOUR AZURE APP CREDENTIALS BELOW
// ============================================
const CLIENT_ID = 'YOUR_CLIENT_ID_HERE'           // Application (client) ID from Azure Portal
const CLIENT_SECRET = 'YOUR_CLIENT_SECRET_HERE'   // Client secret value from Azure Portal
// ============================================

const REDIRECT_URI = 'http://localhost:3010/callback'
const SCOPES = 'offline_access Mail.Read'

const AUTH_URL = `https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(SCOPES)}&response_mode=query`

// Validate credentials
if (CLIENT_ID === 'YOUR_CLIENT_ID_HERE' || CLIENT_SECRET === 'YOUR_CLIENT_SECRET_HERE') {
  console.error('\nError: Please fill in your Azure App credentials first!')
  console.error('Edit this file and replace YOUR_CLIENT_ID_HERE and YOUR_CLIENT_SECRET_HERE\n')
  process.exit(1)
}

console.log('\n=== Microsoft Graph API Token Fetcher ===\n')
console.log('Step 1: Open this URL in your browser:\n')
console.log(AUTH_URL)
console.log('\nStep 2: Login with your Outlook/Hotmail account')
console.log('Step 3: After login, you will be redirected to localhost\n')

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  
  if (url.pathname === '/callback') {
    const code = url.searchParams.get('code')
    
    if (code) {
      console.log('Authorization code received, exchanging for tokens...\n')
      
      try {
        const tokens = await exchangeCodeForTokens(code)
        
        console.log('=== SUCCESS ===\n')
        console.log('Client ID:', CLIENT_ID)
        console.log('\nRefresh Token:', tokens.refresh_token)
        console.log('\nAccess Token:', tokens.access_token.substring(0, 50) + '...')
        console.log('\n=== Copy these for Auto Register ===')
        console.log(`\nFormat: email|password|${tokens.refresh_token}|${CLIENT_ID}`)
        
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(`
          <html>
            <body style="font-family: Arial; padding: 40px; background: #1a1a2e; color: #eee;">
              <h1 style="color: #4ade80;">Success!</h1>
              <p>Tokens received. Check your terminal.</p>
              <h3>Refresh Token:</h3>
              <textarea style="width: 100%; height: 100px; background: #16213e; color: #eee; border: 1px solid #4ade80; padding: 10px;">${tokens.refresh_token}</textarea>
              <h3>Client ID:</h3>
              <code style="background: #16213e; padding: 10px; display: block;">${CLIENT_ID}</code>
              <p style="margin-top: 20px;">You can close this window now.</p>
            </body>
          </html>
        `)
        
        setTimeout(() => {
          console.log('\nServer shutting down...')
          process.exit(0)
        }, 2000)
        
      } catch (error) {
        console.error('Error exchanging code:', error)
        res.writeHead(500, { 'Content-Type': 'text/plain' })
        res.end('Error: ' + error.message)
      }
    } else {
      const error = url.searchParams.get('error')
      const errorDesc = url.searchParams.get('error_description')
      console.error('Error:', error, errorDesc)
      res.writeHead(400, { 'Content-Type': 'text/plain' })
      res.end('Error: ' + errorDesc)
    }
  } else {
    res.writeHead(404)
    res.end('Not found')
  }
})

function exchangeCodeForTokens(code) {
  return new Promise((resolve, reject) => {
    const postData = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code: code,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code'
    }).toString()

    const options = {
      hostname: 'login.microsoftonline.com',
      path: '/consumers/oauth2/v2.0/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    }

    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          if (json.error) {
            reject(new Error(json.error_description || json.error))
          } else {
            resolve(json)
          }
        } catch (e) {
          reject(e)
        }
      })
    })

    req.on('error', reject)
    req.write(postData)
    req.end()
  })
}

server.listen(3010, () => {
  console.log('Waiting for OAuth callback on http://localhost:3010/callback ...\n')
})
