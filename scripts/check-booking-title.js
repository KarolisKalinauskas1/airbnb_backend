// Script to directly check booking and camping spot title
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkBooking() {
  try {
    console.log('Checking booking with ID 21...');

    // Get the booking with ID 21
    const booking = await prisma.bookings.findUnique({
      where: { booking_id: 21 },
      include: {
        camping_spot: true
      }
    });

    if (!booking) {
      console.log('Booking with ID 21 not found');
      return;
    }

    console.log('Found booking:', booking.booking_id);
    
    // Check if camping_spot exists
    if (!booking.camping_spot) {
      console.log('No camping spot associated with this booking');
      return;
    }

    // Log all fields in the camping_spot
    console.log('Camping spot fields:', Object.keys(booking.camping_spot));
    console.log('Camping spot ID:', booking.camping_spot.camping_spot_id);
    console.log('Title field exists:', 'title' in booking.camping_spot);
    console.log('Title value:', booking.camping_spot.title);

    // If title is missing, try to directly query the camping spot
    if (!booking.camping_spot.title) {
      console.log('Title not found in booking.camping_spot, querying directly...');
      
      const campingSpot = await prisma.camping_spot.findUnique({
        where: { camping_spot_id: booking.camping_spot.camping_spot_id }
      });
      
      console.log('Direct query result:');
      console.log('Fields:', Object.keys(campingSpot));
      console.log('Title field exists:', 'title' in campingSpot);
      console.log('Title value:', campingSpot.title);
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkBooking();
