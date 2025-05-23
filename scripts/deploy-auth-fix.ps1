# Script to deploy the authentication fix

# Save current changes
Write-Host "Staging changes..." -ForegroundColor Cyan
git add src/app.js

# Commit the changes
Write-Host "Committing authentication fix..." -ForegroundColor Cyan
git commit -m "Fix authentication middleware import in app.js"

# Deploy to Railway
Write-Host "Deploying to Railway..." -ForegroundColor Cyan
railway up

Write-Host "Deployment completed. Please verify the fix resolves both the reviews/stats and checkout session issues." -ForegroundColor Green
