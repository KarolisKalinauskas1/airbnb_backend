# Project Structure Documentation

## New Directory Structure

```
airbnb_backend/
├── src/
│   ├── core/                    # Core application setup
│   │   ├── app.js              # Express app configuration
│   │   ├── server.js           # Server setup
│   │   └── config/             # Application configuration
│   │
│   ├── modules/                # Feature modules
│   │   ├── auth/               # Authentication module
│   │   │   ├── controllers/    # Auth controllers
│   │   │   ├── routes/         # Auth routes
│   │   │   ├── services/       # Auth business logic
│   │   │   ├── middleware/     # Auth middleware
│   │   │   └── validators/     # Auth validation schemas
│   │   │
│   │   ├── users/              # User management module
│   │   │   ├── controllers/    # User controllers
│   │   │   ├── routes/         # User routes
│   │   │   ├── services/       # User business logic
│   │   │   └── validators/     # User validation schemas
│   │   │
│   │   ├── camping/            # Camping spots module
│   │   │   ├── controllers/    # Camping spot controllers
│   │   │   ├── routes/         # Camping spot routes
│   │   │   ├── services/       # Camping spot business logic
│   │   │   └── validators/     # Camping spot validation schemas
│   │   │
│   │   ├── bookings/           # Booking module
│   │   │   ├── controllers/    # Booking controllers
│   │   │   ├── routes/         # Booking routes
│   │   │   ├── services/       # Booking business logic
│   │   │   └── validators/     # Booking validation schemas
│   │   │
│   │   ├── reviews/            # Review module
│   │   │   ├── controllers/    # Review controllers
│   │   │   ├── routes/         # Review routes
│   │   │   ├── services/       # Review business logic
│   │   │   └── validators/     # Review validation schemas
│   │   │
│   │   └── payments/           # Payment module
│   │       ├── controllers/    # Payment controllers
│   │       ├── routes/         # Payment routes
│   │       ├── services/       # Payment business logic
│   │       └── validators/     # Payment validation schemas
│   │
│   ├── shared/                 # Shared resources
│   │   ├── middleware/         # Common middleware
│   │   │   ├── auth.js         # Authentication middleware
│   │   │   ├── error.js        # Error handling middleware
│   │   │   ├── validation.js   # Input validation middleware
│   │   │   └── logging.js      # Request logging middleware
│   │   │
│   │   ├── utils/              # Utility functions
│   │   │   ├── logger.js       # Logging utilities
│   │   │   ├── validators.js   # Common validation functions
│   │   │   ├── helpers.js      # Helper functions
│   │   │   └── constants.js    # Application constants
│   │   │
│   │   └── types/              # TypeScript type definitions
│   │       ├── models.ts       # Data model types
│   │       ├── requests.ts     # Request type definitions
│   │       └── responses.ts    # Response type definitions
│   │
│   └── database/               # Database related files
│       ├── migrations/         # Database migrations
│       ├── seeds/              # Seed data
│       └── prisma/             # Prisma schema and client
│
├── tests/                      # Test files
│   ├── unit/                   # Unit tests
│   ├── integration/            # Integration tests
│   └── e2e/                    # End-to-end tests
│
├── docs/                       # Documentation
│   ├── api/                    # API documentation
│   ├── architecture/           # Architecture documentation
│   └── guides/                 # Development guides
│
├── scripts/                    # Utility scripts
│   ├── setup.js               # Setup script
│   ├── seed.js                # Database seeding script
│   └── cleanup.js             # Cleanup script
│
├── logs/                       # Application logs
│   ├── error.log              # Error logs
│   └── combined.log           # Combined logs
│
└── uploads/                    # File uploads
    ├── images/                # Image uploads
    └── temp/                  # Temporary files
```

## Module Structure

Each module (auth, users, camping, etc.) follows this structure:

```
module/
├── controllers/               # Request handlers
│   ├── index.js              # Controller exports
│   └── [feature].controller.js
│
├── routes/                    # Route definitions
│   ├── index.js              # Route exports
│   └── [feature].routes.js
│
├── services/                  # Business logic
│   ├── index.js              # Service exports
│   └── [feature].service.js
│
├── validators/                # Input validation
│   ├── index.js              # Validator exports
│   └── [feature].validator.js
│
└── types/                     # TypeScript types
    └── [feature].types.ts
```

## Key Benefits of New Structure

1. **Domain-Driven Design**
   - Features are grouped by domain
   - Clear separation of concerns
   - Easy to locate related code

2. **Scalability**
   - Easy to add new features
   - Modules are self-contained
   - Clear boundaries between features

3. **Maintainability**
   - Consistent structure across modules
   - Easy to understand and navigate
   - Clear dependencies

4. **Testing**
   - Organized test structure
   - Easy to write and maintain tests
   - Clear test boundaries

5. **Documentation**
   - Organized documentation
   - Easy to find relevant docs
   - Clear documentation structure

## Implementation Steps

1. Create new directory structure
2. Move existing files to new locations
3. Update import paths
4. Update documentation
5. Run tests to ensure everything works
6. Clean up old directories

## Best Practices

1. **Module Organization**
   - Keep related code together
   - Use clear naming conventions
   - Maintain consistent structure

2. **Code Organization**
   - One file per class/component
   - Clear file naming
   - Proper exports

3. **Testing**
   - Test files mirror source structure
   - Clear test naming
   - Proper test organization

4. **Documentation**
   - Keep docs up to date
   - Use clear documentation structure
   - Include examples 