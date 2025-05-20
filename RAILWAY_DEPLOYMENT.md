# Railway Deployment Guide

This document provides instructions for deploying your camping spots application backend to Railway.

## What is Railway?

Railway is a deployment platform that makes it easy to deploy your code with built-in:
- Database hosting (PostgreSQL)
- Environment variable management
- Automatic deployments from GitHub
- Monitoring and logging

## Prerequisites

1. A [Railway account](https://railway.app/)
2. Your camping spots backend code in a GitHub repository
3. A PostgreSQL database (can be provisioned through Railway)

## Deployment Steps

### 1. Set Up Your Railway Project

1. Log in to [Railway](https://railway.app/)
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your backend repository
4. Configure the following settings:
   - Root Directory: `/airbnb_backend` (if needed)
   - Environment: Node.js
   - Build Command: `npm install`
   - Start Command: `npm start`

### 2. Add a Database

1. In your Railway project, click "New"
2. Select "Database" → "PostgreSQL"
3. Wait for the database to provision

### 3. Configure Environment Variables

Go to the "Variables" tab in your project and add these environment variables:

```
NODE_ENV=production
JWT_SECRET=your-secure-jwt-secret
CORS_ORIGIN=https://your-frontend-url.vercel.app
```

Railway will automatically inject the DATABASE_URL variable from your provisioned database.

### 4. Connect to Your Database

Railway automatically sets up the `DATABASE_URL` environment variable. Make sure your Prisma configuration uses this variable:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

### 5. Run Database Migrations

In your Railway project:

1. Go to the "Settings" tab
2. Under "Deploy" section, add `npm run prisma:deploy` to the build command
3. Redeploy your application

### 6. Verify Deployment

After deployment:

1. Go to your deployed URL (e.g., https://your-app.up.railway.app)
2. Test the health endpoint: https://your-app.up.railway.app/health
3. Run the health check script: `node scripts/railway-healthcheck.js https://your-app.up.railway.app`

## Troubleshooting

### Connection Issues

If you're experiencing database connection issues:

1. Check your `DATABASE_URL` format in Railway variables
2. Make sure your `prisma.js` config has proper connection pooling:
   ```javascript
   const prisma = new PrismaClient({
     datasources: {
       db: {
         url: process.env.DATABASE_URL
       }
     },
     __internal: {
       engine: {
         connectionLimit: 5,
         connectionTimeout: 30000
       }
     }
   });
   ```

### Health Check Failing

If the health check is failing:

1. Check your Railway logs in the "Deployments" tab
2. Verify that all environment variables are set correctly
3. Make sure your app is listening on the port provided by Railway: `process.env.PORT || 3000`

## Updating Your Frontend

Update your frontend configuration to point to your Railway backend:

```
VITE_API_URL=https://your-app.up.railway.app
```

## Monitoring

Railway provides:
- Real-time logs in the "Deployments" tab
- Resource usage metrics in the "Metrics" tab
- Deployment history in the "Deployments" tab
