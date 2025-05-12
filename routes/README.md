# Consolidated Authentication and System Health Modules

This directory contains the consolidated authentication and system health modules for the Airbnb for Camping project.

## Auth Module Structure

The auth module has been reorganized into a modular structure:

```
routes/auth/
  ├── index.js           # Main entry point for auth routes
  └── components/
      ├── main.js        # Core authentication functionality
      ├── lite.js        # Lightweight/optimized auth endpoints
      └── debug.js       # Debugging tools (dev only)
```

### Routes Available

The auth module provides the following routes:

- Standard authentication endpoints (`/api/auth/*`):
  - `/signin` and `/login` - User login
  - `/signup` and `/register` - User registration
  - `/signout` - User logout
  - `/reset-password` - Password reset
  - `/refresh-token` - Token refresh
  - `/status` - Authentication status check
  - Many other auth endpoints...

- Lightweight auth endpoints (`/api/auth/lite/*`):
  - `/sync-session` - Fast session synchronization
  - `/status` - Quick auth status check

- Debug endpoints (`/api/auth/debug/*`) - Only in development:
  - `/` - Auth configuration info
  - `/token-info` - Analyze JWT tokens
  - `/session` - Session info
  - `/headers` - Auth header info
  - `/users` - User database info
  - `/auth-test` - Auth process test

## System Health Module

The system module contains health and diagnostic endpoints consolidated from:
- routes/health.js
- routes/status.js
- routes/diagnostic.js
- routes/diagnostics.js

```
routes/system/
  └── health.js          # Consolidated health and diagnostics
```

### Available Health Routes

- `/health` and `/api/health` - Basic health check
- `/health/detailed` - Detailed health with DB check
- `/health/ping` - Simple ping endpoint
- `/health/status` - System status with version info
- `/health/diagnostics` - Advanced system diagnostics
- `/health/content-type-test` - Content negotiation test

## Integration with app.js

Update your app.js file to use these consolidated modules:

```javascript
// Import routes
const authRoutes = require('../routes/auth'); // Consolidated auth module
const systemRoutes = require('../routes/system/health'); // Consolidated health module

// Mount the routes
app.use('/api/auth', authRoutes);
app.use('/health', systemRoutes);
app.use('/api/health', systemRoutes);
```

## Redundant Files

After integrating the consolidated modules, the following files are redundant and can be removed:
- routes/auth-lite.js
- routes/auth-debug.js 
- routes/auth-simple.js
- routes/health.js
- routes/status.js
- routes/diagnostic.js
- routes/diagnostics.js