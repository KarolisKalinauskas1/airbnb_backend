# Fix UUID Type Mismatch Deploy Script
# This script deploys the fixed code to handle UUID type mismatches between
# Supabase auth and the Prisma schema

Write-Host "⚙️ Starting deployment of UUID type mismatch fixes..." -ForegroundColor Cyan

# Ensure all changes are committed
git add src/routes/users.js src/middleware/auth.js scripts/fix-auth-user-id.js
git commit -m "Fix UUID type mismatch between Supabase auth and Prisma schema"

# Deploy to Railway (assumes you're already logged in to Railway CLI)
Write-Host "🚀 Deploying to Railway..." -ForegroundColor Yellow
railway up

# Run database fix script after deployment
Write-Host "🔧 Fixing user auth_user_id values in database..." -ForegroundColor Yellow
$env:NODE_ENV = "production"
node scripts/fix-auth-user-id.js

Write-Host "✅ UUID type mismatch fix deployed successfully!" -ForegroundColor Green
Write-Host "The system should now correctly handle UUID strings from Supabase auth."
