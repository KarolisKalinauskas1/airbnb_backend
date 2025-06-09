console.log('Starting script...');

const { PrismaClient } = require('@prisma/client');
console.log('Prisma imported');

const prisma = new PrismaClient();
console.log('Prisma client created');

async function simpleTest() {
  console.log('In simpleTest function');
  
  try {
    console.log('Connecting to database...');
    
    // Simple database test
    const bookingCount = await prisma.bookings.count();
    console.log(`Total bookings in database: ${bookingCount}`);
    
    if (bookingCount > 0) {
      const recentBookings = await prisma.bookings.findMany({
        take: 5,
        orderBy: { created_at: 'desc' },
        include: {
          users: { select: { email: true, full_name: true } }
        }
      });
      
      console.log('Recent bookings:');
      recentBookings.forEach((booking, index) => {
        console.log(`${index + 1}. Booking ${booking.booking_id}: Status ${booking.status_id}, End: ${booking.end_date}`);
      });
    }
    
  } catch (error) {
    console.error('Database error:', error.message);
  } finally {
    console.log('Disconnecting...');
    await prisma.$disconnect();
    console.log('Done!');
  }
}

console.log('Calling simpleTest...');
simpleTest();
