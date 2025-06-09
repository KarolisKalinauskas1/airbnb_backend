require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkReviews() {
  try {
    console.log('🔍 Checking review data...');
    
    // Get completed bookings with review info
    const completedBookings = await prisma.bookings.findMany({
      where: {
        status_id: 4 // Completed
      },
      include: {
        review: true,
        camping_spot: true,
        users: true
      },
      take: 5
    });

    console.log(`Found ${completedBookings.length} completed bookings`);
    
    for (const booking of completedBookings) {
      console.log(`\n📅 Booking ${booking.booking_id}:`);
      console.log(`   User: ${booking.users?.full_name}`);
      console.log(`   Spot: ${booking.camping_spot?.title}`);
      console.log(`   Dates: ${booking.start_date} to ${booking.end_date}`);
      console.log(`   Status: ${booking.status_id}`);
      
      if (booking.review) {
        console.log(`   ✅ HAS REVIEW:`);
        console.log(`     - ID: ${booking.review.review_id}`);
        console.log(`     - Rating: ${booking.review.rating}`);
        console.log(`     - Comment: ${booking.review.comment || 'No comment'}`);
      } else {
        console.log(`   ❌ NO REVIEW - needs review button!`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkReviews();
