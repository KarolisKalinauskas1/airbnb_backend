require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkBookingStatuses() {
  try {
    console.log('🔍 Checking all booking statuses...');
    
    // Get count by status
    const statusCounts = await prisma.bookings.groupBy({
      by: ['status_id'],
      _count: {
        booking_id: true
      },
      orderBy: {
        status_id: 'asc'
      }
    });

    console.log('\n📊 Booking counts by status:');
    const statusNames = {
      1: 'Pending',
      2: 'Confirmed', 
      3: 'Cancelled',
      4: 'Completed',
      5: 'Blocked'
    };
    
    statusCounts.forEach(status => {
      console.log(`   Status ${status.status_id} (${statusNames[status.status_id] || 'Unknown'}): ${status._count.booking_id}`);
    });

    // Get some sample bookings from each status
    console.log('\n📋 Sample bookings:');
    for (const statusId of [1, 2, 3, 4, 5]) {
      const sampleBooking = await prisma.bookings.findFirst({
        where: { status_id: statusId },
        include: {
          camping_spot: { select: { title: true } },
          users: { select: { full_name: true, email: true } },
          review: true
        }
      });
      
      if (sampleBooking) {
        console.log(`\n   ${statusNames[statusId]} (${statusId}):`);
        console.log(`     Booking ID: ${sampleBooking.booking_id}`);
        console.log(`     User: ${sampleBooking.users?.full_name} (${sampleBooking.users?.email})`);
        console.log(`     Spot: ${sampleBooking.camping_spot?.title}`);
        console.log(`     Dates: ${sampleBooking.start_date} to ${sampleBooking.end_date}`);
        console.log(`     Has Review: ${sampleBooking.review ? 'Yes (Rating: ' + sampleBooking.review.rating + ')' : 'No'}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkBookingStatuses();
