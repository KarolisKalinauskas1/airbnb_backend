/**
 * Booking Completion Service
 * 
 * This service handles tasks related to booking completion and cleanup.
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class BookingCompletionService {
  /**
   * Process completed bookings (past checkout date)
   * This marks bookings as completed if they've passed their end date
   */
  static async processCompletedBookings() {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Find bookings that have passed their end date but still have a "confirmed" status
      const bookingsToComplete = await prisma.bookings.findMany({
        where: {
          status_id: 2, // Confirmed status
          end_date: {
            lt: today
          }
        },
        include: {
          camping_spot: true,
          users: true
        }
      });
      
      console.log(`Found ${bookingsToComplete.length} bookings to mark as completed`);
      
      // Update each booking's status to completed (status_id 4)
      if (bookingsToComplete.length > 0) {
        const updatePromises = bookingsToComplete.map(booking => 
          prisma.bookings.update({
            where: { booking_id: booking.booking_id },
            data: { status_id: 4 } // Completed status
          })
        );
        await Promise.all(updatePromises);
        console.log(`Successfully marked ${updatePromises.length} bookings as completed`);
        
        // Send review request emails and create pending review entries
        try {
          const EmailService = require('./email-service-factory');
          
          for (const booking of bookingsToComplete) {
            try {
              // Make sure the booking has actually ended (end date is in the past)
              const bookingEndDate = new Date(booking.end_date);
              const today = new Date();
              
              if (bookingEndDate < today) {
                // Send review request email only if the booking has ended
                await EmailService.sendReviewRequestEmail(
                  booking, 
                  booking.users, 
                  booking.camping_spot
                );
                console.log(`Sent review request email for booking ${booking.booking_id}`);
                
                // Create a placeholder review entry with null rating and comment
                try {
                  // Check if a review already exists for this booking
                  const existingReview = await prisma.review.findUnique({
                    where: { booking_id: booking.booking_id }
                  });
                  
                  if (!existingReview) {
                    await prisma.review.create({
                      data: {
                        booking_id: booking.booking_id,
                        user_id: booking.user_id,
                        rating: 0, // Use 0 as a placeholder for "not yet reviewed"
                        comment: null,
                        created_at: new Date()
                      }
                    });
                    console.log(`Created placeholder review entry for booking ${booking.booking_id}`);
                  } else {
                    console.log(`Review already exists for booking ${booking.booking_id}`);
                  }
                } catch (reviewError) {
                  console.error(`Failed to create placeholder review for booking ${booking.booking_id}:`, reviewError);
                }
              } else {
                console.log(`Booking ${booking.booking_id} has been marked as completed, but skipping review request since end date ${bookingEndDate.toISOString()} is not actually in the past yet.`);
              }
            } catch (emailError) {
              console.error(`Failed to send review request email for booking ${booking.booking_id}:`, emailError);
            }
          }
        } catch (emailsError) {
          console.error('Error sending review request emails:', emailsError);
        }
      }
      
      return bookingsToComplete.length;
    } catch (error) {
      console.error('Error processing completed bookings:', error);
      throw error;
    }
  }
  
  /**
   * Clean up expired pending bookings
   * This cancels bookings that have been in pending status for too long
   */
  static async cleanupExpiredPendingBookings() {
    try {
      const cutoffDate = new Date();
      cutoffDate.setHours(cutoffDate.getHours() - 24); // 24 hour expiration
      
      // Find pending bookings older than the cutoff
      const expiredBookings = await prisma.bookings.findMany({
        where: {
          status_id: 1, // Pending status
          created_at: {
            lt: cutoffDate
          }
        }
      });
      
      console.log(`Found ${expiredBookings.length} expired pending bookings to cancel`);
      
      // Cancel each expired booking
      if (expiredBookings.length > 0) {
        const updatePromises = expiredBookings.map(booking => 
          prisma.bookings.update({
            where: { booking_id: booking.booking_id },
            data: { status_id: 3 } // Cancelled status
          })
        );
        
        await Promise.all(updatePromises);
        console.log(`Successfully cancelled ${updatePromises.length} expired bookings`);
      }
      
      return expiredBookings.length;
    } catch (error) {
      console.error('Error cleaning up expired pending bookings:', error);
      throw error;
    }
  }
}

module.exports = BookingCompletionService;