/**
 * Utility functions for camping spot management
 */

/**
 * Checks if a camping spot is available for the given date range
 * @param {PrismaClient} prisma - Prisma client instance
 * @param {Object} params - Parameters for the check
 * @returns {Promise<Boolean>} - Returns true if the spot is available
 */
async function isSpotAvailableForDates(prisma, { spotId, startDate, endDate }) {
  // Convert dates to Date objects if they are strings
  const start = typeof startDate === 'string' ? new Date(startDate) : startDate;
  const end = typeof endDate === 'string' ? new Date(endDate) : endDate;
  
  // Look for any bookings that would conflict with the requested dates
  const conflictingBookings = await prisma.bookings.findMany({
    where: {
      camper_id: parseInt(spotId),
      status_id: { in: [1, 2, 5] }, // Pending, Confirmed, or Unavailable (exclude Cancelled)
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
    }
  });
  
  // Return true if no conflicting bookings found
  return conflictingBookings.length === 0;
}

module.exports = {
  isSpotAvailableForDates
};
