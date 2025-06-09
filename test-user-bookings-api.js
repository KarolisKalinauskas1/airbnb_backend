require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testUserBookingsAPI() {
  try {
    console.log('🔍 Testing user bookings API response...');
    
    // Find a user with bookings
    const userWithBookings = await prisma.users.findFirst({
      where: {
        bookings: {
          some: {
            status_id: 4 // Completed status
          }
        }
      },
      include: {
        bookings: {
          where: {
            status_id: 4
          },
          include: {
            camping_spot: {
              include: {
                location: true,
                images: true
              }
            },
            status_booking_transaction: true,
            transaction: true,
            review: true // Include review data
          },
          take: 3
        }
      }
    });

    if (!userWithBookings) {
      console.log('❌ No users with completed bookings found');
      return;
    }

    console.log(`\n👤 User: ${userWithBookings.full_name} (${userWithBookings.email})`);
    console.log(`📚 Found ${userWithBookings.bookings.length} completed bookings`);

    // Process each booking like the API does
    for (const booking of userWithBookings.bookings) {
      console.log(`\n📅 Booking ID: ${booking.booking_id}`);
      console.log(`   Camping Spot: ${booking.camping_spot?.title || 'Unknown'}`);
      console.log(`   Status ID: ${booking.status_id}`);
      console.log(`   Dates: ${booking.start_date} to ${booking.end_date}`);
      
      // Check review status
      const hasReview = booking.review?.review_id != null;
      const reviewRating = booking.review?.rating || 0;
      
      console.log(`   Review Status:`);
      console.log(`     - has_review: ${hasReview}`);
      console.log(`     - review_id: ${booking.review?.review_id || 'null'}`);
      console.log(`     - rating: ${reviewRating}`);
      console.log(`     - comment: ${booking.review?.comment || 'null'}`);
      
      // Map booking status
      const statusMap = {
        1: 'pending',
        2: 'confirmed', 
        3: 'cancelled',
        4: 'completed',
        5: 'blocked'
      };
      
      const status = statusMap[booking.status_id] || 'unknown';
      console.log(`     - mapped status: ${status}`);
      
      // Format as the API would
      const formattedBooking = {
        id: booking.booking_id,
        booking_id: booking.booking_id,
        start_date: booking.start_date,
        end_date: booking.end_date,
        status: status,
        has_review: hasReview,
        review_id: booking.review?.review_id,
        rating: reviewRating,
        spot: {
          name: booking.camping_spot?.title,
          title: booking.camping_spot?.title
        }
      };
      
      console.log(`\n   🔧 Formatted for frontend:`);
      console.log(JSON.stringify(formattedBooking, null, 4));
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testUserBookingsAPI();
