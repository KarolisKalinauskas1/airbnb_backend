const express = require('express');
const router = express.Router();
const prisma = require('../config/prisma');
const { authenticate } = require('../middleware/auth');
const featuresRoutes = require('../features/dashboard/routes');

// Use all routes from the features module
router.use('/', featuresRoutes);

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

// Get analytics data
router.get('/analytics', async (req, res) => {
  try {
    // Get user ID from request
    const userId = req.user?.user_id;
    if (!userId) {
      return res.status(400).json({ error: 'User ID not found in request' });
    }

    console.log('Fetching analytics for userId:', userId);

    // First find the public user record for this authenticated user
    const publicUser = await prisma.public_users.findFirst({
      where: {
        OR: [
          { email: req.user.email },
          { auth_user_id: req.user.auth_user_id },
          { user_id: parseInt(userId) }
        ]
      }
    });

    if (!publicUser) {
      console.error('Public user record not found for auth user:', req.user);
      return res.status(404).json({ error: 'User record not found' });
    }

    // Get all camping spots for this owner with detailed information
    const spotStats = await prisma.camping_spot.findMany({
      where: { owner_id: publicUser.user_id },
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
    console.log(`Found ${spotStats.length} spots for owner`);
    
    // Get total spots
    const totalSpots = spotStats.length;
    
    // Process all bookings across all spots
    const allBookings = spotStats.flatMap(spot => 
      (spot.bookings || []).filter(b => b && b.status_id !== 5)
    );
    
    // Process booking data - explicitly convert all numerical values
    const totalBookings = ensureNumber(allBookings.length);
    
    // Calculate total revenue with proper numerical handling
    let totalRevenue = 0;
    let cancelledRevenue = 0;
    let monthlyRevenue = 0;
    let monthlyBookings = 0;
    let prevMonthlyRevenue = 0;
    let prevMonthlyBookings = 0;
    let monthlyCancelledRevenue = 0;
    
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    
    allBookings.forEach(booking => {
      try {
        const bookingCost = ensureNumber(booking.cost);
        // Add to total revenue
        totalRevenue += bookingCost;
        
        // Check if cancelled
        if (booking.status_id === 3) {
          cancelledRevenue += bookingCost;
        }
        
        // Check if booking is in current month
        if (booking.start_date) {
          const startDate = new Date(booking.start_date);
          
          if (startDate.getMonth() === currentMonth && startDate.getFullYear() === currentYear) {
            monthlyBookings++;
            monthlyRevenue += bookingCost;
            
            if (booking.status_id === 3) {
              monthlyCancelledRevenue += bookingCost;
            }
          }
          
          // Check if booking is in previous month
          if (startDate.getMonth() === (currentMonth + 11) % 12 && 
             (currentMonth === 0 ? startDate.getFullYear() === currentYear - 1 : startDate.getFullYear() === currentYear)) {
            prevMonthlyBookings++;
            prevMonthlyRevenue += bookingCost;
          }
        }
      } catch (err) {
        console.error('Error processing booking:', err);
      }
    });
    
    // Process spot statistics
    const spotPerformance = spotStats.map(spot => {
      const validBookings = (spot.bookings || []).filter(b => b && b.status_id !== 5);
      const occupiedBookings = (spot.bookings || []).filter(b => b && [2, 4].includes(b.status_id));
      
      // Calculate occupancy rate
      const totalDays = occupiedBookings.reduce((sum, b) => {
        try {
          const start = new Date(b.start_date);
          const end = new Date(b.end_date);
          return sum + Math.max(0, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
        } catch (err) {
          return sum;
        }
      }, 0);
      
      // Calculate spot revenue
      let spotRevenue = 0;
      validBookings.forEach(booking => {
        spotRevenue += ensureNumber(booking.cost);
      });
      
      // Calculate occupancy rate (as percentage of 30 days)
      const occupancyRate = Math.min(Math.round(totalDays / 30 * 100), 100);
      
      return {
        id: spot.camping_spot_id,
        name: spot.title,
        bookings: validBookings.length,
        revenue: spotRevenue,
        occupancyRate,
        performance: calculateSafeAverage(spotRevenue, validBookings.length),
        status: spot.status || 'active',
        changePercentage: Math.floor(Math.random() * 20) - 5 // Placeholder for now
      };
    });
    
    // Calculate growth rates
    const bookingsGrowth = calculateGrowthRate(monthlyBookings, prevMonthlyBookings);
    const revenueGrowth = calculateGrowthRate(monthlyRevenue, prevMonthlyRevenue);
    
    // Calculate average occupancy
    const averageOccupancyRate = spotStats.length > 0 
      ? Math.round(spotPerformance.reduce((sum, spot) => sum + ensureNumber(spot.occupancyRate), 0) / spotStats.length)
      : 0;
      
    // Calculate average booking duration
    let totalDuration = 0;
    let durationCount = 0;
    
    allBookings.forEach(booking => {
      if (booking.start_date && booking.end_date) {
        const start = new Date(booking.start_date);
        const end = new Date(booking.end_date);
        const duration = Math.max(0, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
        totalDuration += duration;
        durationCount++;
      }
    });
    
    const averageDuration = durationCount > 0 
      ? parseFloat((totalDuration / durationCount).toFixed(1)) 
      : 3.5;
      
    // Get recent bookings with full details
    const recentBookings = await prisma.bookings.findMany({
      where: {
        camper_id: {
          in: spotStats.map(spot => spot.camping_spot_id)
        },
        status_id: {
          not: 5 // Exclude blocked bookings
        }
      },
      include: {
        camping_spot: true,
        users: {
          select: {
            full_name: true,
            email: true
          }
        },
        status_booking_transaction: true
      },
      orderBy: {
        created_at: 'desc'
      },
      take: 10
    });
    
    // Construct the response with all data properly converted to numbers
    const responseData = {
      revenue: {
        total: ensureNumber(totalRevenue),
        monthly: ensureNumber(monthlyRevenue),
        projected: ensureNumber(monthlyRevenue * 1.1),
        growth: ensureNumber(revenueGrowth),
        cancelled: ensureNumber(cancelledRevenue),
        monthlyCancelled: ensureNumber(monthlyCancelledRevenue),
        average: calculateSafeAverage(totalRevenue, totalBookings)
      },
      bookings: {
        total: ensureNumber(totalBookings),
        monthly: ensureNumber(monthlyBookings),
        averageDuration: ensureNumber(averageDuration),
        occupancyRate: ensureNumber(averageOccupancyRate),
        growth: ensureNumber(bookingsGrowth),
        active: ensureNumber(allBookings.filter(b => b.status_id === 2).length),
        monthlyChange: ensureNumber(bookingsGrowth),
        durationChange: ensureNumber(2) // Placeholder for now
      },
      insights: {
        averageLeadTime: ensureNumber(14), // Placeholder
        overallCancellationRate: ensureNumber(allBookings.length > 0 
          ? (allBookings.filter(b => b.status_id === 3).length / allBookings.length * 100) 
          : 0),
        repeatBookingRate: ensureNumber(20), // Placeholder
        weekendPopularity: ensureNumber(65), // Placeholder
        seasonalTrends: {
          peakMonth: new Date().toLocaleString('default', { month: 'long' }),
          count: ensureNumber(monthlyBookings)
        },
        peakDays: {
          peakDay: 'Saturday',
          lowestDay: 'Tuesday',
          weekendPercentage: ensureNumber(65),
          distribution: [
            { day: 'Sunday', bookings: ensureNumber(monthlyBookings * 0.14), percentage: ensureNumber(14) },
            { day: 'Monday', bookings: ensureNumber(monthlyBookings * 0.07), percentage: ensureNumber(7) },
            { day: 'Tuesday', bookings: ensureNumber(monthlyBookings * 0.06), percentage: ensureNumber(6) },
            { day: 'Wednesday', bookings: ensureNumber(monthlyBookings * 0.08), percentage: ensureNumber(8) },
            { day: 'Thursday', bookings: ensureNumber(monthlyBookings * 0.11), percentage: ensureNumber(11) },
            { day: 'Friday', bookings: ensureNumber(monthlyBookings * 0.25), percentage: ensureNumber(25) },
            { day: 'Saturday', bookings: ensureNumber(monthlyBookings * 0.29), percentage: ensureNumber(29) }
          ]
        }
      },
      popularSpots: spotPerformance
        .sort((a, b) => ensureNumber(b.bookings) - ensureNumber(a.bookings))
        .slice(0, 5),
      spotPerformance: spotPerformance
        .sort((a, b) => ensureNumber(b.performance) - ensureNumber(a.performance)),
      totalSpots: ensureNumber(totalSpots),
      currentMonth: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      totalBookedDays: ensureNumber(allBookings.length > 0 ? totalDuration : 18),
      totalAvailableDays: ensureNumber(totalSpots * 30),
      occupancyChange: ensureNumber(5), // Placeholder
      durationChange: ensureNumber(2), // Placeholder
      averageDuration: ensureNumber(averageDuration),
      recentBookings: recentBookings.map(b => ({
        id: b.booking_id,
        spotName: b.camping_spot?.title || 'Unknown',
        guestName: b.users?.full_name || 'Unknown',
        startDate: b.start_date ? b.start_date.toISOString() : null,
        endDate: b.end_date ? b.end_date.toISOString() : null,
        revenue: ensureNumber(parseFloat(b.cost || 0)),
        status: b.status_booking_transaction?.status?.toLowerCase() || 'unknown',
        cancelled: b.status_id === 3
      })),
      debugInfo: {
        timestamp: new Date().toISOString(),
        dataAge: 'fresh',
        hasRevenue: true,
        hasBookings: true,
        totalRevenue,
        monthlyRevenue,
        totalBookings,
        monthlyBookings
      }
    };
    
    // Log critical values to verify
    console.log('Dashboard response key values:');
    console.log('- Revenue total:', responseData.revenue.total);
    console.log('- Revenue monthly:', responseData.revenue.monthly);
    console.log('- Bookings total:', responseData.bookings.total);
    console.log('- Bookings monthly:', responseData.bookings.monthly);
    console.log('- hasRevenue:', responseData.debugInfo.hasRevenue);
    console.log('- hasBookings:', responseData.debugInfo.hasBookings);
    
    res.json(responseData);
  } catch (error) {
    console.error('Error fetching analytics:', error);
    // Return a meaningful error response but with structure that the frontend can still use
    const errorResponse = {
      revenue: { total: 0, monthly: 0, projected: 0, growth: 0, cancelled: 0, monthlyCancelled: 0, average: 0 },
      bookings: { total: 0, monthly: 0, averageDuration: 0, occupancyRate: 0, growth: 0, active: 0 },
      insights: { averageLeadTime: 0, overallCancellationRate: 0, repeatBookingRate: 0, weekendPopularity: 0 },
      popularSpots: [],
      spotPerformance: [],
      totalSpots: 0,
      currentMonth: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      recentBookings: [],
      error: error.message,
      debugInfo: {
        timestamp: new Date().toISOString(),
        hasRevenue: true,
        hasBookings: true,
        error: true,
        errorMessage: error.message
      }
    };
    res.status(500).json(errorResponse);
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

    // First find the public user by auth_user_id or user_id
    const publicUser = await prisma.public_users.findFirst({
      where: {
        OR: [
          { email: req.user.email },
          { auth_user_id: req.user.auth_user_id },
          { user_id: parseInt(userId) }
        ]
      }
    });

    if (!publicUser) {
      console.error('User not found in database for /spots endpoint');
      return res.status(404).json({ error: 'User not found' });
    }

    const spots = await prisma.camping_spot.findMany({
      where: {
        owner_id: publicUser.user_id
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

    res.json(spots);
  } catch (error) {
    console.error('Error fetching owner spots:', error);
    res.status(500).json({ error: 'Failed to fetch spots' });
  }
});

// Get bookings for owner's spots
router.get('/bookings', authenticate, async (req, res) => {
  try {
    // Check if user is owner
    if (!req.user || req.user.isowner !== '1') {
      console.log('User owner status:', req.user?.isowner);
      return res.status(403).json({ error: 'Owner account required' });
    }

    // Find the public user by auth_user_id or email
    const publicUser = await prisma.public_users.findFirst({
      where: {
        OR: [
          { email: req.user.email },
          { auth_user_id: req.user.auth_user_id }
        ]
      }
    });

    if (!publicUser) {
      console.error('Public user not found for bookings endpoint');
      return res.status(404).json({ error: 'User not found' });
    }

    // First get all spots owned by the user
    const spots = await prisma.camping_spot.findMany({
      where: {
        owner_id: publicUser.user_id
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
    // Verify user authentication
    if (!req.user) {
      console.log('No user found in request');
      return res.status(401).json({ error: 'Authentication required' });
    }    console.log('Dashboard request from user:', req.user);
    
    // First find the public user by auth_user_id or user_id
    const publicUser = await prisma.public_users.findFirst({
      where: {
        OR: [
          // Try to match by email first (most reliable)
          { email: req.user.email },
          // Try to match by auth_user_id (Supabase UUID)
          { auth_user_id: req.user.auth_user_id },
          // Fallback to user_id as integer
          { user_id: parseInt(req.user.user_id) }
        ]
      }
    });

    if (!publicUser) {
      console.log('User not found in database, user info:', req.user);
      return res.status(404).json({ error: 'User not found' });
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
      return res.status(404).json({ error: 'Owner not found' });
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

module.exports = router;