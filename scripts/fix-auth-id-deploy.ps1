# Fix Auth User ID Type Mismatch Deploy Script
# This script deploys the fixes for the auth_user_id/user_id confusion in the app

Write-Host "⚙️ Starting deployment of auth_user_id type fix..." -ForegroundColor Cyan

# Stage changes
git add src/routes/users.js src/middleware/auth.js scripts/jwt-debug.js

# Commit changes
git commit -m "Fix auth_user_id type mismatch and JWT token handling"

# Deploy to Railway
Write-Host "🚀 Deploying to Railway..." -ForegroundColor Yellow
railway up

Write-Host "✅ Deployment completed! The fixes for the auth_user_id type mismatch should now be live." -ForegroundColor Green

# Optional: Quick healthcheck after deployment
Write-Host "🔍 Performing quick health check..." -ForegroundColor Yellow
$healthEndpoint = "https://airbnbbackend-production-5ffb.up.railway.app/health"
try {
    $response = Invoke-RestMethod -Uri $healthEndpoint -Method Get -ErrorAction Stop
    Write-Host "Health check successful: $($response | ConvertTo-Json)" -ForegroundColor Green
} catch {
    Write-Host "Health check failed: $_" -ForegroundColor Red
}

Write-Host "📝 Notes for verification:" -ForegroundColor Cyan
Write-Host "1. Test login functionality to verify the /api/users/me endpoint works" -ForegroundColor White
Write-Host "2. Check reviews/stats endpoints to ensure authorization works correctly" -ForegroundColor White
Write-Host "3. Use the /api/users/debug-token endpoint in development to diagnose any remaining issues" -ForegroundColor White
