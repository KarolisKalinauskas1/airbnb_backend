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
    const daysInMonth = lastDayOfMonth.getDate();

    const [bookingStats, spotStats, recentBookings] = await Promise.all([
      // Booking and revenue statistics - only count confirmed (2) and completed (4) bookings
      prisma.$queryRaw`
        WITH booking_metrics AS (
          SELECT 
            COUNT(*) FILTER (WHERE status_id IN (2, 4)) as total_bookings,
            SUM(cost) FILTER (WHERE status_id IN (2, 4)) as total_revenue,
            COUNT(*) FILTER (WHERE created_at >= ${firstDayOfMonth} AND status_id IN (2, 4)) as monthly_bookings,
            SUM(cost) FILTER (WHERE created_at >= ${firstDayOfMonth} AND status_id IN (2, 4)) as monthly_revenue,
            COUNT(*) FILTER (WHERE created_at >= ${firstDayLastMonth} AND created_at < ${firstDayOfMonth} AND status_id IN (2, 4)) as last_month_bookings,
            SUM(cost) FILTER (WHERE created_at >= ${firstDayLastMonth} AND created_at < ${firstDayOfMonth} AND status_id IN (2, 4)) as last_month_revenue,
            AVG(cost) FILTER (WHERE status_id IN (2, 4)) as average_revenue,
            AVG(
              EXTRACT(DAY FROM (end_date::timestamp - start_date::timestamp))
            ) FILTER (WHERE status_id IN (2, 4)) as average_duration
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

      // Spot performance and popularity
      prisma.camping_spot.findMany({
        select: {
          camping_spot_id: true,
          title: true,
          bookings: {
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
        take: 10,
        orderBy: { created_at: 'desc' },
        select: {
          booking_id: true,
          start_date: true,
          end_date: true,
          cost: true,
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

    // Process spot statistics - filter out cancelled bookings
    const spotPerformance = spotStats.map(spot => {
      const validBookings = spot.bookings.filter(b => [2, 4].includes(b.status_id));
      const totalRevenue = validBookings.reduce((sum, b) => sum + Number(b.cost), 0);
      
      // Calculate occupied days in current month
      const daysOccupiedThisMonth = validBookings.reduce((sum, b) => {
        const start = new Date(Math.max(b.start_date, firstDayOfMonth));
        const end = new Date(Math.min(b.end_date, lastDayOfMonth));
        if (end > start) {
          return sum + Math.ceil((end - start) / (1000 * 60 * 60 * 24));
        }
        return sum;
      }, 0);

      return {
        id: spot.camping_spot_id,
        name: spot.title,
        bookings: validBookings.length,
        occupancyRate: Math.round((daysOccupiedThisMonth / daysInMonth) * 100),
        revenue: totalRevenue,
        trend: validBookings.length > 0 ? 1 : -1,
        performance: totalRevenue / Math.max(daysOccupiedThisMonth, 1)
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
        growth: Number(bookingStats[0].revenue_growth) || 0
      },
      bookings: {
        total: Number(bookingStats[0].total_bookings),
        monthly: Number(bookingStats[0].monthly_bookings),
        averageDuration: Number(bookingStats[0].average_duration) || 0,
        occupancyRate: averageOccupancyRate,
        growth: Number(bookingStats[0].bookings_growth) || 0
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
        status: b.status_booking_transaction.status.toLowerCase()
      }))
    });
  } catch (error) {
    console.error('Dashboard Error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

module.exports = router;
