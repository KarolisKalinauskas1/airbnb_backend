const express = require('express');
const router = express.Router();
const { authenticate } = require('../../../middlewares/auth');
const analyticsRouter = require('./analytics');

router.use('/analytics', authenticate, analyticsRouter);

// Apply authentication to all other dashboard routes
router.use(authenticate);

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
 * Helper function to calculate growth rate
 */
function calculateGrowthRate(current, previous) {
  if (!previous) return current > 0 ? 100 : 0;
  if (current === previous) return 0;
  return parseFloat(((current - previous) / Math.max(1, previous) * 100).toFixed(1));
}

/**
 * Helper function for safe average calculation
 */
function calculateSafeAverage(total, count) {
  if (!count || count <= 0) return 0;
  return parseFloat((total / count).toFixed(2));
}

/**
 * Generate empty dashboard data structure
 */
function generateEmptyDashboardData() {
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
        peakMonth: new Date().toLocaleString('default', { month: 'long' }),
        count: 0
      },
      peakDays: {
        peakDay: 'Saturday',
        lowestDay: 'Tuesday',
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
    currentMonth: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    totalBookedDays: 0,
    totalAvailableDays: 0,
    occupancyChange: 0,
    durationChange: 0,
    averageDuration: 0,
    recentBookings: [],
    debugInfo: {
      timestamp: new Date().toISOString(),
      dataAge: 'fresh',
      hasRevenue: true,
      hasBookings: true,
      totalRevenue: 0,
      monthlyRevenue: 0,
      totalBookings: 0,
      monthlyBookings: 0
    }
  };
}

/**
 * Calculate average duration from bookings
 */
function calculateAverageDuration(bookings) {
  if (!bookings || bookings.length === 0) return 0;
  
  const validDurations = bookings
    .filter(b => b.start_date && b.end_date)
    .map(b => {
      const start = new Date(b.start_date);
      const end = new Date(b.end_date);
      return Math.max(0, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
    })
    .filter(duration => duration > 0);
    
  return validDurations.length > 0 
    ? parseFloat((validDurations.reduce((sum, duration) => sum + duration, 0) / validDurations.length).toFixed(1))
    : 0;
}

/**
 * Calculate seasonal trends for bookings
 */
function calculateSeasonalTrends(bookings) {
  const monthlyData = Array(12).fill(0);
  bookings.forEach(booking => {
    const startDate = new Date(booking.start_date);
    const month = startDate.getMonth();
    monthlyData[month] += 1;
  });
  return monthlyData.map((count, index) => ({
    month: new Date(0, index).toLocaleString('default', { month: 'long' }),
    count
  }));
}

/**
 * Calculate peak days for bookings
 */
function calculatePeakDays(bookings) {
  const dailyData = {
    Sunday: 0,
    Monday: 0,
    Tuesday: 0,
    Wednesday: 0,
    Thursday: 0,
    Friday: 0,
    Saturday: 0
  };
  bookings.forEach(booking => {
    const startDate = new Date(booking.start_date);
    const dayName = startDate.toLocaleString('default', { weekday: 'long' });
    if (dailyData[dayName] !== undefined) {
      dailyData[dayName] += 1;
    }
  });
  const totalDays = Object.values(dailyData).reduce((sum, count) => sum + count, 0);
  return {
    peakDay: Object.keys(dailyData).reduce((a, b) => dailyData[a] > dailyData[b] ? a : b),
    lowestDay: Object.keys(dailyData).reduce((a, b) => dailyData[a] < dailyData[b] ? a : b),
    weekendPercentage: parseFloat(((dailyData.Saturday + dailyData.Sunday) / totalDays) * 100).toFixed(1),
    distribution: Object.entries(dailyData).map(([day, count]) => ({
      day,
      bookings: count,
      percentage: parseFloat((count / totalDays * 100).toFixed(1))
    }))
  };
}

/**
 * Calculate total booked days from bookings
 */
function calculateTotalBookedDays(bookings) {
  if (!bookings || bookings.length === 0) return 0;
  return bookings.reduce((sum, b) => {
    if (b.start_date && b.end_date) {
      const start = new Date(b.start_date);
      const end = new Date(b.end_date);
      const duration = Math.max(0, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
      return sum + duration;
    }
    return sum;
  }, 0);
}

/**
 * Calculate average lead time from bookings
 */
function calculateAverageLeadTime(bookings) {
  if (!bookings || bookings.length === 0) return 0;
  
  const leadTimes = bookings.map(booking => {
    if (!booking.created_at || !booking.start_date) return 0;
    const createdAt = new Date(booking.created_at);
    const startDate = new Date(booking.start_date);
    return Math.max(0, Math.ceil((startDate - createdAt) / (1000 * 60 * 60 * 24)));
  }).filter(lt => lt > 0);
  
  return calculateSafeAverage(leadTimes.reduce((sum, lt) => sum + lt, 0), leadTimes.length);
}

/**
 * Calculate repeat booking rate
 */
function calculateRepeatBookingRate(bookings) {
  if (!bookings || bookings.length === 0) return 0;
  
  const userBookings = bookings.reduce((acc, booking) => {
    const userId = booking.user_id;
    acc[userId] = (acc[userId] || 0) + 1;
    return acc;
  }, {});
  
  const repeatUsers = Object.values(userBookings).filter(count => count > 1).length;
  const totalUsers = Object.keys(userBookings).length;
  
  return totalUsers > 0 ? parseFloat(((repeatUsers / totalUsers) * 100).toFixed(1)) : 0;
}

/**
 * Calculate weekend popularity
 */
function calculateWeekendPopularity(bookings) {
  if (!bookings || bookings.length === 0) return 0;
  
  const dayStats = bookings.reduce((acc, booking) => {
    if (booking.start_date) {
      const day = new Date(booking.start_date).getDay();
      acc.total++;
      if (day === 0 || day === 6) acc.weekend++;
    }
    return acc;
  }, { weekend: 0, total: 0 });
  
  return dayStats.total > 0 ? parseFloat(((dayStats.weekend / dayStats.total) * 100).toFixed(1)) : 0;
}

/**
 * Calculate seasonal trends
 */
function calculateSeasonalTrends(bookings) {
  if (!bookings || bookings.length === 0) {
    return {
      peakMonth: 'No bookings',
      count: 0,
      distribution: {}
    };
  }
  
  const monthlyBookings = Array(12).fill(0);
  bookings.forEach(booking => {
    if (booking.start_date) {
      const month = new Date(booking.start_date).getMonth();
      monthlyBookings[month]++;
    }
  });
  
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  
  const peakCount = Math.max(...monthlyBookings);
  const peakMonthIndex = monthlyBookings.indexOf(peakCount);
  
  const distribution = {};
  monthNames.forEach((month, i) => {
    distribution[month] = monthlyBookings[i];
  });
  
  return {
    peakMonth: peakCount > 0 ? monthNames[peakMonthIndex] : 'No bookings',
    count: peakCount,
    distribution
  };
}

/**
 * Calculate occupancy rate from completed bookings
 * @param {Array} bookings - Array of completed bookings
 * @param {number} totalSpots - Total number of spots available
 * @returns {number} - Occupancy rate as a percentage
 */
function calculateOccupancyRate(bookings, totalSpots) {
  if (!bookings || bookings.length === 0 || !totalSpots || totalSpots <= 0) return 0;
  
  // Calculate total booked days
  const totalBookedDays = bookings.reduce((sum, booking) => {
    if (!booking.start_date || !booking.end_date) return sum;
    
    const start = new Date(booking.start_date);
    const end = new Date(booking.end_date);
    const duration = Math.max(0, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
    return sum + duration;
  }, 0);

  // Calculate total available days (totalSpots * 30 days)
  const totalAvailableDays = totalSpots * 30;
  
  // Calculate and return occupancy rate as a percentage
  return Math.min(100, parseFloat((totalBookedDays / totalAvailableDays * 100).toFixed(1)));
}

// Get analytics data
router.get('/analytics', authenticate, async (req, res) => {
  try {
    // Get user ID from request
    const userId = req.user?.user_id;
    if (!userId) {
      console.error('No user ID in request:', req.user);
      return res.status(400).json({ 
        error: 'User ID not found',
        data: generateEmptyDashboardData() // Return empty but valid structure
      });
    }

    // Check owner status
    const isOwner = ['1', 1, true, 'true', 'yes', 'YES'].includes(req.user.isowner) || 
                    Number(req.user.isowner) === 1;
                    
    if (!req.user || !isOwner) {
      console.log('User owner status check failed:', req.user?.isowner);
      return res.status(403).json({ 
        error: 'Owner account required',
        data: generateEmptyDashboardData()
      });
    }

    // Get all camping spots for this owner with detailed information
    const spotStats = await prisma.camping_spot.findMany({
      where: { owner_id: parseInt(userId, 10) },
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

    // If no spots found, return empty dashboard
    if (!spotStats || spotStats.length === 0) {
      console.log('No spots found for owner:', userId);
      return res.json(generateEmptyDashboardData());
    }

    // Get all bookings
    const allBookings = spotStats.flatMap(spot => 
      (spot.bookings || []).filter(b => b && b.status_id !== 5)
    );

    // Process booking data with validation
    const validBookings = allBookings.filter(b => b && b.start_date && b.end_date);
    const completedBookings = validBookings.filter(b => [2, 4].includes(b.status_id));

    // Build response with actual data
    const responseData = buildDashboardResponse(spotStats, validBookings, completedBookings);

    // Add debug information
    responseData.debugInfo = {
      timestamp: new Date().toISOString(),
      dataAge: 'fresh',
      hasRevenue: true,
      hasBookings: true,
      totalSpots: spotStats.length,
      totalBookings: validBookings.length,
      validBookings: validBookings.length,
      completedBookings: completedBookings.length
    };

    res.json(responseData);
  } catch (error) {
    console.error('Analytics error:', error);
    // Return error response with empty but valid data structure
    res.status(500).json({
      error: 'Failed to fetch analytics data',
      message: error.message,
      data: generateEmptyDashboardData()
    });
  }
});

// Get owner's spots
router.get('/spots', async (req, res) => {
  try {
    // Get user ID from request
    const userId = req.user?.user_id;
    if (!userId) {
      return res.status(400).json({ error: 'User ID not found in request' });
    }

    // Parse and validate user ID
    const parsedUserId = parseInt(userId, 10);
    if (isNaN(parsedUserId)) {
      console.error('Failed to parse user ID:', { userId, type: typeof userId });
      return res.status(400).json({ error: 'Invalid user ID format' });
    }

    console.log('Fetching spots for owner:', { 
      originalId: userId, 
      parsedId: parsedUserId,
      userEmail: req.user?.email 
    });    // Ensure owner_id is an integer when querying
    const owner_id = parseInt(parsedUserId, 10);
    if (isNaN(owner_id)) {
      console.error('Invalid owner_id:', { parsedUserId, type: typeof parsedUserId });
      return res.status(400).json({ error: 'Invalid owner ID format' });
    }

    const spots = await prisma.camping_spot.findMany({
      where: {
        owner_id: owner_id
      },
      include: {
        images: true,
        location: {
          include: { country: true }
        },
        camping_spot_amenities: {
          include: { amenity: true }
        },
        bookings: true
      }
    });

    console.log(`Found ${spots.length} spots for owner ${parsedUserId}`);
    res.json(spots);
  } catch (error) {
    console.error('Error fetching owner spots:', error);
    res.status(500).json({ 
      error: 'Failed to fetch spots',
      details: error.message
    });
  }
});

// Get bookings for owner's spots
router.get('/bookings', async (req, res) => {
  try {
    // Check owner status using normalized user object
    const isOwner = ['1', 1, true, 'true', 'yes', 'YES'].includes(req.user.isowner) || 
                    Number(req.user.isowner) === 1;
                    
    if (!req.user || !isOwner) {
      console.log('User owner status:', req.user?.isowner);
      return res.status(403).json({ error: 'Owner account required' });
    }

    // First get all spots owned by the user
    const spots = await prisma.camping_spot.findMany({
      where: {
        owner_id: Number(req.user.user_id) // Ensure owner_id is a number
      },
      select: {
        camping_spot_id: true
      }
    });

    if (!spots || spots.length === 0) {
      return res.json([]);
    }

    // Get all bookings for these spots
    const spotIds = spots.map(spot => spot.camping_spot_id);
    
    const bookings = await prisma.bookings.findMany({
      where: {
        camper_id: {
          in: spotIds
        }
      },
      include: {
        camping_spot: true,
        users: {
          select: {
            full_name: true,
            email: true
          }
        }
      },
      orderBy: {
        created_at: 'desc'
      }
    });

    res.json(bookings);
  } catch (error) {
    console.error('Error fetching owner bookings:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

router.get('/', async (req, res) => {
  try {
    // Verify user authentication and required fields
    if (!req.user) {
      console.log('No user found in request');
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!req.user.user_id && !req.user.email) {
      console.log('Missing required user identification:', req.user);
      return res.status(400).json({ error: 'Invalid user data' });
    }

    console.log('Dashboard request from user:', req.user);
      // First find the public user by user_id or email
    const publicUser = await prisma.users.findFirst({
      where: {
        OR: [
          // Try to match by user_id first, ensure it's an integer
          ...(req.user.user_id ? [{ user_id: parseInt(req.user.user_id, 10) }] : []),
          // Try to match by email
          ...(req.user.email ? [{ email: req.user.email }] : [])
        ]
      }
    });

    if (!publicUser) {
      console.log('User not found in database, user info:', req.user);
      return res.status(404).json({ error: 'User not found' });
    }    // Verify that the user is an owner using consistent checking
    const isOwner = ['1', 1, true, 'true', 'yes', 'YES'].includes(publicUser.isowner) || 
                    Number(publicUser.isowner) === 1;
                    
    if (!isOwner) {
      console.log('Non-owner user tried to access dashboard:', {
        userId: publicUser.user_id,
        isowner: publicUser.isowner,
        type: typeof publicUser.isowner
      });
      return res.status(403).json({ error: 'Access denied. Owner account required.' });
    }

    // Get the owner record for this user
    const owner = await prisma.owner.findUnique({
      where: {
        owner_id: publicUser.user_id
      },
      include: {
        camping_spot: {
          include: {
            images: true,
            location: true,
            bookings: {
              where: {
                status_id: {
                  not: 5 // Exclude blocked bookings
                }
              },
              include: {
                status_booking_transaction: true,
                users: {
                  select: {
                    full_name: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!owner) {
      console.log('Owner record not found for user:', publicUser.user_id);
      // Create owner record if it doesn't exist
      try {
        const newOwner = await prisma.owner.create({
          data: {
            owner_id: publicUser.user_id,
            license: 'auto-created'  // You might want to change this
          }
        });
        console.log('Created new owner record:', newOwner);
        // Return empty dashboard data since they're a new owner
        return res.json({
          spots: [],
          stats: {
            totalSpots: 0,
            totalBookings: 0,
            totalRevenue: 0,
            occupancyRate: 0,
            recentBookings: []
          }
        });
      } catch (createError) {
        console.error('Failed to create owner record:', createError);
        return res.status(500).json({ error: 'Failed to setup owner account' });
      }
    }

    // Transform the data to match frontend expectations
    const transformedData = {
      ...publicUser,
      spots: owner.camping_spot || [],
      bookings: owner.camping_spot.flatMap(spot => 
        spot.bookings.map(booking => ({
          id: booking.booking_id,
          start_date: booking.start_date,
          end_date: booking.end_date,
          cost: booking.cost,
          status: booking.status_booking_transaction?.status || 'unknown',
          guest_name: booking.users?.full_name || 'Unknown Guest',
          created_at: booking.created_at,
          spot: {
            name: spot.title,
            images: spot.images?.map(img => ({
              image_url: img.image_url
            })) || [],
            description: spot.description || '',
            price_per_night: spot.price_per_night || 0,
            location: spot.location || {}
          }
        }))
      )
    };

    res.json(transformedData);
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({ error: error.message });
  }
});

function buildDashboardResponse(spotStats, validBookings, completedBookings) {
  // Default to empty arrays if parameters are null/undefined
  spotStats = spotStats || [];
  validBookings = validBookings || [];
  completedBookings = completedBookings || [];

  try {
    // Calculate revenue metrics
    const totalRevenue = validBookings.reduce((sum, b) => {
      const cost = parseFloat(b.cost || 0);
      return sum + (isNaN(cost) ? 0 : cost);
    }, 0);

    // Calculate monthly metrics
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const monthlyBookings = validBookings.filter(b => {
      const startDate = new Date(b.start_date);
      return startDate.getMonth() === currentMonth && startDate.getFullYear() === currentYear;
    }).length;

    const monthlyRevenue = validBookings
      .filter(b => {
        const startDate = new Date(b.start_date);
        return startDate.getMonth() === currentMonth && startDate.getFullYear() === currentYear;
      })
      .reduce((sum, b) => {
        const cost = parseFloat(b.cost || 0);
        return sum + (isNaN(cost) ? 0 : cost);
      }, 0);

    // Calculate average duration
    const averageDuration = calculateAverageDuration(completedBookings);
    
    // Calculate occupancy rate from completed bookings only
    const occupancyRate = calculateOccupancyRate(completedBookings, spotStats.length);

    // Calculate popular spots with accurate metrics
    const popularSpots = spotStats
      .map(spot => {
        const spotBookings = (spot.bookings || []).filter(b => [2, 4].includes(b.status_id)); // Only confirmed/completed
        const spotRevenue = spotBookings.reduce((sum, b) => sum + (parseFloat(b.cost) || 0), 0);
        
        // Calculate spot's occupancy rate
        const bookedDays = spotBookings.reduce((sum, b) => {
          const start = new Date(b.start_date);
          const end = new Date(b.end_date);
          return sum + Math.max(0, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
        }, 0);
        
        const availableDays = 30; // Last 30 days
        const spotOccupancyRate = Math.min(100, (bookedDays / availableDays) * 100);

        return {
          id: spot.camping_spot_id,
          name: spot.title,
          bookings: spotBookings.length,
          revenue: spotRevenue,
          occupancyRate: parseFloat(spotOccupancyRate.toFixed(1))
        };
      })
      .sort((a, b) => b.revenue - a.revenue) // Sort by revenue
      .slice(0, 5); // Top 5 spots

    // Build the response
    return {
      revenue: {
        total: ensureNumber(totalRevenue),
        monthly: ensureNumber(monthlyRevenue),
        projected: monthlyRevenue > 0 ? ensureNumber(monthlyRevenue * 1.1) : 0,
        growth: 0,
        cancelled: ensureNumber(
          validBookings
            .filter(b => b.status_id === 3)
            .reduce((sum, b) => sum + (parseFloat(b.cost) || 0), 0)
        ),
        monthlyCancelled: 0,
        average: calculateSafeAverage(totalRevenue, completedBookings.length)
      },
      bookings: {
        total: ensureNumber(completedBookings.length),
        monthly: ensureNumber(monthlyBookings),
        averageDuration: ensureNumber(averageDuration),
        occupancyRate: ensureNumber(occupancyRate),
        growth: 0,
        active: ensureNumber(completedBookings.length),
        monthlyChange: 0,
        durationChange: 0
      },
      insights: {
        averageLeadTime: ensureNumber(calculateAverageLeadTime(validBookings)),
        overallCancellationRate: ensureNumber(
          validBookings.length > 0
            ? (validBookings.filter(b => b.status_id === 3).length / validBookings.length * 100)
            : 0
        ),
        repeatBookingRate: ensureNumber(calculateRepeatBookingRate(validBookings)),
        weekendPopularity: ensureNumber(calculateWeekendPopularity(validBookings)),
        seasonalTrends: calculateSeasonalTrends(completedBookings),
        peakDays: calculatePeakDays(completedBookings)
      },
      popularSpots,
      totalSpots: ensureNumber(spotStats.length),
      currentMonth: new Date().toLocaleDateString('en-US', { 
        month: 'long',
        year: 'numeric'
      }),
      totalBookedDays: ensureNumber(calculateTotalBookedDays(completedBookings)),
      totalAvailableDays: ensureNumber(spotStats.length * 30),
      occupancyChange: 0,
      durationChange: 0,
      averageDuration: ensureNumber(averageDuration),
      recentBookings: validBookings
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 10)
        .map(b => ({
          id: b.booking_id,
          spotName: spotStats.find(s => s.camping_spot_id === b.camper_id)?.title || 'Unknown',
          guestName: b.users?.full_name || 'Unknown',
          startDate: b.start_date?.toISOString() || null,
          endDate: b.end_date?.toISOString() || null,
          revenue: ensureNumber(parseFloat(b.cost || 0)),
          status: b.status_booking_transaction?.status?.toLowerCase() || 'unknown',
          cancelled: b.status_id === 3
        }))
    };
  } catch (error) {
    console.error('Error building dashboard response:', error);
    return generateEmptyDashboardData();
  }
}

module.exports = router;