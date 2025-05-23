#!/bin/bash
# Script to deploy the authentication fix

# Save current changes
echo "Staging changes..."
git add src/app.js

# Commit the changes
echo "Committing authentication fix..."
git commit -m "Fix authentication middleware import in app.js"

# Deploy to Railway
echo "Deploying to Railway..."
railway up

echo "Deployment completed. Please verify the fix resolves both the reviews/stats and checkout session issues."
