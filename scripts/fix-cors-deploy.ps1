# CORS Fix Deployment Script for Railway
# Run with: pwsh -File .\scripts\fix-cors-deploy.ps1

Write-Host "==== CORS Fix Deployment Script ====" -ForegroundColor Cyan
Write-Host "This script will deploy a version with simplified CORS settings to fix the 403 errors" -ForegroundColor Yellow

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

# Verify and set environment variables
Write-Host "Setting up CORS environment variables..." -ForegroundColor Cyan

# Set the CORS_ORIGIN to allow all origins temporarily
Write-Host "Setting CORS_ORIGIN to allow all domains (*)" -ForegroundColor Yellow
railway variables set CORS_ORIGIN="*"

# Copy the new railway.json file
Copy-Item -Path "./railway.json.new" -Destination "./railway.json" -Force
Write-Host "Updated railway.json file" -ForegroundColor Green

# Deploy to Railway
Write-Host "Deploying CORS fix to Railway..." -ForegroundColor Cyan
railway up

if ($LASTEXITCODE -eq 0) {
    Write-Host "Deployment started successfully!" -ForegroundColor Green
    Write-Host "This deployment includes:"
    Write-Host "1. Simplified CORS middleware that allows all origins" -ForegroundColor Yellow
    Write-Host "2. Relaxed security settings for debugging" -ForegroundColor Yellow
    Write-Host "3. Basic health checks that don't rely on database connections" -ForegroundColor Yellow
    
    Write-Host "`nOnce the deployment is complete, test your frontend application again." -ForegroundColor Cyan
    Write-Host "The CORS errors should be resolved." -ForegroundColor Cyan
} else {
    Write-Host "Deployment failed. Please check the logs and try again." -ForegroundColor Red
}
