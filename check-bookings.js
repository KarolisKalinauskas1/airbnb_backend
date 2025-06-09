const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkBookings() {
  try {
    console.log('=== CHECKING CURRENT BOOKINGS ===');
    const now = new Date();
    console.log('Current date:', now.toISOString());
    
    // Check all bookings
    const allBookings = await prisma.bookings.findMany({
      include: {
        users: { select: { email: true, full_name: true } },
        camping_spot: { select: { name: true, title: true } }
      },
      orderBy: { end_date: 'desc' },
      take: 10
    });
    
    console.log('\n=== RECENT BOOKINGS ===');
    allBookings.forEach(booking => {
      const endDate = new Date(booking.end_date);
      const isEnded = endDate < now;
      console.log(`Booking ${booking.booking_id}: End ${booking.end_date} (Status: ${booking.status_id}) - ${isEnded ? 'ENDED' : 'ACTIVE'} - User: ${booking.users?.email}`);
    });
    
    // Check bookings that should be completed
    const bookingsToComplete = await prisma.bookings.findMany({
      where: {
        end_date: { lt: now },
        status_id: 2 // CONFIRMED status
      },
      include: {
        users: { select: { email: true, full_name: true } },
        camping_spot: { select: { name: true, title: true } }
      }
    });
    
    console.log(`\n=== BOOKINGS THAT NEED COMPLETION ===`);
    console.log(`Found ${bookingsToComplete.length} bookings that should be completed`);
    
    bookingsToComplete.forEach(booking => {
      console.log(`- Booking ${booking.booking_id}: ${booking.end_date} for ${booking.users?.email}`);
    });
    
    // Check email configuration
    console.log('\n=== EMAIL CONFIGURATION ===');
    console.log('EMAIL_SERVICE_TYPE:', process.env.EMAIL_SERVICE_TYPE);
    console.log('GMAIL_USER:', process.env.GMAIL_USER);
    console.log('GMAIL_APP_PASSWORD:', process.env.GMAIL_APP_PASSWORD ? '***configured***' : 'NOT SET');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkBookings();
