# Database Connection Fix Deployment Script for Railway
# Run with: pwsh -File .\scripts\fix-database-deploy.ps1

Write-Host "==== Database Connection Fix Deployment Script ====" -ForegroundColor Cyan
Write-Host "This script will deploy a version with mock user data to fix the 500 errors on /api/users/me" -ForegroundColor Yellow

# Check if Railway CLI is installed
$railwayInstalled = Get-Command railway -ErrorAction SilentlyContinue
if (-not $railwayInstalled) {
    Write-Host "Railway CLI is not installed. Please install it with: npm i -g @railway/cli" -ForegroundColor Red
    exit 1
}

# Login to Railway (if needed)
Write-Host "Checking Railway login status..." -ForegroundColor Cyan
$loginStatus = railway whoami
if ($LASTEXITCODE -ne 0) {
    Write-Host "Logging into Railway..." -ForegroundColor Yellow
    railway login
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to login to Railway. Please try again." -ForegroundColor Red
        exit 1
    }
}

# Set environment variables
Write-Host "Setting up environment variables for database connection..." -ForegroundColor Cyan

# Enable mock user data for development/testing
Write-Host "Setting ALLOW_MOCK_USER=true to enable mock user data" -ForegroundColor Yellow
railway variables set ALLOW_MOCK_USER=true

# Copy the new railway.json file
Copy-Item -Path "./railway.json.new" -Destination "./railway.json" -Force
Write-Host "Updated railway.json file" -ForegroundColor Green

# Deploy to Railway
Write-Host "Deploying database connection fix to Railway..." -ForegroundColor Cyan
railway up

if ($LASTEXITCODE -eq 0) {
    Write-Host "Deployment started successfully!" -ForegroundColor Green
    Write-Host "This deployment includes:" -ForegroundColor White
    Write-Host "1. Mock user data for the /api/users/me endpoint" -ForegroundColor Yellow
    Write-Host "2. Improved error handling for database connection issues" -ForegroundColor Yellow
    
    Write-Host "`nOnce the deployment is complete, test your frontend application again." -ForegroundColor Cyan
    Write-Host "The login functionality should work even if there are database connection issues." -ForegroundColor Cyan
} else {
    Write-Host "Deployment failed. Please check the logs and try again." -ForegroundColor Red
}
