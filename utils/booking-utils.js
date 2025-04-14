/**
 * Utility functions for booking management
 */

/**
 * Checks if a booking with the given details already exists and is not cancelled
 * @param {PrismaClient} prisma - Prisma client instance
 * @param {Object} bookingDetails - Booking details to check
 * @returns {Promise<Object|null>} - Returns the existing booking if found, null otherwise
 */
async function findActiveBookingConflict(prisma, { camperId, userId, startDate, endDate, cost }) {
  if (!camperId || !userId || !startDate || !endDate) {
    throw new Error('Missing required parameters for booking conflict check');
  }
  
  // Convert dates to Date objects if they are strings
  const start = typeof startDate === 'string' ? new Date(startDate) : startDate;
  const end = typeof endDate === 'string' ? new Date(endDate) : endDate;
  
  // Check for existing active bookings in this date range for the same user and camping spot
  const existingBookings = await prisma.bookings.findMany({
    where: {
      camper_id: parseInt(camperId),
      user_id: parseInt(userId),
      start_date: start,
      end_date: end,
      status_id: {
        not: 3 // Not cancelled
      }
    }
  });
  
  return existingBookings.length > 0 ? existingBookings[0] : null;
}

/**
 * Checks if there are any overlapping active bookings for a camping spot in a date range
 * @param {PrismaClient} prisma - Prisma client instance
 * @param {Object} params - Parameters for the check
 * @returns {Promise<Boolean>} - Returns true if there are overlapping bookings
 */
async function hasOverlappingActiveBookings(prisma, { camperId, startDate, endDate, excludeBookingId = null }) {
  const start = typeof startDate === 'string' ? new Date(startDate) : startDate;
  const end = typeof endDate === 'string' ? new Date(endDate) : endDate;
  
  const whereClause = {
    camper_id: parseInt(camperId),
    status_id: {
      in: [1, 2, 5] // Pending, Confirmed, Unavailable - exclude Cancelled (3)
    },
    OR: [
      // Booking starts within the range
      {
        start_date: {
          gte: start,
          lte: end
        }
      },
      // Booking ends within the range
      {
        end_date: {
          gte: start,
          lte: end
        }
      },
      // Booking spans the entire range
      {
        AND: [
          { start_date: { lte: start } },
          { end_date: { gte: end } }
        ]
      }
    ]
  };
  
  // Exclude the specific booking if provided (useful for booking updates)
  if (excludeBookingId) {
    whereClause.NOT = {
      booking_id: parseInt(excludeBookingId)
    };
  }
  
  const overlappingBookings = await prisma.bookings.findMany({
    where: whereClause
  });
  
  return overlappingBookings.length > 0;
}

module.exports = {
  findActiveBookingConflict,
  hasOverlappingActiveBookings
};
