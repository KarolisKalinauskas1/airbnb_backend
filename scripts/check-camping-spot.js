// A script to directly check the structure of the camping_spot table and retrieve booking data
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    console.log('===== Checking Database Structure =====');
    
    // First, get a sample camping spot directly to see its structure
    console.log('\n1. Retrieving a sample camping spot:');
    const campingSpot = await prisma.camping_spot.findFirst();
    
    console.log('Sample camping spot data structure:');
    console.log('Fields available:', Object.keys(campingSpot));
    console.log('Field values:');
    Object.entries(campingSpot).forEach(([key, value]) => {
      console.log(`  ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
    });
    
    // Now try to find a specific camping spot by ID 26
    console.log('\n2. Retrieving camping spot with ID 26:');
    const specificSpot = await prisma.camping_spot.findUnique({
      where: { camping_spot_id: 26 }
    });
    
    if (specificSpot) {
      console.log('Found camping spot with ID 26:');
      console.log('  title:', specificSpot.title);
      console.log('  description:', specificSpot.description?.substring(0, 50) + '...');
    } else {
      console.log('No camping spot found with ID 26');
    }
    
    // Now get booking with ID 21 with explicit selection
    console.log('\n3. Retrieving booking with ID 21 with explicit fields:');
    const booking = await prisma.bookings.findUnique({
      where: { booking_id: 21 },
      include: {
        camping_spot: {
          select: {
            camping_spot_id: true,
            title: true,
            description: true,
            price_per_night: true
          }
        }
      }
    });
    
    if (booking) {
      console.log('Found booking with ID 21:');
      console.log('  start_date:', booking.start_date);
      console.log('  end_date:', booking.end_date);
      console.log('  camping_spot:', booking.camping_spot ? 'exists' : 'missing');
      
      if (booking.camping_spot) {
        console.log('  spot id:', booking.camping_spot.camping_spot_id);
        console.log('  spot title:', booking.camping_spot.title);
        
        // Create the exact structure that should be returned to the frontend
        const formattedBooking = {
          id: booking.booking_id,
          spot: {
            id: booking.camping_spot.camping_spot_id,
            name: booking.camping_spot.title,
            title: booking.camping_spot.title,
            description: booking.camping_spot.description
          }
        };
        
        console.log('\nFormatted booking that should be returned:');
        console.log(JSON.stringify(formattedBooking, null, 2));
      }
    } else {
      console.log('No booking found with ID 21');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => console.log('Done'))
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
