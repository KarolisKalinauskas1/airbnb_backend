const { PrismaClient } = require('@prisma/client');
const EmailService = require('./email.service');
const prisma = new PrismaClient();

class BookingCompletionService {
  static async checkCompletedBookings() {
    try {
      // Find bookings that:
      // 1. Have end_date in the past
      // 2. Have status_id = 2 (Confirmed)
      // 3. Don't have a review yet
      const completedBookings = await prisma.bookings.findMany({
        where: {
          end_date: {
            lt: new Date() // end_date is in the past
          },
          status_id: 2, // Confirmed status
          review: null
        },
        include: {
          users: true,
          camping_spot: true
        }
      });

      for (const booking of completedBookings) {
        try {
          // Send completion email first
          const bookingDetails = {
            location: booking.camping_spot.title,
            dates: `${booking.start_date.toLocaleDateString()} to ${booking.end_date.toLocaleDateString()}`,
            total: `$${booking.cost}`
          };

          // Try to send the email
          await EmailService.sendBookingCompletion(
            booking.users.email,
            booking.users.full_name,
            bookingDetails
          );

          // Only update status to completed if email was sent successfully
          await prisma.bookings.update({
            where: { booking_id: booking.booking_id },
            data: {
              status_id: 4 // Completed status
            }
          });

          console.log(`Processed completed booking ${booking.booking_id} for user ${booking.users.email}`);
        } catch (error) {
          console.error(`Error processing booking ${booking.booking_id}:`, error);
          // If email fails, don't update the status
          // This ensures we'll try to send the email again in the next run
        }
      }
    } catch (error) {
      console.error('Error checking completed bookings:', error);
    }
  }
}

module.exports = BookingCompletionService; 