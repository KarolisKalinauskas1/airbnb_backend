const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
// Morgan logger removed for production
const helmet = require('helmet');
const prisma = require('./config/prisma');

// Import routes from src/routes (consolidated structure)
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
// Import middleware
const { errorHandler } = require('./middleware/error');
const routeAccessMiddleware = require('./middleware/route-access');
const { authenticate } = require('./middleware/auth');
const { optionalAuthenticate } = require('./middleware/auth'); // Import optionalAuthenticate middleware

// Create Express app
const app = express();

// Basic middleware
// Logger disabled for production
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '../public')));

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://api.example.com']
    }
  },
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: true,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  dnsPrefetchControl: true,
  frameguard: { action: 'deny' },
  hidePoweredBy: true,
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  ieNoOpen: true,
  noSniff: true,
  originAgentCluster: true,
}));

// CORS configuration with enhanced error handling and logging
app.use(cors({
  origin: function(origin, callback) {
    // Define allowed origins
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:5174',
      'https://airbnb-frontend-i8p5-88p7a4emc-karoliskalinauskas1s-projects.vercel.app',
      'https://airbnb-frontend.vercel.app',
      'https://*.vercel.app',
      'https://airbnb-frontend-gamma.vercel.app',
      process.env.CORS_ORIGIN,
      process.env.FRONTEND_URL
    ].filter(Boolean); // Remove undefined/null values
    
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      console.warn('Request with no origin - allowing (e.g., curl requests)');
      return callback(null, true);
    }
    
    // Check if the origin is in the allowed list
    if (allowedOrigins.some(allowed => {
      if (allowed.includes('*')) {
        // Handle wildcard subdomains
        const domain = allowed.replace('*', '.*');
        return new RegExp(`^${domain}$`).test(origin);
      }
      return origin === allowed;
    })) {
      return callback(null, true);
    }
    
    console.error(`CORS blocked for origin: ${origin}. Allowed origins:`, allowedOrigins);
    callback(new Error(`Not allowed by CORS. Origin: ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  credentials: true,
  optionsSuccessStatus: 200 // Some legacy browsers (IE11, various SmartTVs) choke on 204
}));

// Handle preflight requests
app.options('*', cors());

// Health check endpoints
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/ping', (req, res) => {
  res.status(200).json({ status: 'pong' });
});

app.get('/api/ping', (req, res) => {
  res.status(200).json({ status: 'pong' });
});

// Database connection check middleware
app.use(async (req, res, next) => {
  try {
    // Import the connection helper
    const { ensureConnection } = require('./config/prisma');
    
    // Try to ensure connection before proceeding
    await ensureConnection();
    
    // If we get here, the connection is established
    next();
  } catch (error) {
    console.error('Database connection error in middleware:', error);
    res.status(503).json({ 
      error: 'Database service unavailable', 
      message: 'The server is experiencing database connectivity issues. Please try again later.'
    });
  }
});

// Apply route access middleware BEFORE mounting routes
app.use('/api', (req, res, next) => {
  console.log('API request received:', req.method, req.path);
  routeAccessMiddleware(req, res, next);
});

// Direct handler for the problematic endpoint - provide better forwarding
app.post('/api/checkout/create-session', async (req, res) => {
  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const data = req.body;
    console.log('Received booking checkout data:', JSON.stringify(data, null, 2));

    // Get the camping spot ID from any of the possible field names
    const camping_spot_id = data.camper_id || data.camping_spot_id || null;
    if (!camping_spot_id) {
      console.error('Missing camping spot ID. Received fields:', Object.keys(data));
      return res.status(400).json({ 
        error: 'Missing camping spot ID',
        details: 'Please provide a valid camping spot ID using camper_id or camping_spot_id field'
      });
    }

    if (!data.total) {
      return res.status(400).json({ 
        error: 'Missing payment amount',
        details: 'Please provide a valid payment amount'
      });
    }

    // Normalize the data
    const bookingData = {
      camper_id: camping_spot_id.toString(),
      user_id: (data.user_id || data.userId || '').toString(),
      start_date: data.start_date || data.startDate || '',
      end_date: data.end_date || data.endDate || '',
      number_of_guests: parseInt(data.number_of_guests || data.numberOfGuests || data.guests || '1', 10),
      cost: parseFloat(data.cost || data.baseAmount || '0'),
      service_fee: parseFloat(data.service_fee || data.serviceFee || data.serviceFeeAmount || '0'),
      total: parseFloat(data.total || data.totalAmount || '0'),
      spot_name: data.spot_name || data.spotName || data.title || 'Camping Spot Booking'
    };

    // Session configuration
    const sessionConfig = {
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: bookingData.spot_name,
            },
            unit_amount: Math.round(bookingData.total * 100), // Convert to cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/booking-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/campers/${bookingData.camper_id}`
    };

    // Add metadata with safety checks
    sessionConfig.metadata = {};
    Object.entries(bookingData).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        sessionConfig.metadata[key] = value.toString();
      }
    });

    console.log('Creating Stripe session with config:', JSON.stringify(sessionConfig, null, 2));
    const session = await stripe.checkout.sessions.create(sessionConfig);
    console.log('Created Stripe session:', session.id);

    res.json({ url: session.url });
  } catch (error) {
    console.error('Error in checkout/create-session:', error);

    // Handle Stripe specific errors
    if (error.type && error.type.startsWith('Stripe')) {
      if (error.type === 'StripeInvalidRequestError') {
        return res.status(400).json({ 
          error: 'Invalid payment request',
          details: error.message
        });
      }
      return res.status(500).json({ 
        error: 'Payment processing error',
        details: error.message
      });
    }

    // General error
    return res.status(500).json({ 
      error: 'Failed to initialize payment',
      message: error.message
    });
  }
});

// Add a handler for /api/bookings/create-checkout-session for CampingSpotDetail.vue
app.post('/api/bookings/create-checkout-session', async (req, res) => {
  // This is the endpoint used by CampingSpotDetail.vue
  try {
    console.log('Bookings create-checkout-session endpoint called');
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    
    // Extract data
    const data = req.body;
    console.log('Received booking checkout data:', JSON.stringify(data));
    
    // Validate the data
    if (!data.camper_id && !data.camping_spot_id) {
      return res.status(400).json({ 
        error: 'Missing camping spot ID',
        details: 'Please provide a valid camping spot ID'
      });
    }
    
    if (!data.total) {
      return res.status(400).json({ 
        error: 'Missing payment amount',
        details: 'Please provide a valid payment amount'
      });
    }
    
    // Create session config
    const sessionConfig = {
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: data.spot_name || 'Camping Spot Booking',
            },
            unit_amount: Math.round(data.total * 100), // Convert to cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/booking-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/campers/${data.camper_id || data.camping_spot_id}`
    };
    
    // Add metadata
    const metadata = {};
    if (data.camper_id) metadata.camper_id = String(data.camper_id);
    if (data.camping_spot_id) metadata.camper_id = String(data.camping_spot_id);
    if (data.user_id) metadata.user_id = String(data.user_id);
    if (data.start_date) metadata.start_date = String(data.start_date);
    if (data.end_date) metadata.end_date = String(data.end_date);
    if (data.number_of_guests) metadata.number_of_guests = String(data.number_of_guests);
    if (data.cost) metadata.cost = String(data.cost);
    if (data.service_fee) metadata.service_fee = String(data.service_fee);
    if (data.total) metadata.total = String(data.total);
    
    sessionConfig.metadata = metadata;
    
    // Create the session
    const session = await stripe.checkout.sessions.create(sessionConfig);
    
    // Log what we're sending back
    console.log('Responding with Stripe session:', { id: session.id, url: session.url });
    
    // Send a well-structured response (matching the format expected by frontend)
    return res.json({ 
      url: session.url,
      session_id: session.id,
      status: 'success'
    });
  } catch (error) {
    console.error('Error in bookings/create-checkout-session:', error);
    
    // Handle Stripe specific errors
    if (error.type && error.type.startsWith('Stripe')) {
      if (error.type === 'StripeInvalidRequestError') {
        return res.status(400).json({ 
          error: 'Invalid payment request',
          details: error.message
        });
      }
      
      return res.status(500).json({ 
        error: 'Payment processing error',
        details: error.message
      });
    }
    
    // General error
    return res.status(500).json({ 
      error: 'Failed to initialize payment',
      message: error.message
    });
  }
});

// Mount routes after middleware
app.use('/api/auth', authRoutes);
app.use('/api/auth/oauth', authOauthRoutes);
app.use('/api/auth/oauth/google', googleAuthRoutes);
app.use('/api/users', userRoutes);
app.use('/api/camping-spots', campingSpotsRoutes);
app.use('/api/geocoding', campingSpotsRoutes);
app.use('/api/bookings', bookingRoutes);
// Do not register bookingRoutes under /api/checkout since we handle the specific endpoint directly above
app.use('/api/amenities', amenitiesRoutes);
// Make reviews publicly accessible without authentication
app.use('/api/reviews', reviewRoutes);  
app.use('/api/dashboard', authenticate, dashboardRoutes);
app.use('/api/health', healthRoutes);



// Error handling middleware
app.use(errorHandler);

// Handle 404 errors
app.use((req, res, next) => {
  res.status(404).json({ error: 'Not Found' });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  // Don't exit in production/serverless environment
  if (process.env.NODE_ENV !== 'production') {
    process.exit(1);
  }
});

// Graceful shutdown - conditional for serverless environments
if (process.env.NODE_ENV !== 'production') {
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    await prisma.$disconnect();
    process.exit(0);
  });
} else {
  // In serverless environments, handle shutdown differently
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received in serverless environment');
    try {
      await prisma.$disconnect();
    } catch (err) {
      console.error('Error during prisma disconnect:', err);
    }
    // Don't exit process in serverless environment
  });
}

module.exports = app;