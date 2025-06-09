const { PrismaClient } = require('@prisma/client');
const SimpleGmailService = require('./src/shared/services/simple-gmail.service');

const prisma = new PrismaClient();

async function processCompletedBookings() {
  try {
    console.log('🔍 Looking for bookings that should be completed...');
    
    const today = new Date();
    console.log('Current date:', today.toISOString());
    
    // Find confirmed bookings that have passed their end date
    const bookingsToComplete = await prisma.bookings.findMany({
      where: {
        status_id: 2, // Confirmed status
        end_date: {
          lt: today
        }
      },
      include: {
        users: {
          select: {
            email: true,
            full_name: true
          }
        },
        camping_spot: {
          select: {
            title: true
          }
        }
      }
    });
    
    console.log(`📋 Found ${bookingsToComplete.length} bookings to complete`);
    
    if (bookingsToComplete.length === 0) {
      console.log('✅ No bookings need to be completed');
      return;
    }

    // Process each booking
    for (const booking of bookingsToComplete) {
      console.log(`\n📧 Processing booking ${booking.booking_id}...`);
      
      try {
        // 1. Update booking status to completed (status_id: 4)
        await prisma.bookings.update({
          where: { booking_id: booking.booking_id },
          data: { status_id: 4 }
        });
        console.log(`✅ Status changed to completed for booking ${booking.booking_id}`);
        
        // 2. Send review request email
        if (booking.users && booking.users.email) {
          const spotName = booking.camping_spot?.title || 'your camping spot';
          
          const emailSent = await SimpleGmailService.sendEmail(
            booking.users.email,
            `How was your stay at ${spotName}?`,
            `Hi ${booking.users.full_name || 'there'},\n\nWe hope you enjoyed your stay at ${spotName}! We'd love to hear about your experience.\n\nPlease take a moment to leave a review.\n\nThanks!\nCamping Spots Team`,
            `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2>How was your stay at ${spotName}?</h2>
                <p>Hi ${booking.users.full_name || 'there'},</p>
                <p>We hope you enjoyed your stay at <strong>${spotName}</strong>! We'd love to hear about your experience.</p>
                <p>Please take a moment to leave a review.</p>
                <p>Thanks!<br>Camping Spots Team</p>
              </div>
            `
          );
          
          if (emailSent) {
            console.log(`📧 Review request email sent to ${booking.users.email}`);
          } else {
            console.log(`❌ Failed to send email to ${booking.users.email}`);
          }
        } else {
          console.log(`⚠️ No email found for booking ${booking.booking_id}`);
        }
        
      } catch (error) {
        console.error(`❌ Error processing booking ${booking.booking_id}:`, error.message);
      }
    }
    
    console.log(`\n🎉 Processed ${bookingsToComplete.length} bookings`);
    
  } catch (error) {
    console.error('❌ Error in processCompletedBookings:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the function
processCompletedBookings();
