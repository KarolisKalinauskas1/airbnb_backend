# JWT-Based Password Reset System

## Overview

This project uses a stateless JWT-based password reset system instead of storing tokens in a database. This approach provides several benefits:

- **No database token storage necessary**: We don't need the `password_reset_tokens` table
- **Better security**: No tokens stored in the database means there's no database attack vector
- **Improved scalability**: No database queries needed to validate tokens
- **Built-in expiration**: JWT tokens have built-in expiration mechanisms

## How It Works

1. **When a user requests a password reset**:
   - We find the user by email
   - We generate a JWT token containing the user's ID, email, and a unique token ID
   - We send this token to the user via email

2. **When a user clicks the reset link**:
   - The frontend extracts the token from the URL
   - When submitting the new password, it sends the token to the backend
   - The backend verifies the token signature and expiration
   - If valid, it updates the password through Supabase

## Troubleshooting

If password reset isn't working:

1. **Check token format**: Use the token debugger at `/token-debugger.html` to verify tokens
2. **Check user record**: Make sure users have a valid `auth_user_id` field
3. **Check for whitespace**: Make sure tokens don't have extra whitespace or line breaks
4. **Check expiration**: Tokens expire after 1 hour

## Why Not Use Database Tokens?

The `password_reset_tokens.sql` migration file exists in the project, but we're not using it because:

1. **Security**: JWT-based tokens don't need to be stored, eliminating a potential attack vector
2. **Simplicity**: No need for database cleanup of expired tokens
3. **Reliability**: Works even if database access is temporarily unavailable
4. **Scalability**: Works well in distributed systems, no shared state required

## Fix Scripts

If you're having issues with password reset, you can run these scripts:

1. `node scripts/fix-user-auth-id.js` - Fixes users with missing auth_user_id
2. `node scripts/test-jwt-password-reset.js [email]` - Tests token generation and verification
3. `node scripts/test-password-reset-flow.js [email]` - Tests the full password reset flow
