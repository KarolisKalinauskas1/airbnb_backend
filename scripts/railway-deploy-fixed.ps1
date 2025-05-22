# Deployment script for Railway
# Run with: pwsh -File .\scripts\railway-deploy-fixed.ps1

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

# Verify critical environment variables
Write-Host "Checking if required environment variables are set in Railway..." -ForegroundColor Cyan
$requiredVars = @(
    "DATABASE_URL",
    "DIRECT_URL",
    "JWT_SECRET",
    "CORS_ORIGIN",
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "NODE_ENV"
)

# Copy the new railway.json file
Copy-Item -Path "./railway.json.new" -Destination "./railway.json" -Force
Write-Host "Updated railway.json file" -ForegroundColor Green

# Deploy to Railway
Write-Host "Deploying to Railway..." -ForegroundColor Cyan
railway up

if ($LASTEXITCODE -eq 0) {
    Write-Host "Deployment started successfully!" -ForegroundColor Green
    Write-Host "Once the deployment is complete, run the validation script:" -ForegroundColor Cyan
    Write-Host "railway run node scripts/railway-validate.js" -ForegroundColor Yellow
} else {
    Write-Host "Deployment failed. Please check the logs and try again." -ForegroundColor Red
}
