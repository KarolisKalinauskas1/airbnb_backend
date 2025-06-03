const request = require('supertest');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { isPublicRoute } = require('../src/config/public-routes');
const { revokeToken } = require('../src/middleware/auth.middleware');

const prisma = new PrismaClient();

// Import your express app
const app = require('../src/app');

describe('Authentication System', () => {
    describe('Public Routes', () => {
        it('should allow access to public endpoints without auth', async () => {
            const response = await request(app)
                .get('/api/camping-spots');
            
            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
        });

        it('should allow access to public endpoints with optional auth', async () => {
            const response = await request(app)
                .get('/api/camping-spots/search?location=beach');
            
            expect(response.status).toBe(200);
        });

        it('should identify public routes correctly', () => {
            expect(isPublicRoute('/api/auth/login', 'POST')).toBe(true);
            expect(isPublicRoute('/api/auth/register', 'POST')).toBe(true);
            expect(isPublicRoute('/api/camping-spots', 'GET')).toBe(true);
            expect(isPublicRoute('/api/camping-spots', 'POST')).toBe(false);
        });
    });

    describe('Protected Routes', () => {
        let authToken;
        let testUser;

        beforeAll(async () => {
            // Create a test user
            testUser = await prisma.users.create({
                data: {
                    email: 'test@example.com',
                    full_name: 'Test User',
                    auth_user_id: 'test123',
                    isowner: '0',
                    verified: 'yes'
                }
            });

            // Generate token
            authToken = jwt.sign(
                { email: testUser.email, id: testUser.user_id },
                process.env.JWT_SECRET,
                { expiresIn: '1h' }
            );
        });

        afterAll(async () => {
            // Cleanup test user
            if (testUser) {
                await prisma.users.delete({
                    where: { email: 'test@example.com' }
                });
            }
        });

        it('should require auth for protected endpoints', async () => {
            const response = await request(app)
                .post('/api/camping-spots')
                .send({
                    title: 'Test Spot',
                    description: 'Test Description'
                });
            
            expect(response.status).toBe(401);
        });

        it('should allow access with valid auth', async () => {
            const response = await request(app)
                .post('/api/camping-spots')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    title: 'Test Spot',
                    description: 'Test Description'
                });
            
            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('camping_spot_id');
        });

        it('should reject invalid tokens', async () => {
            const response = await request(app)
                .post('/api/camping-spots')
                .set('Authorization', 'Bearer invalid.token')
                .send({
                    title: 'Test Spot',
                    description: 'Test Description'
                });
            
            expect(response.status).toBe(401);
        });

        it('should handle token blacklisting', async () => {
            // First request should succeed
            const response1 = await request(app)
                .post('/api/camping-spots')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    title: 'Test Spot',
                    description: 'Test Description'
                });
            
            expect(response1.status).toBe(201);

            // Blacklist the token
            revokeToken(authToken);

            // Second request with same token should fail
            const response2 = await request(app)
                .post('/api/camping-spots')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    title: 'Test Spot',
                    description: 'Test Description'
                });
            
            expect(response2.status).toBe(401);
            expect(response2.body).toHaveProperty('error', 'Token has been revoked');
        });
    });

    describe('Optional Authentication', () => {
        let authToken;
        let testUser;

        beforeAll(async () => {
            // Create a test user
            testUser = await prisma.users.create({
                data: {
                    email: 'test2@example.com',
                    full_name: 'Test User 2',
                    auth_user_id: 'test456',
                    isowner: '0',
                    verified: 'yes'
                }
            });

            // Generate token
            authToken = jwt.sign(
                { email: testUser.email, id: testUser.user_id },
                process.env.JWT_SECRET,
                { expiresIn: '1h' }
            );
        });

        afterAll(async () => {
            // Cleanup test user
            if (testUser) {
                await prisma.users.delete({
                    where: { email: 'test2@example.com' }
                });
            }
        });

        it('should enhance response with user data when token provided', async () => {
            const response = await request(app)
                .get('/api/camping-spots')
                .set('Authorization', `Bearer ${authToken}`);
            
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('userContext');
            expect(response.body.userContext).toHaveProperty('email', testUser.email);
        });

        it('should return basic data when no token provided', async () => {
            const response = await request(app)
                .get('/api/camping-spots');
            
            expect(response.status).toBe(200);
            expect(response.body).not.toHaveProperty('userContext');
        });

        it('should continue as public access when invalid token provided', async () => {
            const response = await request(app)
                .get('/api/camping-spots')
                .set('Authorization', 'Bearer invalid.token');
            
            expect(response.status).toBe(200);
            expect(response.body).not.toHaveProperty('userContext');
        });
    });

    describe('Circuit Breaker', () => {
        it('should activate circuit breaker after multiple failures', async () => {
            // Make multiple failed auth attempts
            for (let i = 0; i < 11; i++) {
                await request(app)
                    .post('/api/camping-spots')
                    .set('Authorization', 'Bearer invalid.token')
                    .send({
                        title: 'Test Spot',
                        description: 'Test Description'
                    });
            }

            // Circuit breaker should now be active
            const response = await request(app)
                .post('/api/camping-spots')
                .set('Authorization', 'Bearer some.valid.token')
                .send({
                    title: 'Test Spot',
                    description: 'Test Description'
                });
            
            expect(response.status).toBe(503);
            expect(response.body).toHaveProperty('error', 'Service temporarily unavailable');
        });
    });
});
