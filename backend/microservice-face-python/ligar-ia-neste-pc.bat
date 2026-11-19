@echo off
chcp 65001 >nul
title NZT - Ativador da IA Facial neste PC
echo ==========================================================
echo   NZT Intelligent Control System - Ativador da IA Facial
echo ==========================================================
set "PROJETO_DIR=%~dp0"
if not exist "%PROJETO_DIR%scripts\ligar-ia-facial.ps1" (
  if exist "C:\Users\%USERNAME%\Desktop\Projeto_A2_Eventos\scripts\ligar-ia-facial.ps1" set "PROJETO_DIR=C:\Users\%USERNAME%\Desktop\Projeto_A2_Eventos\"
)
if exist "%PROJETO_DIR%scripts\ligar-ia-facial.ps1" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PROJETO_DIR%scripts\ligar-ia-facial.ps1" -Acao ligar  -VpsUrl "https://painel.nzt.app.br" -AgentName "PC IA Facial do Evento"
) else (
  echo Coloque este arquivo na pasta raiz do Projeto_A2_Eventos e execute novamente.
  pause
)