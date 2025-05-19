# Email System Testing Guide

This guide explains how to test and troubleshoot the email system in the Camping Spots application.

## Quick Start

The easiest way to test the email functionality is to use the test script:

```powershell
node scripts/test-email-service.js --to=your-email@example.com
```

This will attempt to send both a password reset email and a welcome email to the specified address.

## Testing Specific Email Providers

### Testing Mailgun

```powershell
node scripts/test-email-service.js --provider=mailgun --to=your-email@example.com
```

### Testing Gmail OAuth

```powershell
node scripts/test-email-service.js --provider=gmail --to=your-email@example.com
```

If you haven't set up Gmail OAuth yet, you'll need to:

1. Set up Google Cloud credentials as described in the email-system.md documentation
2. Visit http://localhost:3000/api/auth/oauth/gmail/auth to authorize your Gmail account
3. After authorization, the application will store the refresh token in your .env file

## Getting Debug Information

Add the `--debug` flag to see detailed configuration information:

```powershell
node scripts/test-email-service.js --debug
```

## Troubleshooting

### Mailgun Unauthorized Error

If you see an "Unauthorized" error with Mailgun:

1. Check that your API key in the .env file is correct and complete:
   - Should start with `key-`
   - Should be 40+ characters long
   - Should be the Private API key, not the Public API key
   
2. Verify your Mailgun domain:
   - If using a sandbox domain, ensure it's still active (they can expire)
   - Check that you've added the recipient email to the authorized recipients list if using a sandbox domain

### Gmail OAuth Issues

1. If you receive "invalid_grant" errors, your refresh token may be expired. Try:
   - Delete the GMAIL_REFRESH_TOKEN from your .env file
   - Visit http://localhost:3000/api/auth/oauth/gmail/auth again to get a new token
   
2. For "invalid_client" errors:
   - Double-check your client ID and client secret
   - Make sure the redirect URI matches exactly what's configured in Google Cloud Console

## Manual Testing

You can also test the email functionality manually by triggering emails through the application:

1. **Password Reset Emails**: Visit the password reset page and enter an email address
2. **Welcome Emails**: Register a new user
3. **Booking Emails**: Create and confirm a booking
4. **Review Request Emails**: Mark a booking as completed (can be done via database)

## Further Information

For more detailed information about the email system, please refer to:

- [Email System Documentation](../docs/email-system.md)
- [API Documentation](../docs/api/README.md)
