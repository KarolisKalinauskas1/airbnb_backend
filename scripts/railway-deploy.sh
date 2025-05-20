#!/bin/bash
# This script helps deploy the backend to Railway using Docker

# Build the Docker image locally first to test
echo "Building Docker image locally..."
docker build -t camping-backend .

# Test the local image
echo "Testing local Docker image..."
docker run --rm -p 3000:3000 --env-file .env.production camping-backend

# If all looks good, deploy to Railway
echo "To deploy to Railway, run:"
echo "railway up"

# Instructions for checking the deployment
echo ""
echo "After deployment, check your services at: https://railway.app/dashboard"
echo ""
echo "To test your deployed API, run:"
echo "node scripts/railway-healthcheck.js https://your-railway-domain.up.railway.app"
echo ""
