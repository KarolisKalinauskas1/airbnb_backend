const request = require('supertest');
const express = require('express');

// Create mock and export it so we can access it in tests
const mockPrisma = {
  camping_spot: {
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn()
  },
  amenity: {
    findMany: jest.fn()
  },
  $transaction: jest.fn(),
  location: {
    create: jest.fn(),
    update: jest.fn()
  },
  camping_spot_amenities: {
    deleteMany: jest.fn(),
    createMany: jest.fn()
  },
  images: {
    deleteMany: jest.fn()
  }
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma)
}));

// Require router after mocks are set up
const campersRouter = require('../../routes/campers');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const app = express();
app.use(express.json());
app.use('/camping-spots', campersRouter);

describe('Campers Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /camping-spots', () => {
    it('should return 400 if dates are missing', async () => {
      const response = await request(app).get('/camping-spots');
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Start date and end date are required');
    });

    it('should return available camping spots', async () => {
      const mockSpots = [{
        camping_spot_id: 1,
        title: 'Test Spot',
        price_per_night: 100
      }];

      mockPrisma.camping_spot.findMany.mockResolvedValue(mockSpots);

      const response = await request(app)
        .get('/camping-spots')
        .query({ 
          startDate: '2024-03-01', 
          endDate: '2024-03-05' 
        });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toEqual(mockSpots);
    });
  });

  describe('GET /camping-spots/amenities', () => {
    it('should return all amenities', async () => {
      const mockAmenities = [
        { amenity_id: 1, name: 'WiFi' },
        { amenity_id: 2, name: 'Parking' }
      ];

      mockPrisma.amenity.findMany.mockResolvedValue(mockAmenities);

      const response = await request(app).get('/camping-spots/amenities');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toEqual(mockAmenities);
    });
  });

  describe('POST /camping-spots', () => {
    it('should create a new camping spot', async () => {
      const mockSpot = {
        camping_spot_id: 1,
        title: 'New Spot',
        description: 'Test description',
        images: []
      };

      mockPrisma.$transaction.mockResolvedValue(mockSpot);

      const response = await request(app)
        .post('/camping-spots')
        .send({
          title: 'New Spot',
          description: 'Test description',
          max_guests: 4,
          price_per_night: 100,
          location: {
            address_line1: 'Test Street',
            city: 'Test City',
            country_id: 1,
            postal_code: '1234',
            longtitute: '0',
            latitute: '0'
          },
          amenities: [1, 2],
          owner_id: 1,
          images: []
        });

      expect(response.status).toBe(201);
      expect(response.body).toEqual(mockSpot);
    });
  });
});
