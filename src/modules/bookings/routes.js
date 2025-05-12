const EmailService = require('../../shared/services/email.service');
const BookingCompletionService = require('../../shared/services/booking-completion.service');

// ... existing code ...

// In the create booking route
router.post('/', validate(createBookingSchema), async (req, res) => {
  try {
    // ... existing booking creation code ...

    // After successful booking creation
    try {
      const bookingDetails = {
        location: booking.camping_spot.name,
        dates: `${booking.start_date} to ${booking.end_date}`,
        total: `$${booking.total_price}`
      };
      
      await EmailService.sendBookingConfirmation(
        booking.user.email,
        booking.user.full_name,
        bookingDetails
      );
    } catch (emailError) {
      console.error('Failed to send booking confirmation email:', emailError);
      // Don't fail the booking if email fails
    }

    res.status(201).json(booking);
  } catch (error) {
    // ... existing error handling ...
  }
});

// In the complete booking route
router.patch('/:id/complete', async (req, res) => {
  try {
    // ... existing booking completion code ...

    // After successful booking completion
    try {
      const bookingDetails = {
        location: booking.camping_spot.name,
        dates: `${booking.start_date} to ${booking.end_date}`,
        total: `$${booking.total_price}`
      };
      
      await EmailService.sendBookingCompletion(
        booking.user.email,
        booking.user.full_name,
        bookingDetails
      );
    } catch (emailError) {
      console.error('Failed to send booking completion email:', emailError);
      // Don't fail the completion if email fails
    }

    res.json(booking);
  } catch (error) {
    // ... existing error handling ...
  }
});

// Test endpoint to manually trigger booking completion check
router.post('/test-completion-check', async (req, res) => {
  try {
    console.log('Manually triggering booking completion check...');
    await BookingCompletionService.checkCompletedBookings();
    res.json({ message: 'Booking completion check completed' });
  } catch (error) {
    console.error('Error in test completion check:', error);
    res.status(500).json({ error: 'Failed to run completion check' });
  }
}); 