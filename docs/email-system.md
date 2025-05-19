# Email Notification System

This document outlines the email notification system implemented in the Airbnb for Camping application. The system is designed to send various types of email notifications to users for different events in the application lifecycle.

## Supported Email Providers

The application currently supports two email providers:

1. **Mailgun** (default) - A cloud-based email service
2. **Gmail OAuth** - Using your Gmail account via Google OAuth

The system will automatically choose which provider to use based on your configuration in the `.env` file.

## Email Types

The system supports the following email notifications:

1. **Welcome Emails** - Sent to new users upon registration
2. **Booking Confirmation Emails** - Sent when a booking is confirmed
3. **Booking Cancellation Emails** - Sent when a booking is cancelled
4. **Booking Update Emails** - Sent when a booking is updated
5. **Review Request Emails** - Sent after a stay is completed to request a review
6. **Payment Confirmation Emails** - Sent when a payment is processed
7. **Booking Reminder Emails** - Sent 2 days before check-in
8. **Password Reset Emails** - Sent when a user requests a password reset

## Implementation

The email system is implemented as a service in `src/shared/services/email.service.js`. The current implementation is a stub that logs messages to the console, but it can be replaced with a real email service implementation (such as SendGrid, Mailgun, AWS SES, etc.) in production.

### Integration Points

The email service is integrated with the application at the following points:

1. **User Registration** - In `routes/auth.js` during the registration process
2. **Booking Confirmation** - In `routes/bookings.js` after a successful booking
3. **Booking Cancellation** - In `routes/bookings.js` when a booking is cancelled
4. **Completed Bookings** - In `shared/services/booking-completion.service.js` when bookings are marked as completed
5. **Upcoming Bookings** - In `shared/services/reminder.service.js` for sending booking reminders
6. **Password Reset** - In `routes/auth.js` when a user requests a password reset

### Scheduled Tasks

The application uses node-cron to schedule several email-related tasks:

1. **Daily at midnight** - Process completed bookings and send review request emails
2. **Daily at 10:00 AM** - Send booking reminders for check-ins in 2 days
3. **Every 6 hours** - Send payment reminders for pending bookings
4. **Daily at 1:00 AM** - Clean up expired pending bookings

## Production Setup

### Email Service Type Configuration

You can set the `EMAIL_SERVICE_TYPE` environment variable in your `.env` file to one of these values:

- `mailgun` - Force use of Mailgun
- `gmail` - Force use of Gmail OAuth
- `auto` - Automatically use whichever service is properly configured (default)

### Option 1: Mailgun Setup

To use Mailgun, set these variables in your `.env` file:

```
MAILGUN_API_KEY=key-your-actual-api-key
MAILGUN_DOMAIN=your-domain.mailgun.org
FROM_EMAIL="Your Name <mailbox@your-domain.mailgun.org>"
```

1. Create a Mailgun account at https://www.mailgun.com/
2. Verify your domain or use the sandbox domain provided
3. Get your API key from the Mailgun dashboard
4. Update your `.env` file with these credentials

### Option 2: Gmail OAuth Setup

To use Gmail OAuth, set these variables in your `.env` file:

```
GMAIL_CLIENT_ID=your-client-id
GMAIL_CLIENT_SECRET=your-client-secret
GMAIL_REDIRECT_URI=http://localhost:3000/api/auth/oauth/callback
```

To set up Gmail OAuth:

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable the Gmail API
4. Create OAuth credentials (OAuth client ID)
   - Application type: Web application
   - Authorized redirect URIs: http://localhost:3000/api/auth/oauth/callback
5. Copy the Client ID and Client Secret to your `.env` file
6. Run the application and visit: http://localhost:3000/api/auth/oauth/gmail/auth
7. Follow the prompts to authorize the application
8. After authorization, the refresh token will be automatically added to your `.env` file

### Option 3: Other Email Services

To set up other email providers like SendGrid:

1. Choose an email service provider (SendGrid, AWS SES, etc.)
2. Add the appropriate configuration variables to the .env file
3. Create a new service implementation file based on the existing ones

```javascript
// Example implementation using SendGrid
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

class SendGridEmailService {
  static async sendWelcomeEmail(user) {
    const msg = {
      to: user.email,
      from: process.env.EMAIL_FROM,
      subject: 'Welcome to Camping Airbnb!',
      text: `Hello ${user.full_name}, welcome to our platform...`,
      html: `<strong>Hello ${user.full_name}</strong>, welcome to our platform...`,
    };
    
    return sgMail.send(msg);
  }
  
  // Other email methods...
}
```

## Testing

You can test the email system by:

1. Setting up a test email provider (like Mailtrap)
2. Configuring the email service to use the test provider
3. Triggering the various actions that send emails (registration, booking, etc.)
4. Verifying that the emails are received in the test inbox

## Troubleshooting

### Unauthorized Error with Mailgun

If you see an "Unauthorized" error with Mailgun, your API key is likely incorrect or incomplete. Check that:

1. Your API key starts with `key-`
2. The API key is complete (typically 40+ characters)
3. You're using the Private API key, not the Public API key
4. The domain is correctly configured in your Mailgun account
5. If using a sandbox domain, ensure it's still active (they can expire)

Sample error that indicates an API key problem:
```
[EmailService] Failed to send password reset email: Unauthorized
[EmailService] Error details: [Error: Unauthorized] {
  status: 401,
  details: 'Forbidden',
  type: 'MailgunAPIError'
}
```

### Gmail OAuth Issues

1. **Invalid client ID or secret**: Double-check your credentials in the Google Cloud Console
2. **No refresh token**: Make sure you're using the correct redirect URI and that you've gone through the authorization flow at `/api/auth/oauth/gmail/auth`
3. **Access denied**: Ensure your Google Cloud project has the Gmail API enabled
4. **Token expired**: The refresh token should handle this automatically, but if you're still having issues, you may need to go through the authorization flow again

### Switching Between Providers

You can switch between email providers at any time by updating the `.env` file. If both are configured, the `EMAIL_SERVICE_TYPE` variable determines which one is used.

## Future Enhancements

Potential enhancements to the email system:

1. **Email Templates** - Create HTML templates for each email type
2. **Localization** - Support for multiple languages
3. **Email Preferences** - Allow users to customize which emails they receive
4. **Email Analytics** - Track email open rates and click-through rates
5. **Attachments** - Support for attaching files (e.g., booking confirmations as PDFs)
