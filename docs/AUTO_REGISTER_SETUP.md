# AWS Auto Register Setup Guide

This guide explains how to set up the AWS Auto Register feature to automatically create AWS Builder ID accounts using Outlook emails.

## Overview

The Auto Register feature automates:
1. Outlook email activation (if needed)
2. AWS Builder ID registration
3. Automatic verification code retrieval from email
4. Account creation completion

## Prerequisites

- Outlook.com or Hotmail.com email account
- Microsoft Azure account (free tier works)
- Node.js installed

## Step 1: Create Azure App Registration

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** → **App registrations** → **New registration**
3. Configure the app:
   - **Name:** `Kiro Mail Reader` (or any name you prefer)
   - **Supported account types:** Personal Microsoft accounts only
   - **Redirect URI:** Web → `http://localhost:3010/callback`
4. Click **Register**

## Step 2: Create Client Secret

1. In your app registration, go to **Certificates & secrets**
2. Click **New client secret**
3. Set description: `kiro-secret`
4. Set expiration: 24 months (recommended)
5. Click **Add**
6. **Important:** Copy the **Value** immediately (you won't see it again)

## Step 3: Configure API Permissions

1. Go to **API permissions** → **Add a permission**
2. Select **Microsoft Graph** → **Delegated permissions**
3. Add these permissions:
   - `Mail.Read`
   - `offline_access`
4. Click **Add permissions**

## Step 4: Get Your Credentials

From the app's **Overview** page, note down:
- **Application (client) ID** - This is your `client_id`
- **Client Secret Value** - From Step 2

## Step 5: Get Refresh Token

1. Edit `scripts/get-outlook-token.js`:
   - Replace `CLIENT_ID` with your Application (client) ID
   - Replace `CLIENT_SECRET` with your Client Secret Value

2. Run the token script:
   ```bash
   node scripts/get-outlook-token.js
   ```

3. Open the displayed URL in your browser

4. Login with your Outlook/Hotmail account

5. After successful login, copy the **Refresh Token** from the terminal or browser

## Step 6: Use Auto Register

In the Kiro Account Manager app, go to **AWS Auto Register** and enter accounts in this format:

```
email|password|refresh_token|client_id|client_secret
```

Example:
```
myemail@outlook.com|MyEmailPassword123|M.C551_BAY.0.U.-CjikMU78...|xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx|your_client_secret_here
```

### Multiple Accounts

You can register multiple accounts at once (one per line):
```
email1@outlook.com|pass1|refresh_token1|client_id|client_secret
email2@hotmail.com|pass2|refresh_token2|client_id|client_secret
email3@outlook.com|pass3|refresh_token3|client_id|client_secret
```

## Field Descriptions

| Field           | Description                                     |
|-----------------|-------------------------------------------------|
| `email`         | Your Outlook/Hotmail email address              |
| `password`      | Your email password (for Outlook activation)    |
| `refresh_token` | Microsoft Graph API refresh token (from Step 5) |
| `client_id`     | Azure App Application (client) ID               |
| `client_secret` | Azure App Client Secret Value                   |

## Options

- **Skip Outlook Activation:** Enable if your Outlook email is already activated
- **Concurrency:** Number of parallel registrations (default: 1)
- **Proxy:** Optional proxy URL for AWS registration

## Troubleshooting

### Token Expired
Refresh tokens expire after 90 days of inactivity. Run the token script again to get a new one.

### Redirect URI Mismatch
Make sure the redirect URI in Azure Portal matches exactly: `http://localhost:3010/callback`

### Permission Denied
Ensure you've added `Mail.Read` and `offline_access` permissions in Azure Portal.

### Verification Code Not Found
- Check that the email account can receive emails from AWS
- Ensure the refresh token is valid and has `Mail.Read` permission
