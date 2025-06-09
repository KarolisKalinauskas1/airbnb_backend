#!/usr/bin/env node

/**
 * Comprehensive Email System Test
 * 
 * This script tests ALL email functionality:
 * 1. Booking completion and status changes
 * 2. Review request emails
 * 3. Welcome emails for new registrations
 * 4. Booking confirmation emails
 * 5. Payment confirmation emails
 * 6. Booking reminder emails
 * 7. All other informational emails
 */

const { PrismaClient } = require('@prisma/client');
const SimpleGmailService = require('./src/shared/services/simple-gmail.service');
const EmailService = require('./src/shared/services/email.service');
const BookingCompletionService = require('./src/shared/services/booking-completion.service');
const BookingReviewService = require('./src/shared/services/booking-review.service');

const prisma = new PrismaClient();

console.log('🧪 COMPREHENSIVE EMAIL SYSTEM TEST');
console.log('==================================');
console.log(`📅 Current Date: ${new Date().toISOString()}`);
console.log('');

async function testEmailConfiguration() {
  console.log('📧 1. TESTING EMAIL CONFIGURATION...');
  
  try {
    // Test basic email sending
    const testResult = await SimpleGmailService.sendEmail(
      process.env.GMAIL_USER,
      'Email System Test',
      'This is a test email to verify configuration.',
      '<p>This is a <strong>test email</strong> to verify configuration.</p>'
    );
    
    if (testResult) {
      console.log('✅ Email configuration working!');
    } else {
      console.log('❌ Email configuration failed!');
    }
  } catch (error) {
    console.error('❌ Email configuration error:', error.message);
  }
  console.log('');
}

async function testBookingCompletion() {
  console.log('📝 2. TESTING BOOKING COMPLETION...');
  
  try {
    // Find bookings that should be completed (past end date)
    const now = new Date();
    const bookingsPastEndDate = await prisma.bookings.findMany({
      where: {
        end_date: {
          lt: now
        },
        status_id: 2 // CONFIRMED status
      },
      include: {
        users: {
          select: {
            user_id: true,
            email: true,
            full_name: true
          }
        },
        camping_spot: {
          select: {
            camping_spot_id: true,
            name: true,
            title: true
          }
        }
      },
      take: 5 // Limit to first 5 for testing
    });

    console.log(`📋 Found ${bookingsPastEndDate.length} bookings past their end date`);

    if (bookingsPastEndDate.length > 0) {
      console.log('🔄 Processing completed bookings...');
      
      for (const booking of bookingsPastEndDate) {
        console.log(`\n📧 Processing booking ${booking.booking_id}:`);
        console.log(`   • User: ${booking.users?.full_name || 'Unknown'} (${booking.users?.email || 'No email'})`);
        console.log(`   • Spot: ${booking.camping_spot?.name || booking.camping_spot?.title || 'Unknown'}`);
        console.log(`   • End Date: ${booking.end_date}`);
        console.log(`   • Current Status: ${booking.status_id}`);
        
        try {
          // 1. Update status to completed
          await prisma.bookings.update({
            where: { booking_id: booking.booking_id },
            data: { status_id: 4 } // COMPLETED
          });
          console.log('   ✅ Status updated to COMPLETED');
          
          // 2. Send review request email
          if (booking.users?.email && booking.camping_spot) {
            const emailSent = await SimpleGmailService.sendReviewRequestEmail(
              booking,
              booking.users,
              booking.camping_spot
            );
            
            if (emailSent) {
              console.log('   ✅ Review request email sent');
            } else {
              console.log('   ❌ Review request email failed');
            }
          } else {
            console.log('   ⚠️ Missing email or camping spot data');
          }
        } catch (error) {
          console.error(`   ❌ Error processing booking ${booking.booking_id}:`, error.message);
        }
      }
    } else {
      console.log('ℹ️ No bookings found that need completion');
      
      // Create a test scenario
      console.log('🧪 Creating test completed booking scenario...');
      
      // Find any confirmed booking to test with
      const testBooking = await prisma.bookings.findFirst({
        where: { status_id: 2 },
        include: {
          users: true,
          camping_spot: true
        }
      });
      
      if (testBooking) {
        console.log(`📧 Sending test review email for booking ${testBooking.booking_id}`);
        const emailSent = await SimpleGmailService.sendReviewRequestEmail(
          testBooking,
          testBooking.users,
          testBooking.camping_spot
        );
        
        if (emailSent) {
          console.log('✅ Test review request email sent');
        } else {
          console.log('❌ Test review request email failed');
        }
      }
    }
  } catch (error) {
    console.error('❌ Booking completion test failed:', error);
  }
  console.log('');
}

async function testWelcomeEmails() {
  console.log('👋 3. TESTING WELCOME EMAILS...');
  
  try {
    // Find a recent user to test welcome email
    const recentUser = await prisma.users.findFirst({
      orderBy: { created_at: 'desc' }
    });
    
    if (recentUser) {
      console.log(`📧 Sending test welcome email to ${recentUser.email}`);
      
      const emailSent = await SimpleGmailService.sendWelcomeEmail(recentUser);
      
      if (emailSent) {
        console.log('✅ Welcome email sent successfully');
      } else {
        console.log('❌ Welcome email failed');
      }
    } else {
      console.log('ℹ️ No users found for welcome email test');
    }
  } catch (error) {
    console.error('❌ Welcome email test failed:', error);
  }
  console.log('');
}

async function testBookingConfirmationEmails() {
  console.log('✅ 4. TESTING BOOKING CONFIRMATION EMAILS...');
  
  try {
    // Find a recent booking to test confirmation email
    const recentBooking = await prisma.bookings.findFirst({
      where: { status_id: 2 }, // CONFIRMED
      include: {
        users: true,
        camping_spot: true
      },
      orderBy: { created_at: 'desc' }
    });
    
    if (recentBooking) {
      console.log(`📧 Sending test booking confirmation email for booking ${recentBooking.booking_id}`);
      
      const emailSent = await SimpleGmailService.sendBookingConfirmation(
        recentBooking,
        recentBooking.users
      );
      
      if (emailSent) {
        console.log('✅ Booking confirmation email sent successfully');
      } else {
        console.log('❌ Booking confirmation email failed');
      }
    } else {
      console.log('ℹ️ No confirmed bookings found for confirmation email test');
    }
  } catch (error) {
    console.error('❌ Booking confirmation email test failed:', error);
  }
  console.log('');
}

async function testPaymentConfirmationEmails() {
  console.log('💳 5. TESTING PAYMENT CONFIRMATION EMAILS...');
  
  try {
    // Find a booking with payment to test
    const bookingWithPayment = await prisma.bookings.findFirst({
      where: { 
        status_id: 2, // CONFIRMED
        booking_transactions: {
          some: {}
        }
      },
      include: {
        users: true,
        camping_spot: true,
        booking_transactions: {
          take: 1,
          orderBy: { created_at: 'desc' }
        }
      }
    });
    
    if (bookingWithPayment && bookingWithPayment.booking_transactions.length > 0) {
      console.log(`📧 Sending test payment confirmation email for booking ${bookingWithPayment.booking_id}`);
      
      const payment = bookingWithPayment.booking_transactions[0];
      const emailSent = await EmailService.sendPaymentConfirmation(
        bookingWithPayment,
        bookingWithPayment.users,
        payment
      );
      
      if (emailSent) {
        console.log('✅ Payment confirmation email sent successfully');
      } else {
        console.log('❌ Payment confirmation email failed');
      }
    } else {
      console.log('ℹ️ No bookings with payments found for payment confirmation email test');
    }
  } catch (error) {
    console.error('❌ Payment confirmation email test failed:', error);
  }
  console.log('');
}

async function testBookingReminderEmails() {
  console.log('⏰ 6. TESTING BOOKING REMINDER EMAILS...');
  
  try {
    // Find an upcoming booking to test reminder email
    const now = new Date();
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(now.getDate() + 3);
    
    const upcomingBooking = await prisma.bookings.findFirst({
      where: {
        start_date: {
          gte: now,
          lte: threeDaysFromNow
        },
        status_id: 2 // CONFIRMED
      },
      include: {
        users: true,
        camping_spot: true
      }
    });
    
    if (upcomingBooking) {
      console.log(`📧 Sending test booking reminder email for booking ${upcomingBooking.booking_id}`);
      
      const emailSent = await EmailService.sendBookingReminder(
        upcomingBooking,
        upcomingBooking.users
      );
      
      if (emailSent) {
        console.log('✅ Booking reminder email sent successfully');
      } else {
        console.log('❌ Booking reminder email failed');
      }
    } else {
      console.log('ℹ️ No upcoming bookings found for reminder email test');
    }
  } catch (error) {
    console.error('❌ Booking reminder email test failed:', error);
  }
  console.log('');
}

async function testCronJobServices() {
  console.log('⚙️ 7. TESTING CRON JOB SERVICES...');
  
  try {
    console.log('🔄 Testing BookingCompletionService...');
    const completedCount = await BookingCompletionService.processCompletedBookings();
    console.log(`✅ BookingCompletionService processed ${completedCount} bookings`);
    
    console.log('🔄 Testing BookingReviewService...');
    const reviewEmailsCount = await BookingReviewService.sendReviewRequestEmails();
    console.log(`✅ BookingReviewService sent ${reviewEmailsCount} review emails`);
    
  } catch (error) {
    console.error('❌ Cron job services test failed:', error);
  }
  console.log('');
}

async function showDatabaseStats() {
  console.log('📊 8. DATABASE STATISTICS...');
  
  try {
    const stats = await prisma.$transaction([
      prisma.users.count(),
      prisma.bookings.count(),
      prisma.bookings.count({ where: { status_id: 1 } }), // PENDING
      prisma.bookings.count({ where: { status_id: 2 } }), // CONFIRMED
      prisma.bookings.count({ where: { status_id: 3 } }), // CANCELLED
      prisma.bookings.count({ where: { status_id: 4 } }), // COMPLETED
      prisma.camping_spot.count(),
      prisma.reviews.count()
    ]);
    
    console.log(`👥 Total Users: ${stats[0]}`);
    console.log(`📝 Total Bookings: ${stats[1]}`);
    console.log(`   • Pending: ${stats[2]}`);
    console.log(`   • Confirmed: ${stats[3]}`);
    console.log(`   • Cancelled: ${stats[4]}`);
    console.log(`   • Completed: ${stats[5]}`);
    console.log(`🏕️ Total Camping Spots: ${stats[6]}`);
    console.log(`⭐ Total Reviews: ${stats[7]}`);
    
    // Show bookings that should be completed
    const now = new Date();
    const shouldBeCompleted = await prisma.bookings.count({
      where: {
        end_date: { lt: now },
        status_id: 2 // Still CONFIRMED but should be COMPLETED
      }
    });
    
    console.log(`⚠️ Bookings that should be completed: ${shouldBeCompleted}`);
    
  } catch (error) {
    console.error('❌ Database stats failed:', error);
  }
  console.log('');
}

async function main() {
  try {
    await testEmailConfiguration();
    await testBookingCompletion();
    await testWelcomeEmails();
    await testBookingConfirmationEmails();
    await testPaymentConfirmationEmails();
    await testBookingReminderEmails();
    await testCronJobServices();
    await showDatabaseStats();
    
    console.log('🎉 EMAIL SYSTEM TEST COMPLETED!');
    console.log('================================');
    console.log('');
    console.log('📋 NEXT STEPS:');
    console.log('1. Check your email inbox for test emails');
    console.log('2. Verify cron jobs are running on schedule');
    console.log('3. Monitor booking status changes');
    console.log('4. Ensure all email templates are working');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
