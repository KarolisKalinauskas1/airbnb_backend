const request = require('supertest');
const express = require('express');

// Create mock and export it so we can access it in tests
const mockPrisma = {
  public_users: {
    findUnique: jest.fn(),
    create: jest.fn()
  },
  owner: {
    create: jest.fn()
  },
  $queryRawUnsafe: jest.fn()
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma)
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn()
    }
  }))
}));

// Require router after mocks are set up
const userRouter = require('../../routes/users');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const app = express();
app.use(express.json());
app.use('/api/users', userRouter);

describe('Users Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/users', () => {
    it('should create a new user', async () => {
      mockPrisma.public_users.findUnique.mockResolvedValue(null);
      mockPrisma.public_users.create.mockResolvedValue({
        user_id: 1,
        email: 'test@test.com',
        full_name: 'Test User'
      });

      const response = await request(app)
        .post('/api/users')
        .send({
          email: 'test@test.com',
          full_name: 'Test User',
          is_seller: false
        });

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('User created');
    });

    it('should handle existing user', async () => {
      mockPrisma.public_users.findUnique.mockResolvedValue({
        user_id: 1,
        email: 'test@test.com'
      });

      const response = await request(app)
        .post('/api/users')
        .send({
          email: 'test@test.com',
          full_name: 'Test User'
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('User already exists');
    });
  });
});
