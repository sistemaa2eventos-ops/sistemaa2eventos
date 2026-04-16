# Rebuild frontend container to fix PermissoesAcesso error
# This clears Docker cache and rebuilds the frontend image

Write-Host "🔄 Rebuilding frontend container (clearing cache)..." -ForegroundColor Cyan

# Navigate to project root
$projectRoot = Split-Path -Parent $PSScriptRoot

# Stop the admin-web container
Write-Host "⏹️  Stopping admin-web container..." -ForegroundColor Yellow
docker-compose -f "$projectRoot\docker-compose.yml" stop admin-web

# Rebuild with no cache
Write-Host "🏗️  Building frontend image (no cache)..." -ForegroundColor Cyan
docker-compose -f "$projectRoot\docker-compose.yml" build --no-cache admin-web

# Start the container
Write-Host "▶️  Starting admin-web container..." -ForegroundColor Green
docker-compose -f "$projectRoot\docker-compose.yml" up -d admin-web

# Wait for it to be ready
Write-Host "⏳ Waiting for container to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Check health
Write-Host "🔍 Checking container health..." -ForegroundColor Cyan
docker-compose -f "$projectRoot\docker-compose.yml" ps admin-web

Write-Host ""
Write-Host "✅ Frontend rebuild complete!" -ForegroundColor Green
Write-Host "🌐 Access at: https://painel.nzt.app.br" -ForegroundColor Cyan
Write-Host ""
Write-Host "Note: Clear your browser cache (Ctrl+Shift+Del) if you still see old content" -ForegroundColor Yellow
