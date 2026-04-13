@echo off
echo ==========================================
echo      INICIANDO SISTEMA A2 EVENTOS
echo ==========================================

echo [1/4] Verificando Docker...
docker-compose up -d

echo [2/4] Iniciando Backend API (Nova Janela)...
start "A2 Backend API" /d "backend\api-nodejs" cmd /k "npm run dev & pause"

echo [3/4] Iniciando Portal Web Publico (Nova Janela)...
echo.
echo =======================================================
echo   O Dashboard estara disponivel em: http://localhost:3000
echo =======================================================
echo.
start "A2 Public Web" /d "frontend\public-web" cmd /k "npm run dev & pause"

echo [4/4] Iniciando Mobile App (Expo)...
cd frontend\mobile-app
cmd /k "npx expo start"
