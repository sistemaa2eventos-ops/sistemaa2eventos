@echo off
rem Abre a Central de Monitoramento local (video direto do PC do evento, sem passar pela internet).
rem O agente precisa estar rodando (ligar-ia-facial.bat). A chave fica em backend\agent-local\.central-chave.
setlocal
set "CHAVE_ARQ=%~dp0backend\agent-local\.central-chave"
if not exist "%CHAVE_ARQ%" (
    echo.
    echo A chave da Central ainda nao existe. Rode ligar-ia-facial.bat e espere o agente iniciar.
    echo.
    pause
    exit /b 1
)
set /p CHAVE=<"%CHAVE_ARQ%"
start "" "http://localhost:8766/central/entrar?chave=%CHAVE%"
endlocal
