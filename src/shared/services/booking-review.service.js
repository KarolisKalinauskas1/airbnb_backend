/**
 * Booking Review Reminder Service
 * 
 * This service is responsible for sending review request emails after a booking has ended.
 * It runs as a scheduled job to check for bookings that have recently ended.
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const SimpleGmailService = require('./simple-gmail.service');

class BookingReviewService {
  /**
   * Send review request emails for recently ended bookings
   * @returns {Promise<number>} - Number of emails sent
   */
  static async sendReviewRequestEmails() {
    try {
      console.log('[BookingReviewService] Running review request email job');
      
      // Get current date
      const now = new Date();
      
      // Find bookings that have ended within the last 24 hours
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);      // Find all completed bookings where:
      // 1. end_date is between yesterday and now (recently ended)
      // 2. status_id is 2 (CONFIRMED) - we want to target successful bookings
      const recentlyEndedBookings = await prisma.bookings.findMany({
        where: {
          end_date: {
            gte: yesterday,
            lte: now
          },
          status_id: 2, // CONFIRMED
        },
        include: {
          user: {
            select: {
              email: true,
              full_name: true
            }
          },
          camping_spot: {
            select: {
              title: true,
              description: true,
              image_url: true
            }
          }
        }
      });
      
      console.log(`[BookingReviewService] Found ${recentlyEndedBookings.length} bookings that recently ended`);
      
      let emailsSent = 0;
      
      // Send review request email for each booking
      for (const booking of recentlyEndedBookings) {
        if (!booking.user?.email) {
          console.warn(`[BookingReviewService] Booking ${booking.booking_id} has no associated user email`);
          continue;
        }
        
        try {          // Send review request email
          const emailSent = await SimpleGmailService.sendReviewRequestEmail(
            booking,
            booking.user,
            booking.camping_spot
          );
            if (emailSent) {
            // Only change status to COMPLETED if current status is CONFIRMED (2)
            if (booking.status_id === 2) { // CONFIRMED status
              // Update booking status to COMPLETED
              await prisma.bookings.update({
                where: { booking_id: booking.booking_id },
                data: { status_id: 4 } // Change status to COMPLETED
              });
              
              console.log(`[BookingReviewService] Changing booking ${booking.booking_id} status from CONFIRMED to COMPLETED`);
            }
            
            emailsSent++;
            console.log(`[BookingReviewService] Sent review request email for booking ${booking.booking_id}`);
          }
        } catch (emailError) {
          console.error(`[BookingReviewService] Error sending review email for booking ${booking.booking_id}:`, emailError);
        }
      }
      
      console.log(`[BookingReviewService] Sent ${emailsSent} review request emails`);
      return emailsSent;
    } catch (error) {
      console.error('[BookingReviewService] Error sending review request emails:', error);
      return 0;
    }
  }
}

module.exports = BookingReviewService;
