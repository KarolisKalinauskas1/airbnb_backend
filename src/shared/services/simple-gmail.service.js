/**
 * Simple Gmail Email Service using Nodemailer with App Password
 * 
 * This service provides a simpler alternative to OAuth for sending emails via Gmail.
 * It uses an "App Password" instead of OAuth, which is easier to set up but less secure.
 */

const nodemailer = require('nodemailer');

// Check if simple Gmail is configured
const isGmailConfigured = process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD;

// Create transport with Gmail app password
let transporter = null;
if (isGmailConfigured) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD
    }
  });
}

class SimpleGmailService {
  /**
   * Send an email using Gmail SMTP
   * @param {String} to - Recipient email address
   * @param {String} subject - Email subject
   * @param {String} text - Plain text version of email
   * @param {String} html - HTML version of email
   * @returns {Promise<boolean>} - Whether the email was sent successfully
   */  static async sendEmail(to, subject, text, html) {
    if (!isGmailConfigured) {
      console.log(`[SimpleGmailService] Gmail not configured, would send email to ${to}`);
      console.log(`[SimpleGmailService] Subject: ${subject}`);
      console.log(`[SimpleGmailService] Text: ${text}`);
      return true; // Return true in development mode
    }

    try {
      // Make sure we have a transporter
      if (!transporter) {
        console.error('[SimpleGmailService] Transporter not initialized');
        return false;
      }
      
      const mailOptions = {
        from: process.env.FROM_EMAIL || `"Camping Spots" <${process.env.GMAIL_USER}>`,
        to,
        subject,
        text,
        html: html || text
      };
      
      const info = await transporter.sendMail(mailOptions);
      console.log(`[SimpleGmailService] Email sent successfully to ${to}, ID: ${info.messageId}`);
      return true;
    } catch (error) {
      console.error(`[SimpleGmailService] Failed to send email: ${error.message}`);
      console.error('[SimpleGmailService] Error details:', error);
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
      console.error('[SimpleGmailService] Cannot send welcome email: Missing user or email');
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
      console.error('[SimpleGmailService] Cannot send booking confirmation: Missing user or email');
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
   * Send a payment success email
   * @param {Object} booking - The booking object with complete details
   * @param {Object} user - The user object
   * @param {Object} spot - The camping spot object
   * @param {Number} amount - The payment amount
   * @returns {Promise<boolean>} - Whether the email was sent successfully
   */
  static async sendPaymentSuccessEmail(booking, user, spot, amount) {
    if (!user || !user.email) {
      console.error('[SimpleGmailService] Cannot send payment success email: Missing user or email');
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
    
    // Calculate number of nights
    const startDateObj = new Date(booking.start_date);
    const endDateObj = new Date(booking.end_date);
    const nights = Math.round((endDateObj - startDateObj) / (1000 * 60 * 60 * 24));
    
    // Format amount for display
    const formattedAmount = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);

    const subject = `Payment Confirmation - Your Camping Booking (#${booking.booking_id})`;
    const text = `
      Hello ${user.full_name || 'there'},
      
      Thank you for your payment! Your booking at ${spot.title} has been confirmed.
      
      Booking Details:
      - Booking ID: ${booking.booking_id}
      - Location: ${spot.title}
      - Check-in: ${startDate}
      - Check-out: ${endDate}
      - Number of nights: ${nights}
      - Number of guests: ${booking.number_of_guests}
      - Total amount: ${formattedAmount}
      
      You can view your booking details in your account dashboard.
      
      Thank you for choosing Camping Spots. We hope you have a wonderful camping experience!
      
      The Camping Spots Team
    `;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 5px; padding: 20px;">
        <h2 style="color: #2a5934; text-align: center;">Payment Successful!</h2>
        <p>Hello ${user.full_name || 'there'},</p>
        <p>Thank you for your payment! Your booking at <strong>${spot.title}</strong> has been confirmed.</p>
        
        <div style="background-color: #f7f7f7; border-radius: 5px; padding: 15px; margin: 20px 0;">
          <h3 style="color: #2a5934; margin-top: 0;">Booking Details</h3>
          <p><strong>Booking ID:</strong> #${booking.booking_id}</p>
          <p><strong>Location:</strong> ${spot.title}</p>
          <p><strong>Check-in:</strong> ${startDate}</p>
          <p><strong>Check-out:</strong> ${endDate}</p>
          <p><strong>Number of nights:</strong> ${nights}</p>
          <p><strong>Number of guests:</strong> ${booking.number_of_guests}</p>
          <p><strong>Total amount:</strong> ${formattedAmount}</p>
        </div>
          <p>You can view your booking details in your account dashboard.</p>
        <p style="text-align: center; margin-top: 30px;">
          <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/account" style="background-color: #2a5934; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">Go to Your Account</a>
        </p>
        
        <p>Thank you for choosing Camping Spots. We hope you have a wonderful camping experience!</p>
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
      console.error('[SimpleGmailService] Cannot send review request email: Missing user or email');
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
      console.error('[SimpleGmailService] Cannot send password reset email: Missing user or email');
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

    console.log(`[SimpleGmailService] Sending password reset email to ${user.email}`);
    return this.sendEmail(user.email, emailSubject, emailText, emailHtml);
  }
}

module.exports = SimpleGmailService;
