# Technical Documentation

## Code Structure

### Backend Structure
```
airbnb_backend/
├── src/                    # Source code
│   ├── app.js             # Main application setup
│   ├── config/            # Configuration files
│   ├── middleware/        # Custom middleware
│   ├── routes/            # API routes
│   ├── services/          # Business logic
│   ├── utils/             # Utility functions
│   └── validators/        # Input validation
├── prisma/                # Database schema and migrations
├── tests/                 # Test files
└── docs/                  # Documentation
```

### Frontend Structure
```
airbnb_frontend/
├── src/
│   ├── components/        # Vue components
│   ├── views/            # Page components
│   ├── store/            # Pinia stores
│   ├── router/           # Vue Router configuration
│   ├── services/         # API services
│   └── utils/            # Utility functions
```

## Key Components

### Authentication System
```javascript
// JWT Authentication Flow
1. User login/register
2. Server validates credentials
3. JWT token generated
4. Token stored in secure cookie
5. Token used for subsequent requests
```

### Database Operations
```javascript
// Prisma ORM Usage
1. Schema definition in prisma/schema.prisma
2. Migrations for database changes
3. CRUD operations using Prisma Client
4. Transaction handling for complex operations
```

### API Endpoints

#### Authentication
- POST `/api/auth/register` - User registration
- POST `/api/auth/login` - User login
- POST `/api/auth/logout` - User logout
- GET `/api/auth/me` - Get current user

#### Camping Spots
- GET `/api/camping-spots` - List camping spots
- POST `/api/camping-spots` - Create camping spot
- GET `/api/camping-spots/:id` - Get spot details
- PUT `/api/camping-spots/:id` - Update spot
- DELETE `/api/camping-spots/:id` - Delete spot

#### Bookings
- POST `/api/bookings` - Create booking
- GET `/api/bookings` - List user bookings
- GET `/api/bookings/:id` - Get booking details
- PUT `/api/bookings/:id` - Update booking
- DELETE `/api/bookings/:id` - Cancel booking

## Error Handling

### Custom Error Classes
```javascript
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
  }
}
```

### Error Middleware
```javascript
const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (process.env.NODE_ENV === 'development') {
    res.status(err.statusCode).json({
      status: err.status,
      error: err,
      message: err.message,
      stack: err.stack
    });
  } else {
    res.status(err.statusCode).json({
      status: err.status,
      message: err.message
    });
  }
};
```

## Security Implementation

### JWT Authentication
```javascript
const jwt = require('jsonwebtoken');

const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN
  });
};
```

### Password Hashing
```javascript
const bcrypt = require('bcryptjs');

const hashPassword = async (password) => {
  return await bcrypt.hash(password, 12);
};

const comparePassword = async (password, hashedPassword) => {
  return await bcrypt.compare(password, hashedPassword);
};
```

## File Upload

### Image Upload Configuration
```javascript
const multer = require('multer');
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
```

## Testing

### Unit Tests
```javascript
describe('User Service', () => {
  it('should create a new user', async () => {
    // Test implementation
  });

  it('should authenticate user', async () => {
    // Test implementation
  });
});
```

### Integration Tests
```javascript
describe('Auth API', () => {
  it('should register new user', async () => {
    // Test implementation
  });

  it('should login user', async () => {
    // Test implementation
  });
});
```

## Performance Optimization

### Database Indexing
```sql
-- Example indexes for common queries
CREATE INDEX idx_camping_spots_location ON camping_spots(location);
CREATE INDEX idx_bookings_dates ON bookings(start_date, end_date);
```

### Caching Strategy
```javascript
const cache = require('node-cache');
const cacheInstance = new cache({ stdTTL: 300 }); // 5 minutes

const getCachedData = async (key, fetchFunction) => {
  const cachedData = cacheInstance.get(key);
  if (cachedData) return cachedData;
  
  const freshData = await fetchFunction();
  cacheInstance.set(key, freshData);
  return freshData;
};
```

## Deployment

### Docker Configuration
```dockerfile
# Backend Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

### Environment Variables
```env
# Required environment variables
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://user:password@localhost:5432/db
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=90d
```

## Monitoring and Logging

### Winston Logger Configuration
```javascript
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});
```

## API Response Format

### Success Response
```javascript
{
  "status": "success",
  "data": {
    // Response data
  }
}
```

### Error Response
```javascript
{
  "status": "error",
  "message": "Error message",
  "code": "ERROR_CODE"
}
```

## Rate Limiting

### Implementation
```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/api/', limiter);
``` 