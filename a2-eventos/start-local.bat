@echo off
setlocal
echo ========================================================
echo        INICIANDO AMBIENTE LOCAL - A2 EVENTOS
echo ========================================================

:: 1. Subir Infraestrutura (Banco e Redis)
echo [1/4] Levantando Banco de Dados e Redis (Docker)...
docker compose -f docker-compose.local.yml up -d
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao iniciar containers. Verifique se o Docker Desktop está rodando.
    pause
    exit /b %errorlevel%
)

:: 2. Backend API
echo [2/4] Abrindo terminal do Backend (API - Porta 3001)...
start "A2-BACKEND" cmd /k "cd backend\api-nodejs && echo Instalando dependencias... && npm install && echo Iniciando Servidor... && npm run dev"

:: 3. Admin Web
echo [3/4] Abrindo terminal do Admin (Vite - Porta 5173)...
start "A2-ADMIN" cmd /k "cd frontend\web-admin && echo Instalando dependencias... && npm install && echo Iniciando Admin... && npm run dev"

:: 4. Portal Publico
echo [4/4] Abrindo terminal do Portal Publico (Next.js - Porta 3002)...
start "A2-PORTAL" cmd /k "cd frontend\public-web && echo Instalando dependencias... && npm install && echo Iniciando Portal... && npm run dev -- -p 3002"

echo ========================================================
echo  SISTEMA SENDO INICIADO EM 3 JANELAS SEPARADAS.
echo ========================================================
echo.
echo  API BACKEND: http://localhost:3001
echo  ADMIN WEB:   http://localhost:5173
echo  PORTAL WEB:  http://localhost:3002
echo.
echo  Pressione qualquer tecla para sair desta janela principal.
echo ========================================================
pause
