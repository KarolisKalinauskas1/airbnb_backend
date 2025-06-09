console.log('Script starting...');

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function simpleBookingCheck() {
  try {
    console.log('Connecting to database...');
    
    // Simple count
    const totalBookings = await prisma.bookings.count();
    console.log('Total bookings:', totalBookings);
    
    if (totalBookings > 0) {
      // Get some bookings
      const someBookings = await prisma.bookings.findMany({
        take: 3,
        include: {
          users: {
            select: {
              email: true,
              full_name: true
            }
          }
        }
      });
      
      console.log('Sample bookings:');
      someBookings.forEach(booking => {
        console.log(`- Booking ${booking.booking_id}: Status ${booking.status_id}, End: ${booking.end_date}`);
      });
      
      // Check for past bookings
      const now = new Date();
      const pastBookings = await prisma.bookings.count({
        where: {
          end_date: { lt: now },
          status_id: 2
        }
      });
      
      console.log(`Past confirmed bookings that could be completed: ${pastBookings}`);
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    console.log('Disconnecting...');
    await prisma.$disconnect();
    console.log('Script finished.');
  }
}

simpleBookingCheck();
