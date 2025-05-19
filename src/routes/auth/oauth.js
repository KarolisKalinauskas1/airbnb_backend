/**
 * OAuth Callback Routes
 * 
 * This file handles OAuth callbacks for various services like Gmail.
 */

const express = require('express');
const router = express.Router();
const GmailEmailService = require('../../shared/services/gmail-email.service');
const fs = require('fs');
const path = require('path');

/**
 * Route to initiate Gmail OAuth flow
 */
router.get('/gmail/auth', (req, res) => {
  try {
    // Check if Gmail OAuth is properly configured
    if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET) {
      return res.status(500).send(`
        <html>
          <body>
            <h1>Gmail OAuth Configuration Error</h1>
            <p>Gmail OAuth is not properly configured. Please check your .env file.</p>
            <p>Required variables:</p>
            <ul>
              <li>GMAIL_CLIENT_ID: ${process.env.GMAIL_CLIENT_ID ? 'Set ✅' : 'Missing ❌'}</li>
              <li>GMAIL_CLIENT_SECRET: ${process.env.GMAIL_CLIENT_SECRET ? 'Set ✅' : 'Missing ❌'}</li>
            </ul>
            <p>Please follow the setup instructions in the documentation.</p>
          </body>
        </html>
      `);
    }
    
    const authUrl = GmailEmailService.getAuthorizationUrl();
    console.log('Redirecting to Gmail authorization URL:', authUrl);
    res.redirect(authUrl);
  } catch (error) {
    console.error('Error generating Gmail authorization URL:', error);
    res.status(500).send(`
      <html>
        <body>
          <h1>Error Generating Authorization URL</h1>
          <p>An error occurred: ${error.message}</p>
          <p>Please check your Gmail OAuth configuration.</p>
        </body>
      </html>
    `);
  }
});

/**
 * Gmail OAuth callback handler
 */
router.get('/callback', async (req, res) => {
  const { code } = req.query;
  
  if (!code) {
    return res.status(400).send('Authorization code is missing');
  }

  try {
    // Exchange authorization code for tokens
    const tokens = await GmailEmailService.getTokensFromCode(code);
    
    // Store the refresh token in .env file or database
    if (tokens.refresh_token) {
      // Store refresh token in .env
      const envPath = path.join(__dirname, '../../../.env');
      let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
      
      // Update or add GMAIL_REFRESH_TOKEN
      if (envContent.includes('GMAIL_REFRESH_TOKEN=')) {
        envContent = envContent.replace(
          /GMAIL_REFRESH_TOKEN=.*/,
          `GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`
        );
      } else {
        envContent += `\nGMAIL_REFRESH_TOKEN=${tokens.refresh_token}\n`;
      }
      
      fs.writeFileSync(envPath, envContent);
      console.log('Gmail refresh token saved to .env file');
    }

    res.send(`
      <html>
        <body>
          <h1>Authorization Successful</h1>
          <p>Your Gmail account has been successfully connected to the application.</p>
          <p>You can now close this window and return to the application.</p>
          ${tokens.refresh_token 
            ? '<p style="color: green;">Refresh token received and saved.</p>' 
            : '<p style="color: orange;">No refresh token received. You may need to revoke access and try again.</p>'}
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Error in OAuth callback:', error);
    res.status(500).send(`
      <html>
        <body>
          <h1>Authorization Error</h1>
          <p>An error occurred during the authorization process: ${error.message}</p>
          <p>Please try again or contact support.</p>
        </body>
      </html>
    `);
  }
});

module.exports = router;
