const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const helmet = require('helmet');
const { paymentLimiter, authLimiter, apiLimiter } = require('./middleware/rate-limit');
const { authenticate } = require('./middleware/auth');
const PaymentService = require('./services/payment.service');

// Import the CORS middleware options - we're using the simple one for debugging
// const corsEnhanced = require('./middleware/cors-enhanced');
const simpleCors = require('./middleware/simple-cors');

// Import routes
const authRoutes = require('./routes/auth');
const authOauthRoutes = require('./routes/auth/oauth');
const googleAuthRoutes = require('./routes/auth/google');
const userRoutes = require('./routes/users');
const campingSpotsRoutes = require('./routes/campingSpots');
const bookingRoutes = require('./routes/bookings');
const reviewRoutes = require('./routes/reviews');
const dashboardRoutes = require('./routes/dashboard');
const healthRoutes = require('./routes/health');
const amenitiesRoutes = require('./routes/amenities');

// Create Express app
const app = express();

// Basic middleware setup
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '../public')));

// Apply our simple CORS middleware before all other middleware
app.use(simpleCors);

// Enhanced security middleware
app.use(helmet({
    contentSecurityPolicy: false, // Disable CSP for debugging
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: false
}));

// Remove the default CORS middleware since we're using our enhanced version
// app.use(cors({
//     origin: function(origin, callback) {
//         const allowedOrigins = [
//             process.env.FRONTEND_URL,
//             'http://localhost:5173',
//             'http://localhost:5174',
//             'https://airbnb-frontend-i8p5-git-main-karoliskalinauskas1s-projects.vercel.app',
//             'https://airbnb-frontend-gamma.vercel.app',
//             'https://*.vercel.app'
//         ].filter(Boolean);
//         
//         if (!origin || allowedOrigins.some(allowed => {
//             if (allowed.includes('*')) {
//                 const domain = allowed.replace('*', '.*');
//                 return new RegExp(`^${domain}$`).test(origin);
//             }
//             return origin === allowed;
//         })) {
//             callback(null, true);
//         } else {
//             callback(new Error('Not allowed by CORS'));
//         }
//     },
//     methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
//     allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
//     credentials: true,
//     maxAge: 86400
// }));

// Apply rate limiters
app.use('/api/auth', authLimiter);
app.use('/api/checkout', paymentLimiter);
app.use('/api', apiLimiter);

// Add base route at app level for Railway health checks - CRITICAL for deployment
app.get('/health', (req, res) => {
  console.log('Root health check endpoint called at', new Date().toISOString());
  res.status(200).json({ status: 'ok' });
});

// Also add API health endpoint directly to ensure it's working even if route mounting fails
app.get('/api/health', (req, res) => {
  console.log('API health check endpoint called at', new Date().toISOString());
  res.status(200).json({ status: 'ok' });
});

// Add ping endpoint as a secondary health check
app.get('/ping', (req, res) => {
  res.status(200).json({ status: 'pong' });
});

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/auth/oauth', authOauthRoutes);
app.use('/api/auth/oauth/google', googleAuthRoutes);
app.use('/api/users', userRoutes);
app.use('/api/camping-spots', campingSpotsRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/amenities', amenitiesRoutes);

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Enhanced payment endpoint with detailed error handling
app.post('/api/checkout/create-session', paymentLimiter, authenticate, async (req, res) => {
    try {
        // Log the request for debugging
        console.log('Checkout session request:', {
            body: req.body,
            user: req.user,
            headers: req.headers.authorization ? 'Auth header present' : 'No auth header'
        });

        // Get authenticated user info
        if (!req.user) {
            return res.status(401).json({
                error: 'Authentication required',
                message: 'You must be logged in to complete a booking'
            });
        }

        // Debug exactly what fields we have for better troubleshooting
        console.log('Request body raw:', JSON.stringify(req.body, null, 2));
        
        // Extract fields directly with proper typing and fallbacks
        const spotId = parseInt(req.body.spotId || 0);
        const startDate = req.body.startDate || null;
        const endDate = req.body.endDate || null;
        const guestCount = parseInt(req.body.guests || 1);
        const totalAmount = parseFloat(req.body.totalAmount || 0);
        
        // Transform frontend data format to match backend expectations with direct assignments
        const transformedData = {
            camper_id: spotId,
            user_id: req.user.user_id,
            start_date: startDate,
            end_date: endDate,
            number_of_guests: guestCount,
            total: totalAmount
        };
        
        console.log('Transformed checkout data:', transformedData);
        
        console.log('Transformed checkout data:', transformedData);
        
        const session = await PaymentService.createCheckoutSession(transformedData);
        res.json(session);
    } catch (error) {
        console.error('Payment initialization error:', error);
        
        // Handle Stripe-specific errors
        if (error.type === 'StripeCardError') {
            return res.status(402).json({
                error: 'Payment card error',
                message: error.message,
                code: error.code
            });
        }
        
        // Handle validation errors
        if (error.type === 'StripeInvalidRequestError') {
            return res.status(400).json({
                error: 'Invalid payment request',
                message: error.message,
                param: error.param
            });
        }
        
        // Handle authentication errors
        if (error.type === 'StripeAuthenticationError') {
            return res.status(401).json({
                error: 'Payment authentication failed',
                message: 'Could not authenticate with payment provider'
            });
        }
        
        // Handle API connection errors
        if (error.type === 'StripeAPIConnectionError') {
            return res.status(503).json({
                error: 'Payment service unavailable',
                message: 'Could not connect to payment service'
            });
        }
        
        // Handle rate limiting
        if (error.type === 'StripeRateLimitError') {
            return res.status(429).json({
                error: 'Too many payment requests',
                message: 'Please try again in a few moments'
            });
        }
        
        // Handle any other Stripe errors
        if (error.type?.startsWith('Stripe')) {
            return res.status(400).json({
                error: 'Payment processing error',
                message: error.message
            });
        }
        
        // Handle internal server errors
        res.status(500).json({
            error: 'Payment initialization failed',
            message: 'An unexpected error occurred while processing your payment'
        });
    }
});

// Error handling
app.use((err, req, res, next) => {
    // Log detailed error information
    console.error('Application error:', {
        path: req.path,
        method: req.method,
        error: err.message,
        stack: err.stack,
        timestamp: new Date().toISOString()
    });
    
    // Handle specific error types
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            error: 'Validation Error',
            message: err.message,
            details: err.details || 'Invalid input data'
        });
    }
    
    if (err.name === 'PrismaClientKnownRequestError') {
        return res.status(400).json({
            error: 'Database Error',
            message: 'Invalid data provided',
            code: err.code
        });
    }
    
    if (err.name === 'PrismaClientInitializationError') {
        return res.status(503).json({
            error: 'Database Service Unavailable',
            message: 'Database connection failed'
        });
    }
    
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
            error: 'Authentication Error',
            message: 'Invalid authentication token'
        });
    }
    
    // Default error response with less information in production
    res.status(err.status || 500).json({
        error: err.name || 'Server Error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred'
    });
});

module.exports = app;