const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const dashboardRateLimiter = require('../middleware/dashboardRateLimiter');
const { debug, errorWithContext } = require('../utils/logger');

// Robust server-side caching
const dashboardCache = new Map();
const CACHE_DURATION_MS = 60000; // 1 minute cache for normal requests
const FORCE_REFRESH_CACHE_DURATION_MS = 10000; // 10 second cache for forced refreshes

// Apply dashboard-specific rate limiter instead of the global one
router.use(dashboardRateLimiter);

// Health endpoint for checking dashboard service
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root endpoint to avoid 404 errors
router.get('/', (req, res) => {
  // Simply redirect to analytics endpoint
  res.redirect('/api/dashboard/analytics');
});

router.get('/analytics', async (req, res) => {
  try {
    // Generate a cache key based on user ID if available
    const userId = req.user?.id || 'guest';
    const isForceRefresh = req.query.refresh === 'true';
    const cacheKey = `analytics_${userId}`;
    const now = Date.now();
    
    // Use different cache durations based on refresh type
    const cacheDuration = isForceRefresh 
      ? FORCE_REFRESH_CACHE_DURATION_MS 
      : CACHE_DURATION_MS;
    
    // Check if we have a valid cached response
    if (!isForceRefresh && dashboardCache.has(cacheKey)) {
      const cachedData = dashboardCache.get(cacheKey);
      if (now - cachedData.timestamp < cacheDuration) {
        debug('Dashboard', 'Serving cached dashboard data');
        return res.json(cachedData.data);
      }
    }
    
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const firstDayLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);

    const [bookingStats, spotStats, recentBookings] = await Promise.all([
      // Booking and revenue statistics
      prisma.$queryRaw`
        WITH booking_metrics AS (
          SELECT 
            -- Only count confirmed(2) and completed(4) bookings as "real" bookings
            COUNT(*) FILTER (WHERE status_id IN (2, 4)) as total_bookings,
            
            -- Include all valid revenue (including cancelled)
            SUM(cost) FILTER (WHERE status_id NOT IN (5)) as total_revenue,
            
            -- Monthly bookings only includes confirmed and completed
            COUNT(*) FILTER (WHERE created_at >= ${firstDayOfMonth} AND status_id IN (2, 4)) as monthly_bookings,
            
            -- Monthly revenue includes cancelled
            SUM(cost) FILTER (WHERE created_at >= ${firstDayOfMonth} AND status_id IN (2, 3, 4)) as monthly_revenue,
            
            -- Last month bookings only includes confirmed and completed
            COUNT(*) FILTER (WHERE created_at >= ${firstDayLastMonth} AND created_at < ${firstDayOfMonth} 
                            AND status_id IN (2, 4)) as last_month_bookings,
            
            -- Last month revenue includes cancelled
            SUM(cost) FILTER (WHERE created_at >= ${firstDayLastMonth} AND created_at < ${firstDayOfMonth} 
                              AND status_id IN (2, 3, 4)) as last_month_revenue,
            
            -- Average revenue per booking (excludes unavailable)
            AVG(cost) FILTER (WHERE status_id NOT IN (5)) as average_revenue,
            
            -- Average duration - only for real bookings (confirmed/completed)
            AVG(EXTRACT(DAY FROM (end_date::timestamp - start_date::timestamp)))
              FILTER (WHERE status_id IN (2, 4)) as average_duration,
            
            -- Track cancelled revenue separately
            SUM(cost) FILTER (WHERE status_id = 3) as cancelled_revenue
          FROM bookings
        )
        SELECT 
          *,
          CASE 
            WHEN last_month_revenue = 0 OR last_month_revenue IS NULL THEN 0
            ELSE ROUND(((monthly_revenue - last_month_revenue) / last_month_revenue * 100))
          END as revenue_growth,
          CASE
            WHEN last_month_bookings = 0 OR last_month_bookings IS NULL THEN 0
            ELSE ROUND(((monthly_bookings - last_month_bookings) / last_month_bookings * 100))
          END as bookings_growth
        FROM booking_metrics
      `,

      // Spot performance and popularity - get all relevant bookings
      prisma.camping_spot.findMany({
        select: {
          camping_spot_id: true,
          title: true,
          bookings: {
            where: {
              status_id: { in: [2, 3, 4, 5] } // Include all: confirmed, cancelled, completed, unavailable
            },
            select: {
              cost: true,
              start_date: true,
              end_date: true,
              status_id: true
            }
          }
        }
      }),

      // Recent bookings
      prisma.bookings.findMany({
        where: {
          status_id: { not: 5 } // Exclude unavailable bookings
        },
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
        }
      })
    ]);

    // Process spot statistics - handle different booking statuses properly
    const spotPerformance = spotStats.map(spot => {
      // Revenue includes all bookings except unavailable (status 5)
      const validBookings = spot.bookings.filter(b => b.status_id !== 5);
      const totalRevenue = validBookings.reduce((sum, b) => sum + Number(b.cost), 0);
      
      // For occupancy calculation, include confirmed(2), completed(4), and unavailable(5) bookings
      // This correctly accounts for all time periods where the spot cannot be booked
      const occupiedBookings = spot.bookings.filter(b => [2, 4, 5].includes(b.status_id));
      const totalDays = occupiedBookings.reduce((sum, b) => {
        const start = new Date(b.start_date);
        const end = new Date(b.end_date);
        // Ensure valid date range calculation
        if (end > start) {
          return sum + Math.ceil((end - start) / (1000 * 60 * 60 * 24));
        }
        return sum;
      }, 0);
      
      // Calculate occupancy rate (days booked or unavailable / days in year)
      const daysInYear = 365;
      const occupancyRate = Math.min(100, Math.round((totalDays / daysInYear) * 100));
      
      // For booking count, exclude cancelled(3) and unavailable(5) bookings
      const activeBookings = spot.bookings.filter(b => [2, 4].includes(b.status_id));
      
      return {
        id: spot.camping_spot_id,
        name: spot.title,
        bookings: activeBookings.length,
        occupancyRate: occupancyRate,
        revenue: totalRevenue,
        trend: activeBookings.length > 0 ? 1 : -1,
        performance: activeBookings.length > 0 ? totalRevenue / Math.max(totalDays, 1) : 0
      };
    });

    // Calculate average occupancy rate across all spots
    const averageOccupancyRate = Math.round(
      spotPerformance.reduce((sum, spot) => sum + spot.occupancyRate, 0) / 
      Math.max(spotPerformance.length, 1)
    );

    // Format response
    const responseData = {
      totalSpots: spotStats.length,
      revenue: {
        total: Number(bookingStats[0].total_revenue) || 0,
        monthly: Number(bookingStats[0].monthly_revenue) || 0,
        average: Number(bookingStats[0].average_revenue) || 0,
        projected: Number(bookingStats[0].monthly_revenue * 1.1) || 0,
        growth: Number(bookingStats[0].revenue_growth) || 0,
        cancelled: Number(bookingStats[0].cancelled_revenue) || 0
      },
      bookings: {
        total: Number(bookingStats[0].total_bookings),
        monthly: Number(bookingStats[0].monthly_bookings),
        averageDuration: Number(bookingStats[0].average_duration) || 0,
        occupancyRate: averageOccupancyRate,
        growth: Number(bookingStats[0].bookings_growth) || 0,
        active: spotPerformance.reduce((sum, spot) => sum + spot.bookings, 0)
      },
      popularSpots: spotPerformance.sort((a, b) => b.bookings - a.bookings).slice(0, 5),
      spotPerformance: spotPerformance.sort((a, b) => b.performance - a.performance),
      recentBookings: recentBookings.map(b => ({
        id: b.booking_id,
        spotName: b.camping_spot.title,
        guestName: b.users.full_name,
        startDate: b.start_date.toISOString(),
        endDate: b.end_date.toISOString(),
        revenue: Number(b.cost),
        status: b.status_booking_transaction.status.toLowerCase(),
        cancelled: b.status_id === 3
      }))
    };
    
    // Cache the response
    dashboardCache.set(cacheKey, {
      timestamp: now,
      data: responseData
    });
    
    res.json(responseData);
  } catch (error) {
    errorWithContext('Dashboard', error, { path: '/analytics' });
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

module.exports = router;
