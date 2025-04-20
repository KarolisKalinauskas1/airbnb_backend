/**
 * Stripe debugging utilities
 */
const fs = require('fs').promises;
const path = require('path');

/**
 * Log detailed Stripe session information to a file for debugging
 * @param {Object} session - Stripe session object
 * @param {String} source - Source of the log (e.g., 'webhook', 'success-route')
 */
async function logStripeSessionToFile(session, source = 'unknown') {
  try {
    const logsDir = path.join(__dirname, '../logs');
    
    // Create logs directory if it doesn't exist
    try {
      await fs.mkdir(logsDir, { recursive: true });
    } catch (err) {
      // Ignore directory exists error
    }
    
    const logFile = path.join(logsDir, 'stripe-sessions.log');
    
    const logEntry = `
=== STRIPE SESSION LOG [${new Date().toISOString()}] (${source}) ===
Session ID: ${session.id}
Payment Status: ${session.payment_status}
Amount: ${session.amount_total / 100} ${session.currency}
Success URL: ${session.success_url}
Cancel URL: ${session.cancel_url}
Customer: ${session.customer || 'None'}
Metadata: ${JSON.stringify(session.metadata || {}, null, 2)}
==================================================
`;
    
    await fs.appendFile(logFile, logEntry);
    console.log(`Stripe session ${session.id} logged to file (source: ${source})`);
  } catch (error) {
    console.error('Failed to log Stripe session to file:', error);
  }
}

module.exports = {
  logStripeSessionToFile
};
