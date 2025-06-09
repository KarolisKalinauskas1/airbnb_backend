const express = require('express');
const router = express.Router();
const { prisma } = require('../../config/index');
const { authenticate } = require('../../../middlewares/auth');

/**
 * Ensure a value is a proper number
 */
function ensureNumber(value, defaultValue = 0) {
  if (value === null || value === undefined) return defaultValue;
  
  // If it's already a number, just return it (unless it's NaN)
  if (typeof value === 'number') return isNaN(value) ? defaultValue : value;
  
  // Try to parse it - force conversion to string first to handle any weird input
  try {
    const parsed = parseFloat(String(value).replace(/,/g, ''));
    return isNaN(parsed) ? defaultValue : parsed;
  } catch (e) {
    return defaultValue;
  }
}

/**
 * Check owner access with enhanced validation and logging
 */
async function ownerAccessCheck(req) {
  if (!req.user) {
    console.error('No user found in request');
    return { allowed: false, reason: 'Authentication required' };
  }

  console.log('Owner access check for user:', {
    id: req.user?.user_id,
    email: req.user?.email,
    isowner: req.user?.isowner,
    ownerType: typeof req.user?.isowner
  });

  try {
    // Find user in database to ensure we have fresh owner status
    const user = await prisma.users.findUnique({
      where: { user_id: req.user.user_id }
    });

    if (!user) {
      console.error('User not found in database:', req.user.user_id);
      return { allowed: false, reason: 'User not found' };
    }

    // Handle all possible truthy values for isowner
    const isOwner = ['1', 1, true, 'true', 'yes', 'YES'].includes(user.isowner) || 
                    Number(user.isowner) === 1;
  
    if (!isOwner) {
      console.error('Owner access denied:', {
        isownerValue: user.isowner,
        valueType: typeof user.isowner,
        userEmail: user.email,
        userId: user.user_id
      });
      return { allowed: false, reason: 'Only owner accounts can view analytics' };
    }

    return { allowed: true, userId: user.user_id };
  } catch (error) {
    console.error('Error checking owner access:', error);
    return { allowed: false, reason: 'Error checking owner status' };
  }
}

/**
 * Calculate average duration from bookings
 */
function calculateAverageDuration(bookings) {
  if (!bookings || !Array.isArray(bookings) || bookings.length === 0) return 0;

  const durations = bookings
    .filter(b => b.start_date && b.end_date)
    .map(b => {
      const start = new Date(b.start_date);
      const end = new Date(b.end_date);
      return Math.max(0, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
    });

  return durations.length ? 
    parseFloat((durations.reduce((sum, d) => sum + d, 0) / durations.length).toFixed(1)) : 0;
}

/**
 * Calculate occupancy rate
 */
function calculateOccupancyRate(bookings, totalSpots) {
  if (!bookings || bookings.length === 0 || !totalSpots) return 0;

  const totalDays = bookings.reduce((sum, b) => {
    if (!b.start_date || !b.end_date) return sum;
    const start = new Date(b.start_date);
    const end = new Date(b.end_date);
    return sum + Math.max(0, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
  }, 0);

  return Math.min(100, Math.round((totalDays / (totalSpots * 30)) * 100));
}

/**
 * Generate empty analytics response
 */
function generateEmptyAnalytics() {
  return {
    revenue: {
      total: 0,
      monthly: 0,
      projected: 0,
      growth: 0,
      cancelled: 0,
      monthlyCancelled: 0,
      average: 0
    },
    bookings: {
      total: 0,
      monthly: 0,
      averageDuration: 0,
      occupancyRate: 0,
      growth: 0,
      active: 0,
      monthlyChange: 0,
      durationChange: 0
    },
    insights: {
      averageLeadTime: 0,
      overallCancellationRate: 0,
      repeatBookingRate: 0,
      weekendPopularity: 0,
      seasonalTrends: {
        peakMonth: 'No bookings',
        count: 0
      }
    },
    popularSpots: [],
    spotPerformance: [],
    totalSpots: 0,
    currentMonth: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    totalBookedDays: 0,
    totalAvailableDays: 0,
    recentBookings: []
  };
}

router.get('/', async (req, res) => {
  try {
    // Validate user and owner access
    const access = await ownerAccessCheck(req);
    if (!access.allowed) {
      return res.status(403).json({
        error: access.reason,
        details: 'Owner privileges are required to access analytics'
      });
    }

    // Get all camping spots for this owner with complete data
    const spotStats = await prisma.camping_spot.findMany({
      where: { 
        owner_id: access.userId 
      },
      include: {
        bookings: {
          include: { 
            status_booking_transaction: true,
            users: true 
          }
        },
        camping_spot_amenities: {
          include: { amenity: true }
        },
        location: true
      }
    });

    // Return empty data if no spots
    if (!spotStats || spotStats.length === 0) {
      console.log('No spots found for owner:', access.userId);
      return res.json(generateEmptyAnalytics());
    }

    // Get all valid bookings (exclude status 5 - blocked)
    const allBookings = spotStats.flatMap(spot => 
      (spot.bookings || []).filter(b => b && b.status_id !== 5)
    );

    // Return empty data with spot count if no bookings
    if (!allBookings || allBookings.length === 0) {
      const emptyData = generateEmptyAnalytics();
      emptyData.totalSpots = spotStats.length;
      emptyData.totalAvailableDays = spotStats.length * 30;
      return res.json(emptyData);
    }

    // Calculate core metrics
    const totalBookings = allBookings.length;
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    const monthlyBookings = allBookings.filter(b => {
      const startDate = new Date(b.start_date);
      return startDate.getMonth() === currentMonth && 
             startDate.getFullYear() === currentYear;
    });

    // Calculate revenue
    const totalRevenue = allBookings.reduce((sum, b) => 
      sum + ensureNumber(parseFloat(b.cost)), 0);
    
    const monthlyRevenue = monthlyBookings.reduce((sum, b) => 
      sum + ensureNumber(parseFloat(b.cost)), 0);

    const cancelledBookings = allBookings.filter(b => b.status_id === 3);
    const cancelledRevenue = cancelledBookings.reduce((sum, b) => 
      sum + ensureNumber(parseFloat(b.cost)), 0);

    // Build response
    const responseData = {
      revenue: {
        total: ensureNumber(totalRevenue),
        monthly: ensureNumber(monthlyRevenue),
        projected: ensureNumber(monthlyRevenue * 1.1), // Simple 10% projection
        growth: 0, // Would need historical data
        cancelled: ensureNumber(cancelledRevenue),
        monthlyCancelled: ensureNumber(
          cancelledBookings
            .filter(b => {
              const date = new Date(b.start_date);
              return date.getMonth() === currentMonth && 
                     date.getFullYear() === currentYear;
            })
            .reduce((sum, b) => sum + ensureNumber(parseFloat(b.cost)), 0)
        ),
        average: ensureNumber(totalRevenue / Math.max(1, totalBookings))
      },
      bookings: {
        total: ensureNumber(totalBookings),
        monthly: ensureNumber(monthlyBookings.length),
        averageDuration: ensureNumber(calculateAverageDuration(allBookings)),
        occupancyRate: ensureNumber(calculateOccupancyRate(allBookings, spotStats.length)),
        growth: 0, // Would need historical data
        active: ensureNumber(allBookings.filter(b => [2, 4].includes(b.status_id)).length),
        monthlyChange: 0, // Would need historical data
        durationChange: 0 // Would need historical data
      },
      insights: {
        averageLeadTime: 14, // Placeholder
        overallCancellationRate: ensureNumber(
          (cancelledBookings.length / totalBookings) * 100
        ),
        repeatBookingRate: 20, // Placeholder
        weekendPopularity: 65, // Placeholder
        seasonalTrends: {
          peakMonth: new Date().toLocaleString('default', { month: 'long' }),
          count: monthlyBookings.length
        }
      },
      popularSpots: spotStats
        .map(spot => ({
          id: spot.camping_spot_id,
          name: spot.title,
          bookings: spot.bookings?.filter(b => b.status_id !== 5).length || 0,
          revenue: spot.bookings
            ?.filter(b => b.status_id !== 5)
            .reduce((sum, b) => sum + ensureNumber(parseFloat(b.cost)), 0) || 0
        }))
        .sort((a, b) => b.bookings - a.bookings)
        .slice(0, 5),
      spotPerformance: spotStats
        .map(spot => {
          const spotBookings = spot.bookings?.filter(b => b.status_id !== 5) || [];
          const spotRevenue = spotBookings.reduce((sum, b) => 
            sum + ensureNumber(parseFloat(b.cost)), 0);
          return {
            id: spot.camping_spot_id,
            name: spot.title,
            bookings: spotBookings.length,
            revenue: spotRevenue,
            performance: spotBookings.length > 0 ? 
              spotRevenue / spotBookings.length : 0
          };
        })
        .sort((a, b) => b.performance - a.performance),
      totalSpots: ensureNumber(spotStats.length),
      currentMonth: new Date().toLocaleDateString('en-US', { 
        month: 'long', 
        year: 'numeric' 
      }),
      totalBookedDays: ensureNumber(
        allBookings.reduce((sum, b) => {
          if (!b.start_date || !b.end_date) return sum;
          const start = new Date(b.start_date);
          const end = new Date(b.end_date);
          return sum + Math.max(0, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
        }, 0)
      ),
      totalAvailableDays: ensureNumber(spotStats.length * 30),
      recentBookings: allBookings
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 10)
        .map(b => ({
          id: b.booking_id,
          spotName: spotStats.find(s => s.camping_spot_id === b.camper_id)?.title || 'Unknown',
          guestName: b.users?.full_name || 'Unknown',
          startDate: b.start_date,
          endDate: b.end_date,
          revenue: ensureNumber(parseFloat(b.cost)),
          status: b.status_booking_transaction?.status?.toLowerCase() || 'unknown',
          cancelled: b.status_id === 3
        }))
    };

    res.json(responseData);
  } catch (error) {
    console.error('Analytics error:', {
      message: error.message,
      stack: error.stack,
      type: error.name,
      code: error.code
    });

    res.status(500).json({
      error: 'Failed to fetch analytics data',
      details: error.message,
      errorType: error.name,
      errorCode: error.code || 'UNKNOWN_ERROR'
    });
  }
});

module.exports = router;
