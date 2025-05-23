# Auth and Dashboard Fixes Deployment Script
# This script deploys all the fixes for auth_user_id and dashboard routes

Write-Host "Starting deployment of Authentication and Dashboard fixes..." -ForegroundColor Cyan

# Navigate to backend directory
$backendPath = "c:\Users\kkaro\OneDrive - Thomas More\SecondYear2nd\Web Programming\airbnb_for_camping\airbnb_backend"
Set-Location $backendPath

# Stage changes
Write-Host "Staging changes..." -ForegroundColor Yellow
git add src/routes/dashboard.js src/middleware/auth.js src/routes/users.js routes/reviews.js

# Commit changes
Write-Host "Committing changes..." -ForegroundColor Yellow
git commit -m "Fix auth_user_id/user_id type mismatch and dashboard route issues"

# Deploy to Railway
Write-Host "Deploying to Railway..." -ForegroundColor Yellow
railway up

Write-Host "Deployment completed! All authentication and dashboard fixes should now be live." -ForegroundColor Green

# Quick healthcheck after deployment
Write-Host "Performing health check..." -ForegroundColor Yellow
$healthEndpoint = "https://airbnbbackend-production-5ffb.up.railway.app/health"
try {
    $response = Invoke-RestMethod -Uri $healthEndpoint -Method Get -ErrorAction Stop
    Write-Host "Health check successful!" -ForegroundColor Green
} catch {
    Write-Host "Health check failed: $_" -ForegroundColor Red
}

Write-Host "Post-Deployment Verification Steps:" -ForegroundColor Cyan
Write-Host "1. Test login functionality to verify user authentication works" -ForegroundColor White
Write-Host "2. Check /api/users/me endpoint returns user data without errors" -ForegroundColor White
Write-Host "3. Verify reviews/stats endpoint is now accessible" -ForegroundColor White
Write-Host "4. Check dashboard endpoints for proper data" -ForegroundColor White

Write-Host "Troubleshooting:" -ForegroundColor Cyan
Write-Host "- If issues persist, use the /api/users/debug-token endpoint in development environment" -ForegroundColor White
Write-Host "- Run 'node scripts/fix-auth-user-id.js' to ensure all users have correct auth_user_id values" -ForegroundColor White
Write-Host "- Check logs with 'railway logs'" -ForegroundColor White
