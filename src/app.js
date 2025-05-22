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
  // Forward the request to the proper endpoint handler
  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    
    // Extract essential data from the request body
    let data = req.body;
    
    // Handle various ways the frontend might structure the data
    if (req.body.booking) {
      data = req.body.booking;
    } else if (req.body.bookingData) {
      data = req.body.bookingData;
    }

    // Debug what we received
    console.log('Checkout endpoint received data:', JSON.stringify(data));

    // Format the request structure to match what the correct endpoint expects
    const bookingData = {};
    
    // Enhanced extraction with nested property checks and more detailed logging
    try {
      // Extract camper_id from all possible locations with detailed logging
      let camperId = null;
      const possibleCamperIdSources = [
        { path: 'camper_id', value: data.camper_id },
        { path: 'camperId', value: data.camperId },
        { path: 'camping_spot_id', value: data.camping_spot_id },
        { path: 'spotId', value: data.spotId },
        { path: 'spot.id', value: data.spot?.id },
        { path: 'spot.camping_spot_id', value: data.spot?.camping_spot_id },
        { path: 'campingSpot.camping_spot_id', value: data.campingSpot?.camping_spot_id },
        { path: 'campingSpot.id', value: data.campingSpot?.id }
      ];
      
      for (const source of possibleCamperIdSources) {
        if (source.value) {
          console.log(`Found camper_id in ${source.path}: ${source.value}`);
          camperId = source.value;
          break;
        }
      }
      
      if (!camperId && typeof data === 'object') {
        console.log('No direct camper_id found, searching in nested properties');
        // Additional search in nested objects
        for (const key in data) {
          if (typeof data[key] === 'object' && data[key] !== null) {
            const nestedObj = data[key];
            for (const subKey of ['camper_id', 'camperId', 'camping_spot_id', 'spotId', 'id']) {
              if (nestedObj[subKey]) {
                console.log(`Found camper_id in nested property ${key}.${subKey}: ${nestedObj[subKey]}`);
                camperId = nestedObj[subKey];
                break;
              }
            }
            if (camperId) break;
          }
        }
      }
      
      bookingData.camper_id = camperId;
      
      // Continue with other fields
      bookingData.user_id = data.user_id || data.userId;
      bookingData.start_date = data.start_date || data.startDate;
      bookingData.end_date = data.end_date || data.endDate;
      bookingData.number_of_guests = data.number_of_guests || data.numberOfGuests || data.guests || 1;
      bookingData.cost = data.cost || data.base_price || data.baseCost || data.basePrice || 0;
      bookingData.service_fee = data.service_fee || data.serviceFee || 0;
      bookingData.total = data.total || data.totalCost || data.totalAmount || 0;
      bookingData.spot_name = data.spot_name || data.spotName || data.title || data.spot?.name || data.spot?.title || 'Camping Spot Booking';
    } catch (extractError) {
      console.error('Error during data extraction:', extractError);
    }

    // If total is missing but we have cost, calculate it
    if (!bookingData.total && bookingData.cost) {
      const serviceFee = bookingData.service_fee || (bookingData.cost * 0.1);
      bookingData.total = parseFloat(bookingData.cost) + parseFloat(serviceFee);
      bookingData.service_fee = serviceFee;
    }
    
    // Validate minimum required fields
    const requiredFields = ['camper_id', 'total'];
    const missingFields = requiredFields.filter(field => {
      const isEmpty = !bookingData[field];
      if (isEmpty) {
        console.error(`Field '${field}' is missing or empty. Value:`, bookingData[field]);
      }
      return isEmpty;
    });
    
    if (missingFields.length > 0) {
      console.error('Missing required fields:', missingFields, 'Data after processing:', JSON.stringify(bookingData), 'Original data:', JSON.stringify(data), 'Request body:', JSON.stringify(req.body));
      return res.status(400).json({ 
        error: `Missing required fields: ${missingFields.join(', ')}`,
        received: bookingData,
        original: {
          bodyStructure: Object.keys(req.body),
          dataType: typeof data,
          hasBooking: !!req.body.booking,
          hasBookingData: !!req.body.bookingData
        }
      });
    }
    
    // Create a Stripe checkout session with minimal required data
    const sessionConfig = {
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: bookingData.spot_name || 'Camping Spot Booking',
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

    // Add metadata with validation
    const safeMetadata = {};
    
    // Only include valid fields in metadata
    if (bookingData.camper_id) safeMetadata.camper_id = String(bookingData.camper_id);
    if (bookingData.user_id) safeMetadata.user_id = String(bookingData.user_id);
    if (bookingData.start_date) safeMetadata.start_date = String(bookingData.start_date);
    if (bookingData.end_date) safeMetadata.end_date = String(bookingData.end_date);
    if (bookingData.number_of_guests) safeMetadata.number_of_guests = String(bookingData.number_of_guests);
    if (bookingData.cost) safeMetadata.cost = String(bookingData.cost);
    if (bookingData.service_fee) safeMetadata.service_fee = String(bookingData.service_fee);
    if (bookingData.total) safeMetadata.total = String(bookingData.total);
    
    // Add metadata to session config
    sessionConfig.metadata = safeMetadata;
    
    // Create the session
    const session = await stripe.checkout.sessions.create(sessionConfig);
    
    // Return the session URL
    return res.json({ url: session.url });
  } catch (error) {
    // Add specific error handling for common Stripe issues
    if (error.type === 'StripeInvalidRequestError') {
      if (error.message.includes('valid integer')) {
        // Most common error is the amount not being a valid integer
        return res.status(400).json({ 
          error: 'Invalid payment amount format',
          details: error.message
        });
      }
      return res.status(400).json({ error: `Payment request error: ${error.message}` });
    }
    
    if (error.type === 'StripeAPIError') {
      return res.status(503).json({ error: 'Payment service temporarily unavailable' });
    }
    
    if (error.type === 'StripeAuthenticationError') {
      return res.status(500).json({ error: 'Payment authentication error' });
    }
    
    // Generic error response
    return res.status(500).json({ error: 'Failed to process payment request' });
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