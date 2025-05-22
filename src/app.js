const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const helmet = require('helmet');
const { paymentLimiter, authLimiter, apiLimiter } = require('./middleware/rate-limit');
const PaymentService = require('./services/payment.service');

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

// Enhanced security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", 'https://js.stripe.com'],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
            connectSrc: ["'self'", 
                process.env.SUPABASE_URL,
                'https://api.stripe.com',
                'https://js.stripe.com'
            ],
            frameSrc: ["'self'", 'https://js.stripe.com', 'https://hooks.stripe.com'],
            formAction: ["'self'"],
            upgradeInsecureRequests: []
        }
    },
    crossOriginEmbedderPolicy: false, // Required for Stripe
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS configuration
app.use(cors({
    origin: function(origin, callback) {
        const allowedOrigins = [
            process.env.FRONTEND_URL,
            'http://localhost:5173',
            'http://localhost:5174',
            'https://airbnb-frontend-i8p5-git-main-karoliskalinauskas1s-projects.vercel.app',
            'https://airbnb-frontend-gamma.vercel.app',
            'https://*.vercel.app'
        ].filter(Boolean);
        
        if (!origin || allowedOrigins.some(allowed => {
            if (allowed.includes('*')) {
                const domain = allowed.replace('*', '.*');
                return new RegExp(`^${domain}$`).test(origin);
            }
            return origin === allowed;
        })) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    credentials: true,
    maxAge: 86400
}));

// Apply rate limiters
app.use('/api/auth', authLimiter);
app.use('/api/checkout', paymentLimiter);
app.use('/api', apiLimiter);

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

// Enhanced payment endpoint with detailed error handling
app.post('/api/checkout/create-session', paymentLimiter, async (req, res) => {
    try {
        const session = await PaymentService.createCheckoutSession(req.body);
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
    console.error(err.stack);
    res.status(err.status || 500).json({
        error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
});

module.exports = app;