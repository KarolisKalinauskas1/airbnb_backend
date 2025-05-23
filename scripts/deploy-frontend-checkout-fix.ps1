# Script to deploy frontend redirects and checkout fixes

Write-Host "Starting deployment of frontend redirects and checkout fixes..." -ForegroundColor Cyan

# Fix 1: Update the app.js file to correctly handle checkout fields
Write-Host "1. Fixing checkout session endpoint in app.js..." -ForegroundColor Yellow
git add src/app.js

# Fix 2: Fix the geocoding cache permissions issue
Write-Host "2. Fixing geocoding cache permissions..." -ForegroundColor Yellow
git add utils/geocoding.js

# Commit the changes
Write-Host "Committing fixes..." -ForegroundColor Yellow
git commit -m "Fix checkout field mapping and geocoding permissions"

# Deploy to Railway
Write-Host "Deploying to Railway..." -ForegroundColor Cyan
railway up

Write-Host "Deployment completed!" -ForegroundColor Green
Write-Host "Testing steps:" -ForegroundColor White
Write-Host "1. Verify camper page loads without redirecting to auth page" -ForegroundColor White
Write-Host "2. Verify checkout session works with proper field mapping" -ForegroundColor White
Write-Host "3. Verify geocoding no longer has permission issues" -ForegroundColor White
