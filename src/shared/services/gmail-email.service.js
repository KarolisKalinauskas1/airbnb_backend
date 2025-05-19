/**
 * Gmail OAuth Email Service
 * 
 * This service provides functionality for sending emails using Gmail API with OAuth2 authentication.
 * It implements the same interface as the regular EmailService, making it compatible with existing code.
 */

const { google } = require('googleapis');
const { OAuth2 } = google.auth;

// OAuth configuration
const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REDIRECT_URI = process.env.GMAIL_REDIRECT_URI || 'http://localhost:3000/api/auth/oauth/callback';
const REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;

// Create OAuth client
const oauth2Client = new OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

// Set credentials if refresh token is available
if (REFRESH_TOKEN) {
  oauth2Client.setCredentials({
    refresh_token: REFRESH_TOKEN
  });
}

// Check if Gmail OAuth is configured
const isGmailConfigured = process.env.GMAIL_CLIENT_ID && 
                         process.env.GMAIL_CLIENT_SECRET && 
                         process.env.GMAIL_REFRESH_TOKEN;

class GmailEmailService {
  /**
   * Generate OAuth URL for user to authorize the application
   * @returns {String} - Authorization URL
   */
  static getAuthorizationUrl() {
    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent', // To always get a refresh token
      scope: ['https://www.googleapis.com/auth/gmail.send']
    });
  }

  /**
   * Exchange authorization code for tokens
   * @param {String} code - Authorization code from redirect
   * @returns {Object} - Tokens including refresh_token
   */
  static async getTokensFromCode(code) {
    try {
      const { tokens } = await oauth2Client.getToken(code);
      return tokens;
    } catch (error) {
      console.error('Error getting tokens:', error);
      throw error;
    }
  }

  /**
   * Send an email using Gmail API
   * @param {String} to - Recipient email address
   * @param {String} subject - Email subject
   * @param {String} text - Plain text version of email
   * @param {String} html - HTML version of email
   * @returns {Promise<boolean>} - Whether the email was sent successfully
   */
  static async sendEmail(to, subject, text, html) {
    if (!isGmailConfigured) {
      console.log(`[GmailEmailService] Gmail OAuth not configured, would send email to ${to}`);
      console.log(`[GmailEmailService] Subject: ${subject}`);
      return true; // Return true in development mode
    }

    try {
      // Refresh token if needed
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      
      // Create email content
      const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
      const messageParts = [
        `From: ${process.env.FROM_EMAIL || 'Camping Spots <noreply@example.com>'}`,
        `To: ${to}`,
        `Content-Type: text/html; charset=utf-8`,
        `MIME-Version: 1.0`,
        `Subject: ${utf8Subject}`,
        ``,
        html || text
      ];
      const message = messageParts.join('\n');

      // Encode the message
      const encodedMessage = Buffer.from(message)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      // Send the message
      const res = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedMessage
        }
      });

      console.log(`[GmailEmailService] Email sent successfully to ${to}, ID: ${res.data.id}`);
      return true;
    } catch (error) {
      console.error(`[GmailEmailService] Failed to send email: ${error.message}`);
      console.error('[GmailEmailService] Error details:', error);
      return false;
    }
  }

  /**
   * Send a welcome email to a new user
   * @param {Object} user - The user object
   * @returns {Promise<boolean>} - Whether the email was sent successfully
   */
  static async sendWelcomeEmail(user) {
    if (!user || !user.email) {
      console.error('[GmailEmailService] Cannot send welcome email: Missing user or email');
      return false;
    }

    const subject = 'Welcome to Camping Spots!';
    const text = `
      Hello ${user.full_name || 'there'},
      
      Thank you for joining Camping Spots! We're excited to have you on board.
      
      You can now browse and book unique camping experiences.
      
      If you have any questions, feel free to contact our support team.
      
      Happy camping!
      The Camping Spots Team
    `;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2a5934;">Welcome to Camping Spots!</h2>
        <p>Hello ${user.full_name || 'there'},</p>
        <p>Thank you for joining Camping Spots! We're excited to have you on board.</p>
        <p>You can now browse and book unique camping experiences.</p>
        <p>If you have any questions, feel free to contact our support team.</p>
        <p>Happy camping!<br>The Camping Spots Team</p>
      </div>
    `;

    return this.sendEmail(user.email, subject, text, html);
  }

  /**
   * Send a booking confirmation email
   * @param {Object} booking - The booking object
   * @param {Object} user - The user object
   * @returns {Promise<boolean>} - Whether the email was sent successfully
   */
  static async sendBookingConfirmation(booking, user) {
    if (!user || !user.email) {
      console.error('[GmailEmailService] Cannot send booking confirmation: Missing user or email');
      return false;
    }

    const subject = `Booking Confirmation - ${booking?.id || 'unknown'}`;
    const text = `
      Hello ${user.full_name || 'there'},
      
      Your booking has been confirmed!
      
      Booking ID: ${booking?.id || 'unknown'}
      
      Thank you for choosing Camping Spots.
      
      The Camping Spots Team
    `;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2a5934;">Booking Confirmation</h2>
        <p>Hello ${user.full_name || 'there'},</p>
        <p>Your booking has been confirmed!</p>
        <p>Booking ID: ${booking?.id || 'unknown'}</p>
        <p>Thank you for choosing Camping Spots.</p>
        <p>The Camping Spots Team</p>
      </div>
    `;

    return this.sendEmail(user.email, subject, text, html);
  }

  /**
   * Send a review request email after a completed stay
   * @param {Object} booking - The completed booking object
   * @param {Object} user - The user object
   * @param {Object} spot - The camping spot object
   * @returns {Promise<boolean>} - Whether the email was sent successfully
   */
  static async sendReviewRequestEmail(booking, user, spot) {
    if (!user || !user.email) {
      console.error('[GmailEmailService] Cannot send review request email: Missing user or email');
      return false;
    }

    // Format dates for display
    const formatDate = (dateStr) => {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    };
    
    const startDate = formatDate(booking.start_date);
    const endDate = formatDate(booking.end_date);
    
    // Create review URL
    const reviewUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/review/${booking.booking_id}`;
    
    const emailSubject = `How was your stay at ${spot.title}?`;
    const emailText = `
      Hello ${user.full_name || 'there'},
      
      Thank you for staying at ${spot.title} from ${startDate} to ${endDate}.
      
      We hope you had a great experience! Your feedback is important to us and helps other campers find great spots.
      
      Please take a moment to leave a review:
      ${reviewUrl}
      
      Thanks,
      The Camping Spots Team
    `;
    
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2a5934;">How was your camping experience?</h2>
        <p>Hello ${user.full_name || 'there'},</p>
        <p>Thank you for staying at <strong>${spot.title}</strong> from ${startDate} to ${endDate}.</p>
        <p>We hope you had a great experience! Your feedback is important to us and helps other campers find great spots.</p>
        <p style="text-align: center;">
          <a href="${reviewUrl}" style="background-color: #2a5934; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">Leave a Review</a>
        </p>
        <p>Thanks,<br>The Camping Spots Team</p>
      </div>
    `;

    return this.sendEmail(user.email, emailSubject, emailText, emailHtml);
  }

  /**
   * Send a password reset email
   * @param {Object} user - The user object
   * @param {string} resetToken - The password reset token
   * @returns {Promise<boolean>} - Whether the email was sent successfully
   */
  static async sendPasswordResetEmail(user, resetToken) {
    if (!user || !user.email) {
      console.error('[GmailEmailService] Cannot send password reset email: Missing user or email');
      return false;
    }

    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${resetToken}`;
    
    const emailSubject = 'Reset Your Camping Spots Password';
    const emailText = `
      Hello ${user.full_name || 'there'},
      
      You recently requested to reset your password for your Camping Spots account.
      
      Please click the link below to reset your password:
      ${resetUrl}
      
      If you did not request a password reset, please ignore this email or contact support if you have concerns.
      
      This link will expire in 1 hour.
      
      Thanks,
      The Camping Spots Team
    `;
    
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2a5934;">Reset Your Camping Spots Password</h2>
        <p>Hello ${user.full_name || 'there'},</p>
        <p>You recently requested to reset your password for your Camping Spots account.</p>
        <p>Please click the button below to reset your password:</p>
        <p style="text-align: center;">
          <a href="${resetUrl}" style="background-color: #2a5934; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">Reset Password</a>
        </p>
        <p>If you did not request a password reset, please ignore this email or contact support if you have concerns.</p>
        <p>This link will expire in 1 hour.</p>
        <p>Thanks,<br>The Camping Spots Team</p>
      </div>
    `;

    console.log(`[GmailEmailService] Sending password reset email to ${user.email}`);
    return this.sendEmail(user.email, emailSubject, emailText, emailHtml);
  }
}

module.exports = GmailEmailService;
