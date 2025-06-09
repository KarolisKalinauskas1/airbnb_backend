#!/usr/bin/env node

// Simple database test
require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testDb() {
  try {
    console.log('Testing database connection...');
    
    // Test database connection
    await prisma.$connect();
    console.log('✅ Database connected successfully');
    
    // Check for bookings that should be completed
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    console.log('\nChecking for bookings that should be completed...');
    console.log('Looking for bookings with end_date <', today.toISOString());
    
    const bookingsToComplete = await prisma.bookings.findMany({
      where: {
        status_id: 2, // Confirmed status
        end_date: {
          lt: today
        }
      },
      include: {
        users: true,
        camping_spot: true
      }
    });
    
    console.log(`Found ${bookingsToComplete.length} bookings that should be completed`);
    
    if (bookingsToComplete.length > 0) {
      bookingsToComplete.forEach(booking => {
        console.log(`- Booking ID: ${booking.booking_id}, End Date: ${booking.end_date}, Status: ${booking.status_id}, User: ${booking.users?.email}`);
      });
    }
    
    await prisma.$disconnect();
    console.log('✅ Test completed successfully');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
  
  process.exit(0);
}

testDb();
