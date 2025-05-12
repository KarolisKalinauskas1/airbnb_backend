const formData = require('form-data');
const Mailgun = require('mailgun.js');
const mailgun = new Mailgun(formData);

// Initialize Mailgun client
const mg = mailgun.client({
  username: 'api',
  key: process.env.MAILGUN_API_KEY,
});

const DOMAIN = process.env.MAILGUN_DOMAIN;
const FROM_EMAIL = `CampingSpot <noreply@${DOMAIN}>`;

// Email templates
const emailTemplates = {
  welcome: (userName) => ({
    subject: 'Welcome to CampingSpot!',
    text: `Hi ${userName},\n\nWelcome to CampingSpot! We're excited to have you join our community of camping enthusiasts.\n\nStart exploring amazing camping spots and create unforgettable memories.\n\nBest regards,\nThe CampingSpot Team`,
    html: `
      <h2>Welcome to CampingSpot!</h2>
      <p>Hi ${userName},</p>
      <p>We're excited to have you join our community of camping enthusiasts.</p>
      <p>Start exploring amazing camping spots and create unforgettable memories.</p>
      <br>
      <p>Best regards,<br>The CampingSpot Team</p>
    `
  }),

  bookingConfirmed: (userName, bookingDetails) => ({
    subject: 'Your CampingSpot Booking is Confirmed!',
    text: `Hi ${userName},\n\nYour booking has been confirmed!\n\nBooking Details:\n- Location: ${bookingDetails.location}\n- Dates: ${bookingDetails.dates}\n- Total: ${bookingDetails.total}\n\nWe hope you have a wonderful camping experience!\n\nBest regards,\nThe CampingSpot Team`,
    html: `
      <h2>Booking Confirmed!</h2>
      <p>Hi ${userName},</p>
      <p>Your booking has been confirmed!</p>
      <h3>Booking Details:</h3>
      <ul>
        <li>Location: ${bookingDetails.location}</li>
        <li>Dates: ${bookingDetails.dates}</li>
        <li>Total: ${bookingDetails.total}</li>
      </ul>
      <p>We hope you have a wonderful camping experience!</p>
      <br>
      <p>Best regards,<br>The CampingSpot Team</p>
    `
  }),

  bookingCompleted: (userName, bookingDetails) => ({
    subject: 'How was your camping experience?',
    text: `Hi ${userName},\n\nWe hope you had a great time at ${bookingDetails.location}!\n\nWe'd love to hear about your experience. Your feedback helps other campers make informed decisions and helps us improve our service.\n\nPlease take a moment to share your thoughts by leaving a review.\n\nBest regards,\nThe CampingSpot Team`,
    html: `
      <h2>How was your camping experience?</h2>
      <p>Hi ${userName},</p>
      <p>We hope you had a great time at ${bookingDetails.location}!</p>
      <p>We'd love to hear about your experience. Your feedback helps other campers make informed decisions and helps us improve our service.</p>
      <p>Please take a moment to share your thoughts by leaving a review.</p>
      <br>
      <p>Best regards,<br>The CampingSpot Team</p>
    `
  })
};

class EmailService {
  static async sendEmail(to, template, data) {
    try {
      const emailContent = emailTemplates[template](data.userName, data.bookingDetails);
      
      const messageData = {
        from: FROM_EMAIL,
        to,
        subject: emailContent.subject,
        text: emailContent.text,
        html: emailContent.html
      };

      const response = await mg.messages.create(DOMAIN, messageData);
      return response;
    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  }

  static async sendWelcomeEmail(userEmail, userName) {
    return this.sendEmail(userEmail, 'welcome', { userName });
  }

  static async sendBookingConfirmation(userEmail, userName, bookingDetails) {
    return this.sendEmail(userEmail, 'bookingConfirmed', { userName, bookingDetails });
  }

  static async sendBookingCompletion(userEmail, userName, bookingDetails) {
    return this.sendEmail(userEmail, 'bookingCompleted', { userName, bookingDetails });
  }
}

module.exports = EmailService; 