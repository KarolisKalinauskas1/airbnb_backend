/**
 * Constants for booking status IDs
 * This file helps maintain consistency in booking status codes across the application
 */

const BOOKING_STATUS = {
  PENDING: 1,      // Booking is created but not yet confirmed
  CONFIRMED: 2,    // Booking is confirmed and active
  CANCELLED: 3,    // Booking was cancelled by user or host
  COMPLETED: 4,    // Booking is completed (past end date)
  UNAVAILABLE: 5   // Date range blocked by owner (not a real booking)
};

module.exports = BOOKING_STATUS;
