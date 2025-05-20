# Camping Spots - Backend

A comprehensive Node.js/Express backend that powers the Camping Spots rental platform. This server provides RESTful API endpoints for user authentication, camping spot management, bookings, reviews, and more.

## Technology Stack

- **Runtime**: Node.js 16+
- **Framework**: Express.js
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: JWT tokens via Supabase
- **File Storage**: Cloudinary
- **Validation**: Zod schemas
- **Logging**: Winston & Morgan
- **Security**: Helmet, CORS, rate limiting

## Directory Structure

```
airbnb_backend/
├── app.js                 # Main Express application setup
├── server.js              # Server entry point
├── config/                # Configuration files
│   ├── database.js        # Database connection configuration
│   └── supabase.js        # Supabase client configuration
├── middleware/            # Express middleware
├── prisma/                # Prisma ORM configuration
│   └── schema.prisma      # Database schema definition
├── routes/                # API route definitions
├── schemas/               # Zod validation schemas 
├── scripts/               # Utility scripts
├── src/                   # Core application code
│   ├── features/          # Feature-based modules
│   │   ├── auth/          # Authentication
│   │   ├── bookings/      # Booking management
│   │   ├── camping/       # Camping spots
│   │   ├── dashboard/     # Admin dashboard
│   │   ├── reviews/       # Reviews
│   │   └── users/         # User management
│   └── utils/             # Utility functions
└── utils/                 # Global utility functions
```

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login existing user
- `POST /api/auth/refresh` - Refresh JWT token
- `GET /api/auth/me` - Get current user info
- `POST /api/auth/oauth/google` - Initiate Google OAuth flow

### Camping Spots

- `GET /api/camping-spots` - List all camping spots
- `GET /api/camping-spots/:id` - Get camping spot details
- `POST /api/camping-spots` - Create new camping spot (authenticated)
- `PUT /api/camping-spots/:id` - Update camping spot (owner only)
- `DELETE /api/camping-spots/:id` - Delete camping spot (owner only)
- `GET /api/camping-spots/:id/availability` - Check availability

### Bookings

- `GET /api/bookings` - List user bookings (authenticated)
- `GET /api/bookings/:id` - Get booking details (authenticated)
- `POST /api/bookings` - Create new booking (authenticated)
- `PUT /api/bookings/:id/cancel` - Cancel booking (authenticated)

### Reviews

- `GET /api/reviews/camping-spot/:id` - Get reviews for camping spot
- `POST /api/reviews` - Create new review (authenticated)
- `PUT /api/reviews/:id` - Update review (owner only)
- `DELETE /api/reviews/:id` - Delete review (owner only)

### Dashboard

- `GET /api/dashboard` - Get owner dashboard data (authenticated)

## Setup Instructions

### Prerequisites

- Node.js 16+
- PostgreSQL database
- Supabase account (optional for deployment)

### Local Development

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create `.env` file:
   ```
   # Database
   DATABASE_URL=postgresql://postgres:password@localhost:5432/camping_spots
   
   # JWT
   JWT_SECRET=your-secret-key
   JWT_EXPIRY=7d
   
   # Supabase (optional)
   SUPABASE_URL=https://your-project-url.supabase.co
   SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_KEY=your-service-key
   
   # Cloudinary
   CLOUDINARY_CLOUD_NAME=your-cloud-name
   CLOUDINARY_API_KEY=your-api-key
   CLOUDINARY_API_SECRET=your-api-secret
   
   # Server
   PORT=3000
   NODE_ENV=development
   CORS_ORIGIN=http://localhost:5173
   ```
4. Setup database:
   ```bash
   npx prisma generate
   npx prisma migrate dev
   ```
5. Start development server:
   ```bash
   npm run dev
   ```

### Production Deployment

1. Set up environment variables in your deployment environment
2. Build the application:
   ```bash
   npm run build
   ```
3. Run database migrations:
   ```bash
   npx prisma migrate deploy
   ```
4. Start the application:
   ```bash
   npm start
   ```

## Security Features

- **Authentication**: JWT-based with refresh tokens
- **Password Security**: Bcrypt hashing with salt rounds
- **SQL Injection Protection**: Prisma ORM for safe queries
- **XSS Prevention**: Input validation and sanitization
- **CSRF Protection**: Protection via secure cookies
- **Rate Limiting**: Prevents API abuse
- **Content Security Policy**: Via Helmet
- **CORS**: Configurable origins

## Feature-Based Architecture

The project follows a feature-based architecture where code is organized by business domain rather than technical role. Each feature directory contains everything needed for that feature.

### Benefits

- Better code organization and maintainability
- Easier to understand relationships between components
- More scalable as the application grows
- Better separation of concerns

## Testing

Run tests with:
```bash
npm run test
```

## API Documentation

Run the server and visit `/api/docs` for SwaggerUI documentation.

## Error Handling

The application uses a centralized error handling approach:

1. Specific error classes for different error types
2. Middleware to catch and format errors
3. Consistent error responses with status codes and messages

## Logging

- Winston logger for application logs
- Morgan for HTTP request logging
- Structured logs in production, formatted logs in development

## Deployment on Vercel

This application is configured for deployment on Vercel:

1. Connect your GitHub repository to Vercel
2. Configure build settings:
   - Root directory: `airbnb_backend`
   - Build command: `npm run build`
   - Install command: `npm install`
3. Add all environment variables
4. Deploy
5. Run Prisma migrations with:
   ```bash
   npx vercel run npx prisma migrate deploy
   ```

## Database Connection with Supabase

For production, the app can use Supabase as the PostgreSQL provider:

1. Create a Supabase project
2. Get your connection string from Settings > Database
3. Set the `DATABASE_URL` environment variable
4. Run migrations to set up schema

## License

This project is licensed under the MIT License.
