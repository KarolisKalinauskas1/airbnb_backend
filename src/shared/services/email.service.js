/**
 * Email Service
 * 
 * This service provides functionality for sending emails related to user accounts and booking operations.
 * Uses Mailgun to send actual emails in production. Falls back to logging in development environments.
 */

const FormData = require('form-data');
const Mailgun = require('mailgun.js');

// Initialize Mailgun
const mailgun = new Mailgun(FormData);
const mg = mailgun.client({
  username: 'api',
  key: process.env.MAILGUN_API_KEY || 'your-mailgun-api-key',
  url: 'https://api.eu.mailgun.net'
});

// Domain for sending emails
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN || 'your-mailgun-domain.com';
const FROM_EMAIL = process.env.FROM_EMAIL || `Camping Spots <postmaster@${MAILGUN_DOMAIN}>`;

// Check if mailgun is configured
const isMailgunConfigured = process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN;

class EmailService {
  /**
   * Send a welcome email to a new user
   * @param {Object} user - The user object
   * @returns {Promise<boolean>} - Whether the email was sent successfully
   */
  static async sendWelcomeEmail(user) {
    if (!user || !user.email) {
      console.error('[EmailService] Cannot send welcome email: Missing user or email');
      return false;
    }
    
    const emailSubject = 'Welcome to Camping Spots';
    const emailText = `
      Hello ${user.full_name || 'there'},
      
      Welcome to Camping Spots! We're excited to have you join our community of camping enthusiasts.
      
      With your new account, you can:
      - Browse unique camping spots
      - Book your next outdoor adventure
      - Leave reviews for places you've stayed
      - Connect with camping spot owners
      
      If you have any questions or need assistance, please don't hesitate to contact our support team.
      
      Happy camping!
      The Camping Spots Team
    `;
    
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2a5934;">Welcome to Camping Spots!</h2>
        <p>Hello ${user.full_name || 'there'},</p>
        <p>We're excited to have you join our community of camping enthusiasts.</p>
        <p>With your new account, you can:</p>
        <ul>
          <li>Browse unique camping spots</li>
          <li>Book your next outdoor adventure</li>
          <li>Leave reviews for places you've stayed</li>
          <li>Connect with camping spot owners</li>
        </ul>
        <p>If you have any questions or need assistance, please don't hesitate to contact our support team.</p>
        <p>Happy camping!<br>The Camping Spots Team</p>
      </div>
    `;
    
    console.log(`[EmailService] Sending welcome email to ${user.email}`);
    
    try {
      if (isMailgunConfigured) {
        // Send via Mailgun
        const result = await mg.messages.create(MAILGUN_DOMAIN, {
          from: FROM_EMAIL,
          to: `${user.full_name || 'User'} <${user.email}>`,
          subject: emailSubject,
          text: emailText,
          html: emailHtml
        });
        
        console.log(`[EmailService] Welcome email sent via Mailgun to ${user.email}, ID: ${result.id}`);
        return true;
      } else {
        // Log email content for development
        console.log(`[EmailService] Would send welcome email to ${user.email}`);
        console.log(`[EmailService] Subject: ${emailSubject}`);
        console.log(`[EmailService] Text: ${emailText}`);
        return true;
      }
    } catch (error) {
      console.error(`[EmailService] Failed to send welcome email: ${error.message}`);
      return false;
    }
  }

  /**
   * Send a booking confirmation email
   * @param {Object} booking - The booking object
   * @param {Object} user - The user object
   * @returns {Promise<boolean>} - Whether the email was sent successfully
   */
  static async sendBookingConfirmation(booking, user) {
    if (!user || !user.email) {
      console.error('[EmailService] Cannot send booking confirmation email: Missing user or email');
      return false;
    }
    
    if (!booking) {
      console.error('[EmailService] Cannot send booking confirmation email: Missing booking data');
      return false;
    }
    
    // Format dates
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
    const spotName = booking.camping_spot?.name || 'your camping spot';
    const totalPrice = typeof booking.total_price === 'number' ? 
      booking.total_price.toFixed(2) : 
      booking.total_price || '0.00';
    
    const emailSubject = `Booking Confirmation: ${spotName}`;
    const emailText = `
      Hello ${user.full_name || 'there'},
      
      Thank you for booking with Camping Spots! Your reservation has been confirmed.
      
      Booking Details:
      - Camping Spot: ${spotName}
      - Check-in: ${startDate}
      - Check-out: ${endDate}
      - Total Price: $${totalPrice}
      - Booking ID: ${booking.booking_id}
      
      You can view your booking details and manage your reservation in your account dashboard.
      
      If you have any questions or need to make changes to your booking, please contact us.
      
      We hope you enjoy your stay!
      
      Regards,
      The Camping Spots Team
    `;
    
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2a5934;">Your Booking is Confirmed!</h2>
        <p>Hello ${user.full_name || 'there'},</p>
        <p>Thank you for booking with Camping Spots! Your reservation has been confirmed.</p>
        
        <div style="background-color: #f9f9f9; padding: 15px; border-radius: 4px; margin: 20px 0;">
          <h3 style="color: #2a5934; margin-top: 0;">Booking Details</h3>
          <p><strong>Camping Spot:</strong> ${spotName}</p>
          <p><strong>Check-in:</strong> ${startDate}</p>
          <p><strong>Check-out:</strong> ${endDate}</p>
          <p><strong>Total Price:</strong> $${totalPrice}</p>
          <p><strong>Booking ID:</strong> ${booking.booking_id}</p>
        </div>
        
        <p>You can view your booking details and manage your reservation in your <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/account" style="color: #2a5934; text-decoration: underline;">account dashboard</a>.</p>
        
        <p>If you have any questions or need to make changes to your booking, please contact us.</p>
        
        <p>We hope you enjoy your stay!</p>
        
        <p>Regards,<br>The Camping Spots Team</p>
      </div>
    `;
    
    console.log(`[EmailService] Sending booking confirmation email to ${user.email} for booking ID ${booking.booking_id}`);
    
    try {
      if (isMailgunConfigured) {
        // Send via Mailgun
        const result = await mg.messages.create(MAILGUN_DOMAIN, {
          from: FROM_EMAIL,
          to: `${user.full_name || 'User'} <${user.email}>`,
          subject: emailSubject,
          text: emailText,
          html: emailHtml
        });
        
        console.log(`[EmailService] Booking confirmation email sent via Mailgun to ${user.email}, ID: ${result.id}`);
        return true;
      } else {
        // Log email content for development
        console.log(`[EmailService] Would send booking confirmation for booking ID ${booking.booking_id} to ${user.email}`);
        console.log(`[EmailService] Subject: ${emailSubject}`);
        console.log(`[EmailService] Text: ${emailText}`);
        return true;
      }
    } catch (error) {
      console.error(`[EmailService] Failed to send booking confirmation email: ${error.message}`);
      return false;
    }
  }

  /**
   * Send a booking cancellation email
   * @param {Object} booking - The booking object
   * @param {Object} user - The user object
   * @returns {Promise<boolean>} - Whether the email was sent successfully
   */
  static async sendBookingCancellation(booking, user) {
    if (!user || !user.email) {
      console.error('[EmailService] Cannot send booking cancellation email: Missing user or email');
      return false;
    }
    
    if (!booking) {
      console.error('[EmailService] Cannot send booking cancellation email: Missing booking data');
      return false;
    }
    
    // Format dates
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
    const spotName = booking.camping_spot?.name || 'the camping spot';
    
    const emailSubject = `Booking Cancellation: ${spotName}`;
    const emailText = `
      Hello ${user.full_name || 'there'},
      
      Your booking for ${spotName} from ${startDate} to ${endDate} has been cancelled.
      
      Booking Details:
      - Camping Spot: ${spotName}
      - Check-in (cancelled): ${startDate}
      - Check-out (cancelled): ${endDate}
      - Booking ID: ${booking.booking_id}
      
      If you did not request this cancellation, please contact our support team immediately.
      
      If you initiated this cancellation, any applicable refund will be processed according to our cancellation policy.
      
      Thank you for using Camping Spots.
      
      Regards,
      The Camping Spots Team
    `;
    
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2a5934;">Booking Cancellation</h2>
        <p>Hello ${user.full_name || 'there'},</p>
        <p>Your booking for <strong>${spotName}</strong> from ${startDate} to ${endDate} has been cancelled.</p>
        
        <div style="background-color: #f9f9f9; padding: 15px; border-radius: 4px; margin: 20px 0;">
          <h3 style="color: #2a5934; margin-top: 0;">Booking Details</h3>
          <p><strong>Camping Spot:</strong> ${spotName}</p>
          <p><strong>Check-in (cancelled):</strong> ${startDate}</p>
          <p><strong>Check-out (cancelled):</strong> ${endDate}</p>
          <p><strong>Booking ID:</strong> ${booking.booking_id}</p>
        </div>
        
        <p>If you did not request this cancellation, please contact our support team immediately.</p>
        
        <p>If you initiated this cancellation, any applicable refund will be processed according to our cancellation policy.</p>
        
        <p>Thank you for using Camping Spots.</p>
        
        <p>Regards,<br>The Camping Spots Team</p>
      </div>
    `;
    
    console.log(`[EmailService] Sending booking cancellation email to ${user.email} for booking ID ${booking.booking_id}`);
    
    try {
      if (isMailgunConfigured) {
        // Send via Mailgun
        const result = await mg.messages.create(MAILGUN_DOMAIN, {
          from: FROM_EMAIL,
          to: `${user.full_name || 'User'} <${user.email}>`,
          subject: emailSubject,
          text: emailText,
          html: emailHtml
        });
        
        console.log(`[EmailService] Booking cancellation email sent via Mailgun to ${user.email}, ID: ${result.id}`);
        return true;
      } else {
        // Log email content for development
        console.log(`[EmailService] Would send booking cancellation for booking ID ${booking.booking_id} to ${user.email}`);
        console.log(`[EmailService] Subject: ${emailSubject}`);
        console.log(`[EmailService] Text: ${emailText}`);
        return true;
      }
    } catch (error) {
      console.error(`[EmailService] Failed to send booking cancellation email: ${error.message}`);
      return false;
    }
  }

  /**
   * Send a booking update email
   * @param {Object} booking - The booking object
   * @param {Object} user - The user object
   * @returns {Promise<boolean>} - Whether the email was sent successfully
   */
  static async sendBookingUpdate(booking, user) {
    if (!user || !user.email) {
      console.error('[EmailService] Cannot send booking update email: Missing user or email');
      return false;
    }
    
    if (!booking) {
      console.error('[EmailService] Cannot send booking update email: Missing booking data');
      return false;
    }
    
    // Format dates
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
    const spotName = booking.camping_spot?.name || 'your camping spot';
    
    const emailSubject = `Booking Update: ${spotName}`;
    const emailText = `
      Hello ${user.full_name || 'there'},
      
      Your booking details for ${spotName} have been updated.
      
      Updated Booking Details:
      - Camping Spot: ${spotName}
      - Check-in: ${startDate}
      - Check-out: ${endDate}
      - Booking ID: ${booking.booking_id}
      - Status: ${booking.status || 'Current'}
      
      You can view your updated booking details in your account dashboard.
      
      If you did not request these changes or have any questions, please contact our support team.
      
      Thank you for choosing Camping Spots.
      
      Regards,
      The Camping Spots Team
    `;
    
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2a5934;">Booking Update</h2>
        <p>Hello ${user.full_name || 'there'},</p>
        <p>Your booking details for <strong>${spotName}</strong> have been updated.</p>
        
        <div style="background-color: #f9f9f9; padding: 15px; border-radius: 4px; margin: 20px 0;">
          <h3 style="color: #2a5934; margin-top: 0;">Updated Booking Details</h3>
          <p><strong>Camping Spot:</strong> ${spotName}</p>
          <p><strong>Check-in:</strong> ${startDate}</p>
          <p><strong>Check-out:</strong> ${endDate}</p>
          <p><strong>Booking ID:</strong> ${booking.booking_id}</p>
          <p><strong>Status:</strong> ${booking.status || 'Current'}</p>
        </div>
        
        <p>You can view your updated booking details in your <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/account" style="color: #2a5934; text-decoration: underline;">account dashboard</a>.</p>
        
        <p>If you did not request these changes or have any questions, please contact our support team.</p>
        
        <p>Thank you for choosing Camping Spots.</p>
        
        <p>Regards,<br>The Camping Spots Team</p>
      </div>
    `;
    
    console.log(`[EmailService] Sending booking update email to ${user.email} for booking ID ${booking.booking_id}`);
    
    try {
      if (isMailgunConfigured) {
        // Send via Mailgun
        const result = await mg.messages.create(MAILGUN_DOMAIN, {
          from: FROM_EMAIL,
          to: `${user.full_name || 'User'} <${user.email}>`,
          subject: emailSubject,
          text: emailText,
          html: emailHtml
        });
        
        console.log(`[EmailService] Booking update email sent via Mailgun to ${user.email}, ID: ${result.id}`);
        return true;
      } else {
        // Log email content for development
        console.log(`[EmailService] Would send booking update for booking ID ${booking.booking_id} to ${user.email}`);
        console.log(`[EmailService] Subject: ${emailSubject}`);
        console.log(`[EmailService] Text: ${emailText}`);
        return true;
      }
    } catch (error) {
      console.error(`[EmailService] Failed to send booking update email: ${error.message}`);
      return false;
    }
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
      console.error('[EmailService] Cannot send review request email: Missing user or email');
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

    console.log(`[EmailService] Sending review request email to ${user.email} for spot "${spot.title}"`);
    
    try {
      if (isMailgunConfigured) {
        // Send via Mailgun
        const result = await mg.messages.create(MAILGUN_DOMAIN, {
          from: FROM_EMAIL,
          to: `${user.full_name || 'User'} <${user.email}>`,
          subject: emailSubject,
          text: emailText,
          html: emailHtml
        });
        
        console.log(`[EmailService] Review request email sent via Mailgun to ${user.email}, ID: ${result.id}`);
        return true;
      } else {
        // Log email content for development
        console.log(`[EmailService] Would send review request for booking ID ${booking.id || 'unknown'} at spot "${spot.title || 'unknown'}" to user ${user.email || 'unknown'}`);
        console.log(`[EmailService] Subject: ${emailSubject}`);
        console.log(`[EmailService] Text: ${emailText}`);
        return true;
      }
    } catch (error) {
      console.error(`[EmailService] Failed to send review request email: ${error.message}`);
      return false;
    }
  }

  /**
   * Send a payment confirmation email
   * @param {Object} booking - The booking object
   * @param {Object} user - The user object
   * @param {Object} payment - The payment object
   * @returns {Promise<boolean>} - Whether the email was sent successfully
   */
  static async sendPaymentConfirmation(booking, user, payment) {
    if (!user || !user.email) {
      console.error('[EmailService] Cannot send payment confirmation email: Missing user or email');
      return false;
    }
    
    if (!booking) {
      console.error('[EmailService] Cannot send payment confirmation email: Missing booking data');
      return false;
    }
    
    const spotName = booking.camping_spot?.name || 'your camping spot';
    const amount = payment?.amount || booking.total_price || '0.00';
    const formattedAmount = typeof amount === 'number' ? amount.toFixed(2) : amount;
    const bookingId = booking.booking_id || booking.id || 'unknown';
    const paymentId = payment?.id || 'unknown';
    
    const emailSubject = `Payment Confirmation: ${spotName}`;
    const emailText = `
      Hello ${user.full_name || 'there'},
      
      Thank you for your payment! We've successfully processed your payment for ${spotName}.
      
      Payment Details:
      - Amount: $${formattedAmount}
      - Payment ID: ${paymentId}
      - Booking ID: ${bookingId}
      - Camping Spot: ${spotName}
      
      You can view your booking and payment details in your account dashboard.
      
      Thank you for choosing Camping Spots for your outdoor adventure!
      
      Regards,
      The Camping Spots Team
    `;
    
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2a5934;">Payment Confirmation</h2>
        <p>Hello ${user.full_name || 'there'},</p>
        <p>Thank you for your payment! We've successfully processed your payment for <strong>${spotName}</strong>.</p>
        
        <div style="background-color: #f9f9f9; padding: 15px; border-radius: 4px; margin: 20px 0;">
          <h3 style="color: #2a5934; margin-top: 0;">Payment Details</h3>
          <p><strong>Amount:</strong> $${formattedAmount}</p>
          <p><strong>Payment ID:</strong> ${paymentId}</p>
          <p><strong>Booking ID:</strong> ${bookingId}</p>
          <p><strong>Camping Spot:</strong> ${spotName}</p>
        </div>
        
        <p>You can view your booking and payment details in your <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/account" style="color: #2a5934; text-decoration: underline;">account dashboard</a>.</p>
        
        <p>Thank you for choosing Camping Spots for your outdoor adventure!</p>
        
        <p>Regards,<br>The Camping Spots Team</p>
      </div>
    `;
    
    console.log(`[EmailService] Sending payment confirmation email to ${user.email} for booking ID ${bookingId}`);
    
    try {
      if (isMailgunConfigured) {
        // Send via Mailgun
        const result = await mg.messages.create(MAILGUN_DOMAIN, {
          from: FROM_EMAIL,
          to: `${user.full_name || 'User'} <${user.email}>`,
          subject: emailSubject,
          text: emailText,
          html: emailHtml
        });
        
        console.log(`[EmailService] Payment confirmation email sent via Mailgun to ${user.email}, ID: ${result.id}`);
        return true;
      } else {
        // Log email content for development
        console.log(`[EmailService] Would send payment confirmation for amount ${formattedAmount} for booking ID ${bookingId} to ${user.email}`);
        console.log(`[EmailService] Subject: ${emailSubject}`);
        console.log(`[EmailService] Text: ${emailText}`);
        return true;
      }
    } catch (error) {
      console.error(`[EmailService] Failed to send payment confirmation email: ${error.message}`);
      return false;
    }
  }

  /**
   * Send a booking reminder email (e.g., 2 days before check-in)
   * @param {Object} booking - The booking object
   * @param {Object} user - The user object
   * @returns {Promise<boolean>} - Whether the email was sent successfully
   */
  static async sendBookingReminder(booking, user) {
    if (!user || !user.email) {
      console.error('[EmailService] Cannot send booking reminder email: Missing user or email');
      return false;
    }
    
    if (!booking) {
      console.error('[EmailService] Cannot send booking reminder email: Missing booking data');
      return false;
    }
    
    // Format dates
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
    const spotName = booking.camping_spot?.name || 'your camping spot';
    const bookingId = booking.booking_id || booking.id || 'unknown';
    const daysUntilArrival = Math.ceil((new Date(booking.start_date) - new Date()) / (1000 * 60 * 60 * 24));
    
    const emailSubject = `Reminder: Your Upcoming Stay at ${spotName}`;
    const emailText = `
      Hello ${user.full_name || 'there'},
      
      This is a friendly reminder about your upcoming camping trip!
      
      Your stay at ${spotName} is just ${daysUntilArrival} day${daysUntilArrival !== 1 ? 's' : ''} away!
      
      Booking Details:
      - Camping Spot: ${spotName}
      - Check-in: ${startDate}
      - Check-out: ${endDate}
      - Booking ID: ${bookingId}
      
      Don't forget to check the weather forecast and pack accordingly. We recommend arriving before sunset for a smooth check-in experience.
      
      You can view your booking details in your account dashboard.
      
      We look forward to hosting you soon!
      
      Regards,
      The Camping Spots Team
    `;
    
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2a5934;">Your Camping Trip is Almost Here!</h2>
        <p>Hello ${user.full_name || 'there'},</p>
        <p>This is a friendly reminder about your upcoming camping trip!</p>
        <p style="font-size: 18px; font-weight: bold;">Your stay at <span style="color: #2a5934;">${spotName}</span> is just ${daysUntilArrival} day${daysUntilArrival !== 1 ? 's' : ''} away!</p>
        
        <div style="background-color: #f9f9f9; padding: 15px; border-radius: 4px; margin: 20px 0;">
          <h3 style="color: #2a5934; margin-top: 0;">Booking Details</h3>
          <p><strong>Camping Spot:</strong> ${spotName}</p>
          <p><strong>Check-in:</strong> ${startDate}</p>
          <p><strong>Check-out:</strong> ${endDate}</p>
          <p><strong>Booking ID:</strong> ${bookingId}</p>
        </div>
        
        <p>Don't forget to check the weather forecast and pack accordingly. We recommend arriving before sunset for a smooth check-in experience.</p>
        
        <p>You can view your booking details in your <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/account" style="color: #2a5934; text-decoration: underline;">account dashboard</a>.</p>
        
        <p>We look forward to hosting you soon!</p>
        
        <p>Regards,<br>The Camping Spots Team</p>
      </div>
    `;
    
    console.log(`[EmailService] Sending booking reminder email to ${user.email} for booking ID ${bookingId}`);
    
    try {
      if (isMailgunConfigured) {
        // Send via Mailgun
        const result = await mg.messages.create(MAILGUN_DOMAIN, {
          from: FROM_EMAIL,
          to: `${user.full_name || 'User'} <${user.email}>`,
          subject: emailSubject,
          text: emailText,
          html: emailHtml
        });
        
        console.log(`[EmailService] Booking reminder email sent via Mailgun to ${user.email}, ID: ${result.id}`);
        return true;
      } else {
        // Log email content for development
        console.log(`[EmailService] Would send booking reminder for booking ID ${bookingId} to ${user.email}`);
        console.log(`[EmailService] Subject: ${emailSubject}`);
        console.log(`[EmailService] Text: ${emailText}`);
        return true;
      }
    } catch (error) {
      console.error(`[EmailService] Failed to send booking reminder email: ${error.message}`);
      return false;
    }
  }

  /**
   * Send a password reset email
   * @param {Object} user - The user object
   * @param {string} resetToken - The password reset token
   * @returns {Promise<boolean>} - Whether the email was sent successfully
   */
  static async sendPasswordResetEmail(user, resetToken) {
    if (!user || !user.email) {
      console.error('[EmailService] Cannot send password reset email: Missing user or email');
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

    console.log(`[EmailService] Sending password reset email to ${user.email}`);
      try {
      if (isMailgunConfigured) {
        // Send via Mailgun
        console.log(`[EmailService] Attempting to send password reset email via Mailgun to ${user.email} using domain: ${MAILGUN_DOMAIN}`);
        console.log(`[EmailService] Mailgun API key prefix: ${process.env.MAILGUN_API_KEY.substring(0, 8)}...`);
        
        const result = await mg.messages.create(MAILGUN_DOMAIN, {
          from: FROM_EMAIL,
          to: `${user.full_name || 'User'} <${user.email}>`,
          subject: emailSubject,
          text: emailText,
          html: emailHtml
        });
        
        console.log(`[EmailService] Password reset email sent via Mailgun to ${user.email}, ID: ${result.id}`);
        return true;
      } else {
        // Log email content for development
        console.log(`[EmailService] Would send password reset email with token to user ${user.email}`);
        console.log(`[EmailService] Subject: ${emailSubject}`);
        console.log(`[EmailService] Text: ${emailText}`);
        console.log(`[EmailService] Mailgun not configured - MAILGUN_API_KEY: ${process.env.MAILGUN_API_KEY ? "Present" : "Missing"}, MAILGUN_DOMAIN: ${process.env.MAILGUN_DOMAIN ? process.env.MAILGUN_DOMAIN : "Missing"}`);
        return true;
      }
    } catch (error) {
      console.error(`[EmailService] Failed to send password reset email: ${error.message}`);
      console.error(`[EmailService] Error details:`, error);
      return false;
    }
  }
}

module.exports = EmailService;
