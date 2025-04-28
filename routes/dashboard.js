const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { authenticate } = require('../middlewares/auth');

// Cache settings
const dashboardCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Helper to log errors with context
 */
function errorWithContext(component, error, context = {}) {
  console.error(`[${component}] Error:`, error.message);
  if (Object.keys(context).length) {
    console.error('Context:', context);
  }
}

/**
 * Check if user is allowed to access owner dashboard
 */
async function ownerAccessCheck(req, res) {
  if (!req.user) {
    return { allowed: false, reason: 'Authentication required' };
  }
  
  console.log('User data from token:', req.user);
  
  // More comprehensive owner check that handles all possible values
  const isOwner = req.user.isowner === 1 || 
                  req.user.isowner === '1' || 
                  req.user.isowner === true ||
                  req.user.isowner === 'true' ||
                  req.user.isowner === 'yes' ||
                  req.user.isowner === 'YES' ||
                  Number(req.user.isowner) === 1;
  
  // Log the actual value to help with debugging
  console.log(`isowner value (${typeof req.user.isowner}):`, req.user.isowner);
  console.log('Owner check result:', isOwner);
  
  if (!isOwner) {
    return { allowed: false, reason: 'Only owner accounts can view analytics' };
  }
  
  return { allowed: true, userId: req.user.user_id };
}

/**
 * Get dashboard analytics data
 */
router.get('/analytics', authenticate, async (req, res) => {
  try {
    console.log('Dashboard analytics access attempt by user:', req.user?.user_id);
    
    // Check owner access
    const access = await ownerAccessCheck(req, res);
    if (!access.allowed) {
      console.log('Access denied:', access.reason);
      return res.status(403).json({ error: access.reason });
    }
    
    const userId = access.userId;
    console.log('Fetching analytics for userId:', userId);
    
    // Check cache
    const now = Date.now();
    const cacheKey = `dashboard-${userId}`;
    const cachedData = dashboardCache.get(cacheKey);
    
    if (cachedData && (now - cachedData.timestamp < CACHE_TTL) && !req.query.refresh) {
      console.log('Using cached dashboard data');
      return res.json(cachedData.data);
    }
    
    try {
      // Get all camping spots for this owner
      console.log('Fetching camping spots for owner:', userId);
      const spotStats = await prisma.camping_spot.findMany({
        where: {
          owner_id: userId
        },
        include: {
          bookings: {
            include: {
              status_booking_transaction: true
            }
          }
        }
      });
      console.log(`Found ${spotStats.length} spots for owner`);
      
      // Get booking statistics safely with error handling
      console.log('Fetching booking statistics...');
      let bookingStats = [{ 
        total_bookings: 0, 
        total_revenue: 0, 
        monthly_bookings: 0,
        monthly_revenue: 0,
        average_duration: 0,
        bookings_growth: 0,
        revenue_growth: 0,
        cancelled_revenue: 0
      }];
      let recentBookings = [];
      
      try {
        [bookingStats, recentBookings] = await Promise.all([
          prisma.$queryRaw`
            SELECT 
              COUNT(*) as total_bookings,
              COALESCE(SUM(b.cost), 0) as total_revenue,
              COUNT(CASE WHEN b.created_at >= NOW() - INTERVAL '30 days' THEN 1 END) as monthly_bookings,
              COALESCE(SUM(CASE WHEN b.created_at >= NOW() - INTERVAL '30 days' THEN b.cost ELSE 0 END), 0) as monthly_revenue,
              COALESCE(AVG(EXTRACT(DAY FROM (b.end_date - b.start_date))), 0) as average_duration,
              COALESCE(
                (COUNT(CASE WHEN b.created_at >= NOW() - INTERVAL '30 days' THEN 1 END) - 
                 COUNT(CASE WHEN b.created_at >= NOW() - INTERVAL '60 days' 
                       AND b.created_at < NOW() - INTERVAL '30 days' THEN 1 END)) / 
                NULLIF(COUNT(CASE WHEN b.created_at >= NOW() - INTERVAL '60 days' 
                      AND b.created_at < NOW() - INTERVAL '30 days' THEN 1 END), 0) * 100, 
                0
              ) as bookings_growth,
              COALESCE(
                (SUM(CASE WHEN b.created_at >= NOW() - INTERVAL '30 days' THEN b.cost ELSE 0 END) - 
                 SUM(CASE WHEN b.created_at >= NOW() - INTERVAL '60 days' 
                       AND b.created_at < NOW() - INTERVAL '30 days' THEN b.cost ELSE 0 END)) / 
                NULLIF(SUM(CASE WHEN b.created_at >= NOW() - INTERVAL '60 days' 
                      AND b.created_at < NOW() - INTERVAL '30 days' THEN b.cost ELSE 0 END), 0) * 100,
                0
              ) as revenue_growth,
              COALESCE(SUM(CASE WHEN b.status_id = 3 THEN b.cost ELSE 0 END), 0) as cancelled_revenue
            FROM bookings b
            JOIN camping_spot cs ON b.camper_id = cs.camping_spot_id
            WHERE cs.owner_id = ${userId}
          `,
          prisma.bookings.findMany({
            take: 10,
            orderBy: { created_at: 'desc' },
            select: {
              booking_id: true,
              start_date: true,
              end_date: true,
              cost: true,
              status_id: true,
              camping_spot: {
                select: { title: true }
              },
              users: {
                select: { full_name: true }
              },
              status_booking_transaction: {
                select: { status: true }
              }
            },
            where: {
              camping_spot: {
                owner_id: userId
              },
              status_id: { not: 5 } // Exclude unavailable bookings
            }
          })
        ]);
        console.log('Booking statistics fetched successfully');
      } catch (statsError) {
        console.error('Error fetching booking statistics:', statsError);
        // Continue with empty stats
      }

      console.log('Processing spot statistics...');
      // Process spot statistics
      const spotPerformance = spotStats.map(spot => {
        try {
          // Revenue includes all bookings except unavailable (status 5)
          const validBookings = spot.bookings ? spot.bookings.filter(b => b && b.status_id !== 5) : [];
          const totalRevenue = validBookings.reduce((sum, b) => sum + Number(b.cost || 0), 0);
          
          // For occupancy calculation
          const occupiedBookings = spot.bookings ? spot.bookings.filter(b => b && [2, 4, 5].includes(b.status_id)) : [];
          const totalDays = occupiedBookings.reduce((sum, b) => {
            try {
              const start = new Date(b.start_date);
              const end = new Date(b.end_date);
              if (end > start) {
                return sum + Math.ceil((end - start) / (1000 * 60 * 60 * 24));
              }
              return sum;
            } catch (dateError) {
              console.error('Error calculating booking days:', dateError);
              return sum;
            }
          }, 0);
          
          // Calculate 30-day occupancy rate (days booked / 30 days * 100%)
          const occupancyRate = Math.min(Math.round(totalDays / 30 * 100), 100);
          
          // Active bookings are confirmed(2) and completed(4), excluding cancelled(3) and unavailable(5) bookings
          const activeBookings = spot.bookings ? spot.bookings.filter(b => b && [2, 4].includes(b.status_id)) : [];
          
          return {
            id: spot.camping_spot_id,
            name: spot.title,
            bookings: activeBookings.length,
            revenue: Number(totalRevenue),
            occupancyRate: occupancyRate,
            performance: Number(totalRevenue) * activeBookings.length / 100, // Simple performance metric
            status: spot.status || 'active'
          };
        } catch (spotError) {
          console.error('Error processing spot:', spotError, spot);
          return {
            id: spot.camping_spot_id || 'unknown',
            name: spot.title || 'Unknown',
            bookings: 0,
            revenue: 0,
            occupancyRate: 0,
            performance: 0,
            status: 'error'
          };
        }
      });
      
      console.log('Calculating average occupancy rate...');
      // Calculate average occupancy rate
      const averageOccupancyRate = spotPerformance.length > 0
        ? Math.round(spotPerformance.reduce((sum, spot) => sum + spot.occupancyRate, 0) / spotPerformance.length)
        : 0;
      
      console.log('Preparing response data...');
      // Prepare response data - ensure all fields have fallback values
      const responseData = {
        revenue: {
          total: Number(bookingStats[0]?.total_revenue || 0),
          monthly: Number(bookingStats[0]?.monthly_revenue || 0),
          projected: Number((bookingStats[0]?.monthly_revenue || 0) * 1.1),
          growth: Number(bookingStats[0]?.revenue_growth || 0),
          cancelled: Number(bookingStats[0]?.cancelled_revenue || 0)
        },
        bookings: {
          total: Number(bookingStats[0]?.total_bookings || 0),
          monthly: Number(bookingStats[0]?.monthly_bookings || 0),
          averageDuration: Number(bookingStats[0]?.average_duration || 0),
          occupancyRate: averageOccupancyRate,
          growth: Number(bookingStats[0]?.bookings_growth || 0),
          active: spotPerformance.reduce((sum, spot) => sum + spot.bookings, 0)
        },
        popularSpots: spotPerformance.sort((a, b) => b.bookings - a.bookings).slice(0, 5),
        spotPerformance: spotPerformance.sort((a, b) => b.performance - a.performance),
        totalSpots: spotPerformance.length,
        recentBookings: recentBookings.map(b => {
          try {
            return {
              id: b.booking_id,
              spotName: b.camping_spot?.title || 'Unknown',
              guestName: b.users?.full_name || 'Unknown',
              startDate: b.start_date ? b.start_date.toISOString() : null,
              endDate: b.end_date ? b.end_date.toISOString() : null,
              revenue: Number(b.cost || 0),
              status: b.status_booking_transaction?.status?.toLowerCase() || 'unknown',
              cancelled: b.status_id === 3
            };
          } catch (bookingError) {
            console.error('Error processing booking:', bookingError);
            return {
              id: b.booking_id || 'unknown',
              spotName: 'Error',
              guestName: 'Error',
              startDate: null,
              endDate: null,
              revenue: 0,
              status: 'error',
              cancelled: false
            };
          }
        })
      };
      
      console.log('Caching response data...');
      // Cache the response
      dashboardCache.set(cacheKey, {
        timestamp: now,
        data: responseData
      });
      
      console.log('Sending response...');
      return res.json(responseData);
    } catch (innerError) {
      console.error('Inner error in dashboard analytics:', innerError);
      throw innerError; // Re-throw to be caught by the outer catch block
    }
  } catch (error) {
    console.error('Dashboard Analytics Error:', error.message);
    console.error('Error Stack:', error.stack);
    return res.status(500).json({ 
      error: 'Failed to fetch dashboard data', 
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * Get owner spots for management (forwarding to campers route)
 */
router.get('/spots', authenticate, async (req, res) => {
  try {
    console.log('[dashboard.js] Processing /spots route, forwarding to /camping-spots/owner');
    
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Check if the user is an owner
    const isOwner = req.user.isowner === 1 || 
                    req.user.isowner === '1' || 
                    req.user.isowner === true ||
                    req.user.isowner === 'true' ||
                    req.user.isowner === 'yes' ||
                    req.user.isowner === 'YES' ||
                    Number(req.user.isowner) === 1;
    
    if (!isOwner) {
      return res.status(403).json({ 
        error: 'Access denied',
        message: 'Only owners can access their spots'
      });
    }
    
    // Instead of redirecting (which can cause issues with headers), 
    // we'll directly use the spots route logic
    const userId = req.user.user_id;
    
    const spots = await prisma.camping_spot.findMany({
      where: {
        owner_id: userId
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
    console.error('Error fetching owner camping spots from dashboard:', error);
    res.status(500).json({ 
      error: 'Failed to fetch camping spots', 
      details: error.message 
    });
  }
});

/**
 * Get owner bookings
 */
router.get('/bookings', authenticate, async (req, res) => {
  try {
    console.log('[dashboard.js] Processing /bookings route');
    
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Check if the user is an owner
    const isOwner = req.user.isowner === 1 || 
                    req.user.isowner === '1' || 
                    req.user.isowner === true ||
                    req.user.isowner === 'true' ||
                    req.user.isowner === 'yes' ||
                    req.user.isowner === 'YES' ||
                    Number(req.user.isowner) === 1;
    
    if (!isOwner) {
      return res.status(403).json({ 
        error: 'Access denied',
        message: 'Only owners can access their bookings'
      });
    }
    
    // Get user ID
    const userId = req.user.user_id;
    console.log(`Fetching bookings for owner ID: ${userId}`);
    
    // First, get all camping spots owned by this user
    const ownerCampingSpots = await prisma.camping_spot.findMany({
      where: {
        owner_id: userId
      },
      select: {
        camping_spot_id: true,
        title: true
      }
    });
    
    if (ownerCampingSpots.length === 0) {
      console.log('No camping spots found for owner');
      return res.json([]);
    }
    
    const campingSpotIds = ownerCampingSpots.map(spot => spot.camping_spot_id);
    console.log(`Found ${campingSpotIds.length} camping spots for owner`);
    
    // Now get all bookings for these camping spots
    const bookings = await prisma.bookings.findMany({
      where: {
        camper_id: {
          in: campingSpotIds
        }
      },
      include: {
        camping_spot: {
          select: {
            title: true,
            price_per_night: true,
            camping_spot_id: true,
            images: {
              select: {
                image_url: true
              },
              take: 1
            },
            location: {
              select: {
                city: true,
                country: {
                  select: { name: true }
                }
              }
            }
          }
        },
        users: {
          select: {
            full_name: true,
            email: true,
            user_id: true
          }
        },
        status_booking_transaction: {
          select: { status: true }
        }
      },
      orderBy: {
        created_at: 'desc'
      }
    });
    
    console.log(`Found ${bookings.length} bookings for owner's camping spots`);
    
    // Calculate total price for each booking
    const enhancedBookings = bookings.map(booking => {
      // Calculate number of nights
      const startDate = new Date(booking.start_date);
      const endDate = new Date(booking.end_date);
      const nights = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
      
      return {
        ...booking,
        nights,
        total_price: parseFloat(booking.cost || 0),
        status: booking.status_booking_transaction?.status || 'unknown'
      };
    });
    
    // Ensure response has proper content type
    res.setHeader('Content-Type', 'application/json');
    return res.json(enhancedBookings);
  } catch (error) {
    console.error('Error fetching owner bookings from dashboard:', error);
    res.status(500).json({ 
      error: 'Failed to fetch owner bookings', 
      details: error.message 
    });
  }
});

/**
 * Debug endpoint to check user permissions
 */
router.get('/debug/permissions', authenticate, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'No user data in token' });
    }
    
    // Return safe user data for debugging
    res.json({
      roles: {
        isOwner: req.user.isowner === 1 || 
                 req.user.isowner === '1' || 
                 req.user.isowner === true ||
                 req.user.isowner === 'true' ||
                 req.user.isowner === 'yes' ||
                 req.user.isowner === 'YES' ||
                 Number(req.user.isowner) === 1
      },
      userData: {
        user_id: req.user.user_id,
        isowner: req.user.isowner,
        isowner_type: typeof req.user.isowner
      }
    });
  } catch (error) {
    console.error('Permission check error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
