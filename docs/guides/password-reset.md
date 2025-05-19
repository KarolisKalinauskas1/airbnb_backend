# Password Reset System

## Overview

The password reset system uses stateless JWT (JSON Web Token) tokens to securely handle password resets without storing tokens in the database, improving security and scalability.

## Key Features

- **Stateless Design**: No tokens stored in database, reducing attack surface
- **JWT-based Security**: Tokens are signed and time-limited
- **Token Uniqueness**: Each token has a unique ID to prevent reuse
- **Expiration**: Tokens automatically expire after 1 hour
- **User Verification**: Tokens contain user ID and email for validation

## How It Works

1. **Request a Password Reset**
   - User requests password reset by providing their email
   - System verifies the email exists in the database
   - A JWT token is generated with the user's ID and email
   - Token is sent to the user's email address

2. **Token Structure**
   - `userId`: ID of the user requesting reset
   - `email`: Email address of the user
   - `tokenId`: Unique ID for this token (prevents replay attacks)
   - `type`: Set to 'password-reset' for validation
   - `exp`: Expiration timestamp (1 hour)

3. **Password Update Process**
   - User clicks link in email which contains the JWT token
   - Frontend displays password reset form
   - User submits new password + token
   - Backend verifies the token signature and expiration
   - If valid, user's password is updated
   - If invalid/expired, error is returned

## Security Benefits

- No token storage in database, eliminating database attack vector
- Tokens cannot be reused after password change
- Tokens automatically expire after a short time
- Tokens are cryptographically signed to prevent tampering
- No knowledge of current password required

## Implementation

The password reset system is implemented in these key files:

- `src/shared/services/password-reset.service.js`: Handles token generation and verification
- `src/routes/auth.js`: Contains the password reset request and update endpoints
- `src/shared/services/email-service-factory.js`: Determines which email service to use
- Email services: Send the password reset emails with secure tokens

## Testing

Use the test script to verify the password reset flow:

```bash
node scripts/test-jwt-password-reset.js [email]
```

To test with email sending:

```bash
node scripts/test-jwt-password-reset.js [email] --send-email
```
