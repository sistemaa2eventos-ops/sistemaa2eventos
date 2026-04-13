Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Iniciando Ecossistema A2 Eventos Nexus" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Inicializando Backend Node.js API (Porta 3001)..." -ForegroundColor Yellow
Start-Process pwsh -ArgumentList "-NoExit -Command `"cd backend/api-nodejs; npm run dev`"" -WindowStyle Normal

Write-Host "2. Inicializando Web Admin React (Porta 3000)..." -ForegroundColor Yellow
Start-Process pwsh -ArgumentList "-NoExit -Command `"cd frontend/web-admin; npm run dev`"" -WindowStyle Normal

Write-Host "3. Inicializando Portal Cliente B2C Next.js (Porta 3002)..." -ForegroundColor Yellow
Start-Process pwsh -ArgumentList "-NoExit -Command `"cd frontend/public-web; npm run dev`"" -WindowStyle Normal

Write-Host "4. Inicializando Aplicativo Mobile Expo (Terminal Ativo)..." -ForegroundColor Yellow
Start-Process pwsh -ArgumentList "-NoExit -Command `"cd frontend/mobile-app; `$env:EXPO_PUBLIC_API_URL='http://192.168.1.2:3001/api'; npx expo start`"" -WindowStyle Normal

Write-Host ""
Write-Host "✅ Todos os modulos foram despachados em novas janelas!" -ForegroundColor Green
Write-Host "Os terminais ficarao abertos para que voce possa acompanhar os logs." -ForegroundColor Gray
