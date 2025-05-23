#!/usr/bin/env pwsh
# Comprehensive Fix Script - Auth, Reviews, and Checkout
# This script deploys all fixes for:
# 1. Auth user ID type mismatch 
# 2. Review stats endpoint
# 3. Checkout session validation and field mapping
# 4. Authentication middleware import

Write-Host "Starting comprehensive fix deployment..." -ForegroundColor Cyan

# Navigate to backend directory
$backendPath = "c:\Users\kkaro\OneDrive - Thomas More\SecondYear2nd\Web Programming\airbnb_for_camping\airbnb_backend"
Set-Location $backendPath

# Stage all changed files
Write-Host "Staging changes..." -ForegroundColor Yellow
git add src/routes/reviews.js src/middleware/auth.js src/routes/users.js src/app.js

# Commit changes
Write-Host "Committing changes..." -ForegroundColor Yellow
git commit -m "Fix auth ID type mismatch, review stats endpoint auth, checkout field mapping, and auth middleware import"

# Deploy to Railway
Write-Host "Deploying to Railway..." -ForegroundColor Yellow
railway up

# Verify deployment
Write-Host "Verifying deployment..." -ForegroundColor Green
$healthEndpoint = "https://airbnbbackend-production-5ffb.up.railway.app/health"
try {
    $response = Invoke-RestMethod -Uri $healthEndpoint -Method Get -ErrorAction Stop
    Write-Host "✅ Health check successful!" -ForegroundColor Green
} catch {
    Write-Host "❌ Health check failed: $_" -ForegroundColor Red
}

Write-Host "Testing review stats endpoint:" -ForegroundColor Yellow
$reviewStatsEndpoint = "https://airbnbbackend-production-5ffb.up.railway.app/api/reviews/stats/28"
try {
    $response = Invoke-RestMethod -Uri $reviewStatsEndpoint -Method Get -ErrorAction Stop
    Write-Host "✅ Review stats endpoint working correctly!" -ForegroundColor Green
} catch {
    Write-Host "❌ Review stats endpoint failed: $_" -ForegroundColor Red
}

Write-Host "Deployment completed!" -ForegroundColor Green
Write-Host "Please verify the following endpoints manually:" -ForegroundColor Yellow
Write-Host "1. /api/users/me - Should return user data without 500 errors" -ForegroundColor White
Write-Host "2. /api/reviews/stats/:id - Should return review stats without 401 errors" -ForegroundColor White
Write-Host "3. /api/checkout/create-session - Should now properly map field names and validate checkout data" -ForegroundColor White
