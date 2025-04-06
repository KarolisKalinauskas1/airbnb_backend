const request = require('supertest');
const express = require('express');

// Create mock prisma client
const mockPrisma = {
  public_users: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn()
  },
  owner: {
    create: jest.fn()
  }
};

// Mock prisma
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma)
}));

// Mock Supabase
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn()
    }
  }))
}));

const userRouter = require('../../routes/users');

const app = express();
app.use(express.json());
app.use('/api/users', userRouter);

describe('User Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/users', () => {
    it('should create a new user successfully', async () => {
      // Arrange
      const userData = {
        email: 'test@example.com',
        full_name: 'Test User',
        is_seller: false
      };

      mockPrisma.public_users.findUnique.mockResolvedValue(null);
      mockPrisma.public_users.create.mockResolvedValue({
        user_id: 1,
        ...userData
      });

      // Act
      const response = await request(app)
        .post('/api/users')
        .send(userData);

      // Assert
      expect(response.status).toBe(201);
      expect(response.body.message).toBe('User created');
    });

    // Add more test cases...
  });

  // Add more endpoint tests...
});
