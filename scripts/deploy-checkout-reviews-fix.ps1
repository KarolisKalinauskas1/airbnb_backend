# Script to deploy the checkout and review stats fixes

# Save current changes
Write-Host "Staging changes..." -ForegroundColor Cyan
git add src/app.js src/routes/reviews.js

# Commit the changes
Write-Host "Committing fixes..." -ForegroundColor Cyan
git commit -m "Fix checkout field mapping and review stats endpoint authentication"

# Deploy to Railway
Write-Host "Deploying to Railway..." -ForegroundColor Cyan
railway up

Write-Host "Deployment completed. Please verify the fixes resolve both the reviews/stats and checkout session issues." -ForegroundColor Green
