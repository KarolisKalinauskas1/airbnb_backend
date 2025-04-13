const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

router.get('/analytics', async (req, res) => {
  try {
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const firstDayLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);

    const [bookingStats, spotStats, recentBookings] = await Promise.all([
      // Booking and revenue statistics - exclude unavailable status (5)
      prisma.$queryRaw`
        WITH booking_metrics AS (
          SELECT 
            COUNT(*) FILTER (WHERE status_id NOT IN (5)) as total_bookings,
            SUM(cost) FILTER (WHERE status_id NOT IN (5)) as total_revenue,
            
            -- Monthly bookings, exclude unavailable
            COUNT(*) FILTER (WHERE created_at >= ${firstDayOfMonth} AND status_id NOT IN (5)) as monthly_bookings,
            
            -- Monthly revenue, include confirmed, completed, cancelled but not unavailable
            SUM(cost) FILTER (WHERE created_at >= ${firstDayOfMonth} AND status_id IN (2, 3, 4)) as monthly_revenue,
            
            -- Last month bookings, exclude cancelled and unavailable
            COUNT(*) FILTER (WHERE created_at >= ${firstDayLastMonth} AND created_at < ${firstDayOfMonth} AND status_id IN (2, 4)) as last_month_bookings,
            
            -- Last month revenue, include confirmed, completed, cancelled but not unavailable
            SUM(cost) FILTER (WHERE created_at >= ${firstDayLastMonth} AND created_at < ${firstDayOfMonth} AND status_id IN (2, 3, 4)) as last_month_revenue,
            
            -- Average revenue, exclude unavailable
            AVG(cost) FILTER (WHERE status_id NOT IN (5)) as average_revenue,
            
            -- Average duration, exclude cancelled and unavailable
            AVG(
              EXTRACT(DAY FROM (end_date::timestamp - start_date::timestamp))
            ) FILTER (WHERE status_id IN (2, 4)) as average_duration,
            
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

      // Spot performance and popularity - exclude unavailability
      prisma.camping_spot.findMany({
        select: {
          camping_spot_id: true,
          title: true,
          bookings: {
            where: {
              status_id: { not: 5 } // Exclude unavailable
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

      // Recent bookings - exclude unavailability
      prisma.bookings.findMany({
        where: {
          status_id: { not: 5 } // Exclude unavailable
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

    // Process spot statistics - only count real bookings
    const spotPerformance = spotStats.map(spot => {
      // Include status 2 (confirmed), 3 (cancelled), and 4 (completed) for revenue calculations
      const validBookings = spot.bookings.filter(b => [2, 3, 4].includes(b.status_id));
      const totalRevenue = validBookings.reduce((sum, b) => sum + Number(b.cost), 0);
      
      // For occupancy calculation, only include confirmed and completed bookings
      const activeBookings = spot.bookings.filter(b => [2, 4].includes(b.status_id));
      const totalDays = activeBookings.reduce((sum, b) => {
        return sum + Math.ceil((b.end_date - b.start_date) / (1000 * 60 * 60 * 24));
      }, 0);
      
      // Calculate occupancy rate (days booked / days in year)
      const daysInYear = 365;
      const occupancyRate = Math.round((totalDays / daysInYear) * 100);
      
      return {
        id: spot.camping_spot_id,
        name: spot.title,
        bookings: activeBookings.length,
        occupancyRate: occupancyRate,
        revenue: totalRevenue,
        trend: activeBookings.length > 0 ? 1 : -1,
        performance: totalRevenue / Math.max(totalDays, 1)
      };
    });

    // Calculate average occupancy rate across all spots
    const averageOccupancyRate = Math.round(
      spotPerformance.reduce((sum, spot) => sum + spot.occupancyRate, 0) / 
      Math.max(spotPerformance.length, 1)
    );

    // Format response
    res.json({
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
        guestName: b.users?.full_name || 'N/A',
        startDate: b.start_date.toISOString(),
        endDate: b.end_date.toISOString(),
        revenue: Number(b.cost),
        status: b.status_booking_transaction.status.toLowerCase(),
        cancelled: b.status_id === 3
      }))
    });
  } catch (error) {
    console.error('Dashboard Error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

module.exports = router;
