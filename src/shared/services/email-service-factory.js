/**
 * Email Service Factory
 * 
 * This factory determines which email service to use based on configuration.
 * It supports Mailgun, Gmail OAuth, and Simple Gmail (App Password) email services.
 */

const MailgunEmailService = require('./email.service');
const GmailEmailService = require('./gmail-email.service');
const SimpleGmailService = require('./simple-gmail.service');

// Determine if Mailgun is configured
const isMailgunConfigured = process.env.MAILGUN_API_KEY && 
                           process.env.MAILGUN_API_KEY.startsWith('key-') && 
                           process.env.MAILGUN_API_KEY.length > 20 &&
                           process.env.MAILGUN_DOMAIN;

// Determine if Gmail OAuth is configured
const isGmailConfigured = process.env.GMAIL_CLIENT_ID && 
                         process.env.GMAIL_CLIENT_SECRET && 
                         process.env.GMAIL_REFRESH_TOKEN;
                         
// Determine if Simple Gmail is configured
const isSimpleGmailConfigured = process.env.GMAIL_USER && 
                               process.env.GMAIL_APP_PASSWORD;

// Determine which email service to use
const emailServiceType = process.env.EMAIL_SERVICE_TYPE || 'auto';

class EmailServiceFactory {
  /**
   * Get the appropriate email service based on configuration
   * @returns {Object} The email service to use
   */
  static getEmailService() {
    // Use explicit configuration if provided
    if (emailServiceType === 'gmail') {
      if (isGmailConfigured) {
        console.log('[EmailServiceFactory] Using Gmail OAuth email service');
        return GmailEmailService;
      } 
      else if (isSimpleGmailConfigured) {
        console.log('[EmailServiceFactory] Using Simple Gmail (App Password) email service');
        return SimpleGmailService;
      }
    }
    
    if (emailServiceType === 'simplegmail' && isSimpleGmailConfigured) {
      console.log('[EmailServiceFactory] Using Simple Gmail (App Password) email service');
      return SimpleGmailService;
    }
    
    if (emailServiceType === 'mailgun' && isMailgunConfigured) {
      console.log('[EmailServiceFactory] Using Mailgun email service');
      return MailgunEmailService;
    }
    
    // Auto-detect if not explicitly configured
    if (emailServiceType === 'auto') {
      if (isSimpleGmailConfigured) {
        console.log('[EmailServiceFactory] Auto-detected Simple Gmail (App Password) email service');
        return SimpleGmailService;
      }
      
      if (isGmailConfigured) {
        console.log('[EmailServiceFactory] Auto-detected Gmail OAuth email service');
        return GmailEmailService;
      }
      
      if (isMailgunConfigured) {
        console.log('[EmailServiceFactory] Auto-detected Mailgun email service');
        return MailgunEmailService;
      }
    }
    
    // Fallback to Mailgun (which will just log messages in dev mode if not configured)
    console.log('[EmailServiceFactory] No email service fully configured, using development mode');
    return MailgunEmailService;
  }
  /**
   * Send a password reset email
   * @param {Object} user - The user object
   * @param {string} resetToken - The password reset token
   * @returns {Promise<boolean>} - Whether the email was sent successfully
   */
  static async sendPasswordResetEmail(user, resetToken) {
    // Get the appropriate email service and call its sendPasswordResetEmail method
    const emailService = this.getEmailService();
    return emailService.sendPasswordResetEmail(user, resetToken);
  }
}

// Get the default email service
const defaultEmailService = EmailServiceFactory.getEmailService();

// Export both the factory class and the default service
module.exports = defaultEmailService;
module.exports.EmailServiceFactory = EmailServiceFactory;
