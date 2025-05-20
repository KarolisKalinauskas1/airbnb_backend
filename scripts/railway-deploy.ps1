# Railway deployment PowerShell script

Write-Host "Building Docker image locally..." -ForegroundColor Cyan
docker build -t camping-backend .

Write-Host "Testing local Docker image..." -ForegroundColor Cyan
docker run --rm -p 3000:3000 --env-file .env.production camping-backend

Write-Host "To deploy to Railway, run:" -ForegroundColor Green
Write-Host "railway up" -ForegroundColor Yellow

Write-Host "`nAfter deployment, check your services at: https://railway.app/dashboard" -ForegroundColor Green
Write-Host "`nTo test your deployed API, run:" -ForegroundColor Green
Write-Host "node scripts/railway-healthcheck.js https://your-railway-domain.up.railway.app" -ForegroundColor Yellow
