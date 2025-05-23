const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const { paymentLimiter, authLimiter, apiLimiter } = require('./middleware/rate-limit');
const corsConfig = require('./middleware/cors-config');
const errorRecovery = require('./middleware/error-recovery');

// Create Express app
const app = express();

// Basic middleware setup
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// Apply security middleware first
app.use(helmet({
    contentSecurityPolicy: false, // Configured separately
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Apply CORS configuration
app.use(corsConfig);

// Apply rate limiters
app.use('/api/auth', authLimiter);
app.use('/api/checkout', paymentLimiter);
app.use('/api', apiLimiter);

// Import and mount routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const campingSpotsRoutes = require('./routes/camping-spots');
const bookingRoutes = require('./routes/bookings');
const healthRoutes = require('./routes/health');

// Simple health check endpoint that doesn't depend on other services
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/camping-spots', campingSpotsRoutes);
app.use('/api/bookings', bookingRoutes);

// Error handling middleware - must be last
app.use(errorRecovery);

module.exports = app;