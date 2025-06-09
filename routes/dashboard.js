const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { authenticate } = require('../middlewares/auth');
const dashboardFeatures = require('../src/features/dashboard/routes');

// Add request logging
router.use((req, res, next) => {
  console.log(`[DASHBOARD] ${req.method} ${req.path} - Headers:`, {
    authorization: req.headers.authorization ? 'Bearer token present' : 'No auth header',
    origin: req.headers.origin,
    userAgent: req.headers['user-agent']?.substring(0, 50)
  });
  next();
});

// Use the features module routes
router.use('/', dashboardFeatures);

// Cache settings - shorter time for development, adjust for production
const dashboardCache = new Map();
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes for more frequent refresh during development

/**
 * Ensure a value is a proper number
 * This helper function ensures consistent numerical processing across the API
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
 * Helper function for MAX value
 */
function MAX(a, b) {
  return Math.max(ensureNumber(a), ensureNumber(b));
}

/**
 * Check if user is allowed to access owner dashboard
 */
async function ownerAccessCheck(req, res) {
  if (!req.user) {
    console.error('No user found in request');
    return { allowed: false, reason: 'Authentication required' };
  }

  console.log('Owner access check for user:', {
    id: req.user?.user_id,
    email: req.user?.email,
    isowner: req.user?.isowner,
    type: typeof req.user?.isowner,
    headers: {
      authorization: req.headers.authorization ? 'present' : 'missing',
      cookie: req.headers.cookie ? 'present' : 'missing'
    }
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
 * Find the most frequent peak month across all camping spots
 */
function getMostFrequentPeakMonth(spotPerformance) {
  // Count peak month frequencies
  const monthCounts = {};
  spotPerformance.forEach(spot => {
    if (spot.peakMonth) {
      monthCounts[spot.peakMonth] = (monthCounts[spot.peakMonth] || 0) + 1;
    }
  });
  
  // Find the most frequent month
  let mostFrequentMonth = null;
  let highestCount = 0;
  
  Object.entries(monthCounts).forEach(([month, count]) => {
    if (count > highestCount) {
      mostFrequentMonth = month;
      highestCount = count;
    }
  });
  
  return {
    peakMonth: mostFrequentMonth || 'Unknown',
    count: highestCount,
    distribution: monthCounts
  };
}

/**
 * Calculate the most and least popular days of the week
 */
function calculatePeakDays(spotPerformance) {
  // Aggregate weekday occupancy across all spots
  const aggregatedWeekdays = Array(7).fill(0);
  
  spotPerformance.forEach(spot => {
    if (spot.weekdayOccupancy && Array.isArray(spot.weekdayOccupancy)) {
      spot.weekdayOccupancy.forEach((count, index) => {
        aggregatedWeekdays[index] += count || 0;
      });
    }
  });
  
  // Map day indices to names
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  
  // Find peak and lowest day
  let peakDayIndex = 0;
  let lowestDayIndex = 0;
  let peakValue = aggregatedWeekdays[0];
  let lowestValue = aggregatedWeekdays[0];
  
  aggregatedWeekdays.forEach((value, index) => {
    if (value > peakValue) {
      peakValue = value;
      peakDayIndex = index;
    }
    if (value < lowestValue) {
      lowestValue = value;
      lowestDayIndex = index;
    }
  });
  
  // Create the distribution with normalized percentages
  const total = aggregatedWeekdays.reduce((sum, val) => sum + val, 0) || 1;
  const distribution = aggregatedWeekdays.map((val, index) => ({
    day: dayNames[index],
    bookings: val,
    percentage: parseFloat(((val / total) * 100).toFixed(1))
  }));
  
  return {
    peakDay: dayNames[peakDayIndex],
    lowestDay: dayNames[lowestDayIndex],
    weekendPercentage: parseFloat((((aggregatedWeekdays[5] + aggregatedWeekdays[6]) / total) * 100).toFixed(1)),
    distribution
  };
}

/**
 * Analyze the impact of amenities on spot performance
 */
function calculateAmenityImpact(spotStats) {
  // Map to store amenity stats
  const amenityStats = new Map();
  
  // Process each spot
  spotStats.forEach(spot => {
    // Skip if no amenities or bookings data
    if (!spot.camping_spot_amenities || !spot.bookings) {
      return;
    }
    
    // Calculate spot performance metrics
    const validBookings = spot.bookings.filter(b => b && b.status_id !== 5) || [];
    const totalRevenue = validBookings.reduce((sum, booking) => {
      return sum + parseFloat(booking.cost || 0);
    }, 0);
    const performance = validBookings.length > 0 ? totalRevenue / validBookings.length : 0;
    
    // Process each amenity
    spot.camping_spot_amenities.forEach(amenityItem => {
      const amenity = amenityItem.amenity?.name || 'Unknown';
      
      if (!amenityStats.has(amenity)) {
        amenityStats.set(amenity, {
          name: amenity,
          spotCount: 0,
          totalBookings: 0,
          totalRevenue: 0,
          performances: []
        });
      }
      
      // Update amenity stats
      const stats = amenityStats.get(amenity);
      stats.spotCount += 1;
      stats.totalBookings += validBookings.length;
      stats.totalRevenue += totalRevenue;
      stats.performances.push(performance);
    });
  });
  
  // Calculate averages and format results
  const result = [];
  amenityStats.forEach((stats, amenity) => {
    const avgPerformance = stats.performances.length > 0 ? 
      stats.performances.reduce((sum, val) => sum + val, 0) / stats.performances.length : 0;
    
    // Calculate average revenue per booking with this amenity
    const avgRevenuePerBooking = stats.totalBookings > 0 ? 
      stats.totalRevenue / stats.totalBookings : 0;
    
    result.push({
      name: amenity,
      spotCount: ensureNumber(stats.spotCount),
      bookingCount: ensureNumber(stats.totalBookings),
      avgRevenuePerBooking: ensureNumber(parseFloat(avgRevenuePerBooking.toFixed(2))),
      avgPerformance: ensureNumber(parseFloat(avgPerformance.toFixed(2))),
      impact: ensureNumber(parseFloat((avgPerformance * stats.spotCount / 100).toFixed(2)))
    });
  });
  
  // Sort by impact score (highest first)
  return result.sort((a, b) => b.impact - a.impact).slice(0, 5);
}

/**
 * Calculate growth rate with protection against division by zero
 */
function calculateGrowthRate(current, previous) {
  // Convert inputs to numbers to handle string values
  current = ensureNumber(current);
  previous = ensureNumber(previous);
  
  if (!previous || previous === 0) {
    return current > 0 ? 100 : 0; // 100% growth if previous was zero but now has value
  }
  return parseFloat(((current - previous) / previous * 100).toFixed(1));
}

/**
 * Calculate average with protection against division by zero
 */
function calculateSafeAverage(total, count) {
  // Convert inputs to numbers to handle string values
  total = ensureNumber(total);
  count = ensureNumber(count);
  
  if (!count || count === 0) return 0;
  return parseFloat((total / count).toFixed(2));
}

/**
 * Calculate the average duration of bookings
 */
function calculateAverageDuration(bookings) {
  if (!bookings || bookings.length === 0) return 0;
  
  const durations = bookings
    .filter(booking => booking.start_date && booking.end_date)
    .map(booking => {
      const start = new Date(booking.start_date);
      const end = new Date(booking.end_date);
      return Math.max(0, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
    });
  
  return durations.length > 0 
    ? parseFloat((durations.reduce((sum, duration) => sum + duration, 0) / durations.length).toFixed(1))
    : 0;
}

/**
 * Calculate the average lead time between booking creation and start date
 */
function calculateAverageLeadTime(bookings) {
  if (!bookings || bookings.length === 0) return 0;
  
  const leadTimes = bookings
    .filter(booking => booking.created_at && booking.start_date)
    .map(booking => {
      const createdDate = new Date(booking.created_at);
      const startDate = new Date(booking.start_date);
      return Math.max(0, Math.floor((startDate - createdDate) / (1000 * 60 * 60 * 24)));
    });
  
  return leadTimes.length > 0 
    ? parseFloat((leadTimes.reduce((sum, time) => sum + time, 0) / leadTimes.length).toFixed(1))
    : 0;
}

/**
 * Calculate the percentage of repeat bookings
 */
function calculateRepeatBookingRate(bookings) {
  if (!bookings || bookings.length === 0) return 0;
  
  const uniqueGuests = new Set(bookings.map(b => b.users?.user_id).filter(Boolean));
  const repeatBookings = bookings.length - uniqueGuests.size;
  
  return parseFloat(((repeatBookings / bookings.length) * 100).toFixed(1));
}

/**
 * Calculate weekend booking popularity
 */
function calculateWeekendPopularity(bookings) {
  if (!bookings || bookings.length === 0) return 0;
  
  let weekendDays = 0;
  let totalDays = 0;
  
  bookings.forEach(booking => {
    if (booking.start_date && booking.end_date) {
      const start = new Date(booking.start_date);
      const end = new Date(booking.end_date);
      
      for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
        totalDays++;
        // 5 is Friday, 6 is Saturday
        if (date.getDay() === 5 || date.getDay() === 6) {
          weekendDays++;
        }
      }
    }
  });
  
  return totalDays > 0 ? parseFloat(((weekendDays / totalDays) * 100).toFixed(1)) : 0;
}

/**
 * Calculate seasonal trends based on actual booking data
 */
function calculateSeasonalTrends(bookings) {
  if (!bookings || bookings.length === 0) {
    return {
      peakMonth: 'No data',
      count: 0,
      distribution: {}
    };
  }
  
  const monthlyBookings = Array(12).fill(0);
  const monthlyRevenue = Array(12).fill(0);
  
  bookings.forEach(booking => {
    if (booking.start_date) {
      const month = new Date(booking.start_date).getMonth();
      monthlyBookings[month]++;
      monthlyRevenue[month] += parseFloat(booking.cost || 0);
    }
  });
  
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  
  // Find peak month
  const peakMonthIndex = monthlyBookings.indexOf(Math.max(...monthlyBookings));
  
  const distribution = {};
  monthNames.forEach((month, index) => {
    distribution[month] = monthlyBookings[index];
  });
  
  return {
    peakMonth: monthNames[peakMonthIndex],
    count: monthlyBookings[peakMonthIndex],
    distribution
  };
}

/**
 * Get dashboard analytics data
 */
router.get('/analytics', authenticate, async (req, res) => {
  try {
    // Log authentication state
    console.log('Analytics request received:', { 
      user: req.user ? { 
        id: req.user.user_id, 
        email: req.user.email,
        isowner: req.user.isowner 
      } : 'No user' 
    });

    // Check if user exists and has owner privileges
    if (!req.user || !req.user.isowner) {
      console.log('Access denied:', { user: req.user });
      return res.status(403).json({ 
        error: 'Access denied', 
        message: 'Only owners can access analytics data',
        details: !req.user ? 'No user found' : 'User is not an owner'
      });
    }

    // Get spots owned by this user
    const spotStats = await prisma.camping_spots.findMany({
      where: { 
        owner_id: req.user.user_id 
      },
      include: {
        bookings: {
          include: {
            users: {
              select: {
                user_id: true,
                full_name: true,
                email: true
              }
            },
            status_booking_transaction: true
          }
        },
        camping_spot_amenities: {
          include: {
            amenity: true
          }
        },
        location: true
      }
    });

    if (!spotStats || spotStats.length === 0) {
      console.log('No spots found for user:', req.user.user_id);
      return res.json(generateEmptyDashboardData());
    }

    // Process all bookings
    const allBookings = spotStats.flatMap(spot => 
      (spot.bookings || []).filter(b => b && b.status_id !== 5)
    );

    // Calculate metrics
    const responseData = buildDashboardResponse(spotStats, allBookings);

    // Add debug information
    responseData.debugInfo = {
      timestamp: new Date().toISOString(),
      dataAge: 'fresh',
      hasRevenue: true,
      hasBookings: allBookings.length > 0,
      totalSpots: spotStats.length,
      totalBookings: allBookings.length
    };

    return res.json(responseData);

  } catch (error) {
    console.error('Analytics error:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });

    // Return error with valid data structure
    return res.status(500).json({
      error: 'Failed to fetch analytics data',
      message: error.message,
      data: generateEmptyDashboardData(),
      debugInfo: {
        timestamp: new Date().toISOString(),
        error: true,
        errorMessage: error.message,
        errorCode: error.code || 'UNKNOWN'
      }
    });
  }
});

/**
 * Generate basic response structure for empty dashboard with zero values
 */
function generateEmptyDashboardData() {
  const currentMonth = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
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
        count: 0,
        distribution: {}
      },
      peakDays: {
        peakDay: 'No data',
        lowestDay: 'No data',
        weekendPercentage: 0,
        distribution: [
          { day: 'Sunday', bookings: 0, percentage: 0 },
          { day: 'Monday', bookings: 0, percentage: 0 },
          { day: 'Tuesday', bookings: 0, percentage: 0 },
          { day: 'Wednesday', bookings: 0, percentage: 0 },
          { day: 'Thursday', bookings: 0, percentage: 0 },
          { day: 'Friday', bookings: 0, percentage: 0 },
          { day: 'Saturday', bookings: 0, percentage: 0 }
        ]
      }
    },
    popularSpots: [],
    spotPerformance: [],
    totalSpots: 0,
    currentMonth,
    totalBookedDays: 0,
    totalAvailableDays: 0,
    occupancyChange: 0,
    durationChange: 0,
    averageDuration: 0,
    recentBookings: []
  };
}

/**
 * Return data with proper empty/zero values when there are no bookings
 */
function buildDashboardResponse(spotStats) {
  // Check for no spots
  if (!spotStats || spotStats.length === 0) {
    return generateEmptyDashboardData();
  }

  // Get all valid (non-blocked) bookings
  const allBookings = spotStats.flatMap(spot => 
    (spot.bookings || []).filter(b => b && b.status_id !== 5)
  );

  // If no bookings, return empty data with spot count
  if (!allBookings || allBookings.length === 0) {
    const emptyData = generateEmptyDashboardData();
    emptyData.totalSpots = spotStats.length;
    emptyData.totalAvailableDays = spotStats.length * 30;
    return emptyData;
  }

  // Calculate all metrics using real data
  const validBookings = allBookings.filter(b => b && b.status_id !== 5);
  const completedBookings = validBookings.filter(b => [2, 4].includes(b.status_id));
  
  // Calculate core metrics
  const totalBookings = validBookings.length;
  const monthlyBookings = validBookings.filter(b => {
    const startDate = new Date(b.start_date);
    const currentDate = new Date();
    return startDate.getMonth() === currentDate.getMonth() &&
            startDate.getFullYear() === currentDate.getFullYear();
  }).length;

  const averageDuration = calculateAverageDuration(completedBookings);
  const seasonalTrends = calculateSeasonalTrends(completedBookings);
  const peakDays = calculatePeakDays(completedBookings);

  // Calculate revenue
  const totalRevenue = validBookings.reduce((sum, b) => sum + (parseFloat(b.cost) || 0), 0);
  const monthlyRevenue = validBookings
    .filter(b => {
      const startDate = new Date(b.start_date);
      const currentDate = new Date();
      return startDate.getMonth() === currentDate.getMonth() &&
              startDate.getFullYear() === currentDate.getFullYear();
    })
    .reduce((sum, b) => sum + (parseFloat(b.cost) || 0), 0);

  const cancelledRevenue = validBookings
    .filter(b => b.status_id === 3)
    .reduce((sum, b) => sum + (parseFloat(b.cost) || 0), 0);

  // Build response
  const responseData = {
    revenue: {
      total: ensureNumber(totalRevenue),
      monthly: ensureNumber(monthlyRevenue),
      projected: 0, // No projection with insufficient data
      growth: 0, // Needs historical data
      cancelled: ensureNumber(cancelledRevenue),
      monthlyCancelled: 0,
      average: calculateSafeAverage(totalRevenue, totalBookings)
    },
    bookings: {
      total: ensureNumber(totalBookings),
      monthly: ensureNumber(monthlyBookings),
      averageDuration: ensureNumber(averageDuration),
      occupancyRate: ensureNumber(calculateOccupancyRate(completedBookings, spotStats.length)),
      growth: 0, // Needs historical data
      active: ensureNumber(completedBookings.length),
      monthlyChange: 0,
      durationChange: 0
    },
    insights: {
      averageLeadTime: ensureNumber(calculateAverageLeadTime(validBookings)),
      overallCancellationRate: validBookings.length > 0 ?
        ensureNumber((validBookings.filter(b => b.status_id === 3).length / validBookings.length * 100).toFixed(1)) : 0,
      repeatBookingRate: ensureNumber(calculateRepeatBookingRate(validBookings)),
      weekendPopularity: ensureNumber(calculateWeekendPopularity(validBookings)),
      seasonalTrends,
      peakDays
    },
    totalSpots: ensureNumber(spotStats.length),
    currentMonth: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    totalBookedDays: ensureNumber(calculateTotalBookedDays(completedBookings)),
    totalAvailableDays: ensureNumber(spotStats.length * 30),
    occupancyChange: 0, // Needs historical data
    durationChange: 0, // Needs historical data
    averageDuration: ensureNumber(averageDuration),
    recentBookings: validBookings
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 10)
      .map(b => ({
        id: b.booking_id,
        spotName: spotStats.find(s => s.camping_spot_id === b.camper_id)?.title || 'Unknown',
        guestName: b.users?.full_name || 'Unknown',
        startDate: b.start_date,
        endDate: b.end_date,
        revenue: ensureNumber(parseFloat(b.cost || 0)),
        status: b.status_booking_transaction?.status?.toLowerCase() || 'unknown',
        cancelled: b.status_id === 3
      }))
  };

  return responseData;
}

module.exports = router;