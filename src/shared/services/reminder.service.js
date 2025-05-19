/**
 * Reminder Service
 * 
 * This service handles sending reminder notifications to users for upcoming bookings.
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const EmailService = require('./email.service');

class ReminderService {
  /**
   * Send reminders for upcoming bookings (e.g., 2 days before check-in)
   */
  static async sendBookingReminders() {
    try {
      // Calculate dates for sending reminders
      // We'll send reminders 2 days before check-in
      const twoDaysFromNow = new Date();
      twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);
      
      // Set the start and end of the target day
      const startOfDay = new Date(twoDaysFromNow);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(twoDaysFromNow);
      endOfDay.setHours(23, 59, 59, 999);
      
      // Find confirmed bookings with check-in in 2 days
      const upcomingBookings = await prisma.bookings.findMany({
        where: {
          status_id: 2, // Confirmed status
          start_date: {
            gte: startOfDay,
            lte: endOfDay
          }
        },
        include: {
          camping_spot: true,
          users: true
        }
      });
      
      console.log(`Found ${upcomingBookings.length} upcoming bookings to send reminders for`);
      
      // Send reminder emails
      let sentCount = 0;
      for (const booking of upcomingBookings) {
        try {
          await EmailService.sendBookingReminder(booking, booking.users);
          console.log(`Sent booking reminder for booking ${booking.id} to ${booking.users.email}`);
          sentCount++;
        } catch (error) {
          console.error(`Failed to send booking reminder for booking ${booking.id}:`, error);
        }
      }
      
      return sentCount;
    } catch (error) {
      console.error('Error sending booking reminders:', error);
      throw error;
    }
  }
  
  /**
   * Send payment reminders for pending bookings
   */
  static async sendPaymentReminders() {
    try {
      // Find bookings that are pending payment for more than 24 hours
      const cutoffDate = new Date();
      cutoffDate.setHours(cutoffDate.getHours() - 24);
      
      const pendingBookings = await prisma.bookings.findMany({
        where: {
          status_id: 1, // Pending status
          created_at: {
            lt: cutoffDate
          }
        },
        include: {
          camping_spot: true,
          users: true
        }
      });
      
      console.log(`Found ${pendingBookings.length} pending bookings to send payment reminders for`);
      
      // Here you would implement the payment reminder email logic
      // This is a placeholder for now as we don't have that email method yet
      
      return pendingBookings.length;
    } catch (error) {
      console.error('Error sending payment reminders:', error);
      throw error;
    }
  }
}

module.exports = ReminderService;
