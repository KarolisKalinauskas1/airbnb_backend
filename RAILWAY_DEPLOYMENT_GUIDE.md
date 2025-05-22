# Railway Deployment Guide - Updated May 2025

This document provides detailed instructions for deploying your camping spots application backend to Railway and fixing common issues.

## Setup Instructions

### 1. Set Up Required Environment Variables

These are **CRITICAL** for the application to function properly. Make sure all of these are set in your Railway project's Environment Variables section:

```
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}
DIRECT_URL=${DATABASE_URL}
JWT_SECRET=your-strong-jwt-secret-here
CORS_ORIGIN=https://airbnb-frontend-i8p5-git-main-karoliskalinauskas1s-projects.vercel.app,https://*.vercel.app
FRONTEND_URL=https://airbnb-frontend-i8p5-git-main-karoliskalinauskas1s-projects.vercel.app
SUPABASE_URL=https://your-supabase-project.supabase.co
SUPABASE_ANON_KEY=your-actual-supabase-anon-key
NODE_ENV=production
```

### 2. Deploy with Proper Configuration

Make sure your `railway.json` file includes proper health check and build commands:

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm install && npx prisma generate"
  },
  "deploy": {
    "startCommand": "npm start",
    "healthcheckPath": "/api/health",
    "healthcheckTimeout": 100,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

### 3. Run Verification Tools

After deployment, you should run the validation scripts to ensure everything is configured correctly:

```bash
# Connect to your Railway shell and run:
node scripts/railway-validate.js
```

## Common Issues & Fixes

### 1. Database Connection Problems

If you see 500 errors related to database queries:

- Check that DATABASE_URL is correctly configured
- Ensure the IP address of Railway service is in Supabase's allow list 
- Try increasing the connection timeout in the database client configuration

### 2. Authentication Errors

If the `/api/users/me` endpoint returns 500 errors:

- Make sure JWT_SECRET is properly set and consistent
- Verify that Prisma can connect to the database
- Check that the user table migration has been applied
- Ensure Supabase is properly configured

### 3. CORS Errors

If the frontend can't communicate with the backend:

- Verify the CORS_ORIGIN includes your Vercel frontend domain
- Check that the enhanced CORS middleware is working
- Make sure the Vercel configuration is routing API requests to Railway correctly

### 4. Deployment Troubleshooting

If deployment fails or health checks don't pass:

1. Check Railway logs for specific error messages
2. Run the health check script manually: `node scripts/check-health.js`
3. Verify DATABASE_URL is correctly formatted
4. Make sure the healthcheck endpoint `/api/health` returns a 200 response

## Important Notes

- The frontend expects JWT authentication for protected routes
- User authentication is managed by Supabase but user data is stored in your PostgreSQL database
- Changes to schema require running Prisma migrations
- Connection timeout issues might indicate database connection limits or network problems

For further assistance, check Railway and Supabase logs or contact the development team.
