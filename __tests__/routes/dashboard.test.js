const request = require('supertest');
const express = require('express');

// Define mock before jest.mock
const mockPrisma = {
  $queryRaw: jest.fn(),
  camping_spot: {
    findMany: jest.fn()
  },
  bookings: {
    findMany: jest.fn()
  }
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma)
}));

const dashboardRouter = require('../../routes/dashboard');

const app = express();
app.use(express.json());
app.use('/api/dashboard', dashboardRouter);

describe('Dashboard Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/dashboard/analytics', () => {
    it('should return dashboard analytics data', async () => {
      const mockBookingStats = [{
        total_bookings: '10',
        total_revenue: '1000',
        monthly_bookings: '5',
        monthly_revenue: '500',
        average_revenue: '100',
        average_duration: '3',
        last_month_bookings: '4',
        last_month_revenue: '400'
      }];

      const mockSpotStats = [{
        camping_spot_id: 1,
        title: 'Test Spot',
        bookings: [{
          cost: 100,
          start_date: new Date(),
          end_date: new Date(Date.now() + 86400000)
        }]
      }];

      const mockRecentBookings = [{
        booking_id: 1,
        start_date: new Date(),
        end_date: new Date(),
        cost: 100,
        camping_spot: { title: 'Test Spot' },
        users: { full_name: 'Test User' },
        status_booking_transaction: { status: 'CONFIRMED' }
      }];

      mockPrisma.$queryRaw.mockResolvedValue(mockBookingStats);
      mockPrisma.camping_spot.findMany.mockResolvedValue(mockSpotStats);
      mockPrisma.bookings.findMany.mockResolvedValue(mockRecentBookings);

      const response = await request(app).get('/api/dashboard/analytics');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('revenue');
      expect(response.body).toHaveProperty('bookings');
      expect(response.body).toHaveProperty('popularSpots');
      expect(response.body).toHaveProperty('recentBookings');
    });
  });
});
