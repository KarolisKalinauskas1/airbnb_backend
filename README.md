# Airbnb for Camping - Backend

A comprehensive Node.js/Express backend that powers the Airbnb for Camping platform. This server provides RESTful API endpoints for handling user authentication, camping spot management, bookings, reviews, and payment processing.

## Technology Stack

- **Runtime**: Node.js 16+
- **Framework**: Express.js
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: JWT tokens via Supabase
- **Payment Processing**: Stripe API integration
- **File Storage**: Cloudinary
- **Validation**: Zod schemas
- **Logging**: Winston & Morgan
- **Security**: Helmet, CORS, rate limiting

## Detailed Architecture

### Directory Structure

```
airbnb_backend/
├── app.js                 # Main Express application setup
├── config/                # Configuration files
│   ├── api-endpoints.js   # API endpoint definitions
│   ├── database.js        # Database connection configuration
│   ├── session-config.js  # Session management settings
│   └── supabase.js        # Supabase client configuration
├── debug/                 # Debugging utilities
├── middleware/            # Express middleware
│   ├── cors-handler.js    # CORS configuration
│   ├── fallback-handler.js # Error fallback handler
│   └── ...
├── prisma/                # Prisma ORM configuration
│   ├── schema.prisma      # Database schema definition
│   └── migrations/        # Database migrations
├── routes/                # API route definitions
│   ├── auth.js            # Authentication routes
│   ├── bookings.js        # Booking management routes
│   ├── campers.js         # Camping spot routes
│   ├── dashboard.js       # Owner dashboard routes
│   ├── reviews.js         # Review management routes
│   ├── webhooks.js        # External service webhook handlers
│   └── ...
├── schemas/               # Zod validation schemas
├── scripts/               # Utility scripts for maintenance
├── services/              # Service layer for business logic
├── src/                   # Alternative structure for some components
├── uploads/               # Temporary file storage
└── utils/                 # Utility functions
    ├── booking-utils.js   # Booking-related utilities
    ├── cloudinary.js      # Cloudinary integration
    ├── geocoding.js       # Location services
    ├── jwt-helper.js      # JWT token management
    ├── logger.js          # Logging configuration
    └── ...
```

## Database Schema

Our backend uses Prisma ORM to interact with a PostgreSQL database. The schema defines the following key models:

- **users**: User accounts and profile information
- **camping_spot**: Detailed information about available camping locations
- **bookings**: Reservation records linking users and camping spots
- **transaction**: Payment records for bookings
- **review**: User-submitted reviews and ratings
- **amenity**: Features available at camping spots
- **location**: Geographical information for camping spots
- **owner**: Additional information for users who are camping spot owners

For a complete schema definition, see `prisma/schema.prisma`.

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Authenticate a user and receive tokens
- `GET /api/auth/logout` - Invalidate the current session
- `GET /api/auth/refresh` - Refresh the access token
- `GET /api/auth/verify` - Verify a user's email

### Users

- `GET /api/users/profile` - Get the current user's profile
- `PUT /api/users/profile` - Update the current user's profile
- `GET /api/users/full-info` - Get complete user information (admin only)

### Camping Spots

- `GET /api/campers` - List all camping spots (with filtering options)
- `GET /api/campers/:id` - Get details for a specific camping spot
- `POST /api/campers` - Create a new camping spot (owner only)
- `PUT /api/campers/:id` - Update a camping spot (owner only)
- `DELETE /api/campers/:id` - Delete a camping spot (owner only)
- `GET /api/campers/:id/amenities` - Get amenities for a specific camping spot

### Bookings

- `GET /api/bookings` - Get the current user's bookings
- `GET /api/bookings/:id` - Get details for a specific booking
- `POST /api/bookings` - Create a booking
- `POST /api/bookings/create-checkout-session` - Create a Stripe checkout session
- `PUT /api/bookings/:id/status` - Update a booking's status

### Reviews

- `GET /api/reviews/spot/:id` - Get reviews for a specific camping spot
- `POST /api/reviews` - Create a new review
- `PUT /api/reviews/:id` - Update a review (reviewer only)
- `DELETE /api/reviews/:id` - Delete a review (reviewer or admin only)

### Owner Dashboard

- `GET /api/dashboard` - Get owner dashboard overview
- `GET /api/dashboard/spots` - Get owner's camping spots
- `GET /api/dashboard/bookings` - Get bookings for owner's spots
- `GET /api/dashboard/transactions` - Get transaction history

### Webhooks

- `POST /api/webhooks/stripe` - Handle Stripe payment events

### Diagnostic & Debug

- `GET /api/health` - API health check
- `GET /api/diagnostics` - System diagnostics information
- `GET /api/diagnostics/field-test` - Test database field constraints

## Middleware

The application uses several middleware components:

- **Authentication Middleware**: Verifies JWT tokens and attaches user data to requests
- **Error Handling Middleware**: Catches and formats errors for consistent responses
- **CORS Middleware**: Manages Cross-Origin Resource Sharing
- **Rate Limiting**: Prevents abuse through request rate limiting
- **Logging Middleware**: Records request and response details
- **Validation Middleware**: Validates request data against Zod schemas

## Authentication Flow

1. User registers or logs in through the frontend
2. Backend validates credentials and returns JWT tokens
3. Frontend includes token in Authorization header for subsequent requests
4. Backend middleware validates token and authorizes the user
5. Token refresh happens automatically when needed

## Setup Instructions

### Prerequisites

- Node.js 16+ and npm
- PostgreSQL 13+ database
- Supabase account
- Stripe account (for payments)
- Cloudinary account (for image storage)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd airbnb_backend
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file with the following variables:
```env
# Database Configuration
DATABASE_URL="postgresql://username:password@localhost:5432/airbnb_camping"
DIRECT_URL="postgresql://username:password@localhost:5432/airbnb_camping"

# Supabase Configuration
SUPABASE_URL="your-supabase-url"
SUPABASE_ANON_KEY="your-supabase-anon-key"
SUPABASE_SERVICE_KEY="your-supabase-service-key"

# JWT Configuration
JWT_SECRET="your-jwt-secret"

# Stripe Configuration
STRIPE_SECRET_KEY="your-stripe-secret-key"
STRIPE_WEBHOOK_SECRET="your-stripe-webhook-secret"

# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME="your-cloudinary-name"
CLOUDINARY_API_KEY="your-cloudinary-api-key"
CLOUDINARY_API_SECRET="your-cloudinary-api-secret"

# Application Configuration
PORT=3000
NODE_ENV="development"
FRONTEND_URL="http://localhost:5173"
```

4. Generate Prisma client and run migrations:
```bash
npx prisma generate
npx prisma migrate dev
```

5. Start the development server:
```bash
npm run dev
```

The API will be available at http://localhost:3000

### Docker Setup

Alternatively, you can use Docker:

```bash
# Build the Docker image
docker build -t airbnb-camping-backend .

# Run the container
docker run -p 3000:3000 --env-file .env airbnb-camping-backend
```

Or use Docker Compose from the project root:

```bash
docker-compose up -d backend
```

## Debugging & Troubleshooting

### Common Issues

1. **Database Connection Issues**
   - Run `node scripts/check-db-connection.js` to diagnose connection problems
   - Ensure PostgreSQL is running and accessible
   - Verify database credentials in .env file

2. **Authentication Failures**
   - Check Supabase configuration variables
   - Ensure JWT_SECRET matches across environments
   - Run `node scripts/check-supabase.js` to verify Supabase connectivity

3. **Network/CORS Errors**
   - Verify FRONTEND_URL is set correctly
   - Run `node scripts/network-diagnostics.js` to check network connectivity

### Logging

The application uses Winston for logging. Logs are stored in:
- `combined.log`: All logs
- `error.log`: Error logs only

In development mode, logs are also printed to the console.

## Testing

```bash
# Run all tests
npm test

# Run specific test suites
npm test -- --grep "Authentication"

# Run tests with coverage
npm run test:coverage
```

## Performance Considerations

- Database queries are optimized with proper indexing
- Caching is implemented for frequently accessed data
- Rate limiting prevents API abuse
- Large responses are paginated

## Security Features

- JWT token authentication
- Input validation with Zod schemas
- Secure headers with Helmet
- CORS protection
- Rate limiting
- Password hashing with bcrypt
- Environment variable validation

## Deployment

The application is designed to be deployed as a Docker container. The included Dockerfile handles all the necessary build steps.

For production deployment, ensure that:
1. NODE_ENV is set to "production"
2. All security-related environment variables are properly set
3. Database connections are properly secured
4. Logging is configured appropriately

## Development Guidelines

- Follow ESLint rules for consistent code style
- Write tests for all new features
- Follow the established project structure
- Document new API endpoints
- Use the provided utility functions where applicable