const express = require('express');
const router = express.Router();
const BookingCompletionService = require('../src/shared/services/booking-completion.service');
const BookingReviewService = require('../src/shared/services/booking-review.service');

/**
 * @route   POST /api/debug/trigger-booking-completion
 * @desc    Manually trigger booking completion process
 * @access  Public (for debugging only)
 */
router.post('/trigger-booking-completion', async (req, res) => {
  try {
    console.log('[DEBUG] Manually triggering booking completion process...');
    const result = await BookingCompletionService.processCompletedBookings();
    res.json({
      success: true,
      message: 'Booking completion process triggered successfully',
      result: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[DEBUG] Error triggering booking completion:', error);
    res.status(500).json({
      success: false,
      message: 'Error triggering booking completion process',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route   POST /api/debug/trigger-review-emails
 * @desc    Manually trigger review request emails
 * @access  Public (for debugging only)
 */
router.post('/trigger-review-emails', async (req, res) => {
  try {
    console.log('[DEBUG] Manually triggering review request emails...');
    const result = await BookingReviewService.sendReviewRequestEmails();
    res.json({
      success: true,
      message: 'Review request emails triggered successfully',
      result: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[DEBUG] Error triggering review emails:', error);
    res.status(500).json({
      success: false,
      message: 'Error triggering review request emails',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route   GET /api/debug/email-config
 * @desc    Check email configuration
 * @access  Public (for debugging only)
 */
router.get('/email-config', (req, res) => {
  const config = {
    EMAIL_SERVICE_TYPE: process.env.EMAIL_SERVICE_TYPE,
    GMAIL_USER: !!process.env.GMAIL_USER,
    GMAIL_APP_PASSWORD: !!process.env.GMAIL_APP_PASSWORD,
    FROM_EMAIL: process.env.FROM_EMAIL,
    NODE_ENV: process.env.NODE_ENV,
    timestamp: new Date().toISOString()
  };
  
  res.json(config);
});

module.exports = router;
