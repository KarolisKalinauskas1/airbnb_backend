/**
 * Helper functions for logging Stripe session data
 */

/**
 * Log a Stripe session in a structured way
 * @param {Object} session - The Stripe session object
 * @param {String} source - Source of the log entry (e.g., 'webhook', 'success')
 */
function logStripeSession(session, source = 'unknown') {
  console.log(`[${source}] Stripe Session Details:`);
  console.log(`  ID: ${session.id}`);
  console.log(`  Payment Status: ${session.payment_status}`);
  console.log(`  Payment Intent: ${session.payment_intent || 'None'}`);
  console.log(`  Customer: ${session.customer || 'None'}`);
  console.log(`  Amount Total: ${session.amount_total}`);
  
  // Log metadata if present
  if (session.metadata) {
    console.log('  Metadata:');
    Object.entries(session.metadata).forEach(([key, value]) => {
      console.log(`    ${key}: ${value}`);
    });
  }
}

/**
 * Log booking creation
 */
function logBookingCreation(booking, sessionId, source = 'unknown') {
  console.log(`[${source}] Created booking ID ${booking.booking_id} for session ${sessionId}`);
  console.log(`  User ID: ${booking.user_id}`);
  console.log(`  Camping Spot ID: ${booking.camper_id}`);
  console.log(`  Dates: ${booking.start_date.toISOString()} to ${booking.end_date.toISOString()}`);
  console.log(`  Amount: ${booking.cost}`);
}

module.exports = {
  logStripeSession,
  logBookingCreation
};
