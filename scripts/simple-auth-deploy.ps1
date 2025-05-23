# Simple Auth Fix Deployment Script

Write-Host "Starting deployment of authentication fixes..." -ForegroundColor Cyan

# Navigate to backend directory
$backendPath = "c:\Users\kkaro\OneDrive - Thomas More\SecondYear2nd\Web Programming\airbnb_for_camping\airbnb_backend"
Set-Location $backendPath

# Stage changes
git add src/routes/dashboard.js src/middleware/auth.js src/routes/users.js

# Commit changes
git commit -m "Fix auth_user_id type mismatch issues"

# Deploy to Railway
railway up

Write-Host "Deployment completed!" -ForegroundColor Green
Write-Host "Check /api/users/me endpoint to verify the fix is working" -ForegroundColor Yellow
