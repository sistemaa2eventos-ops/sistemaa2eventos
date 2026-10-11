@echo off
:: NZT Intelligent Control System - liga a IA de rastreamento facial do servidor local.
:: Duplo clique para ligar. Para desligar: ligar-ia-facial.bat parar
chcp 65001 >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\ligar-ia-facial.ps1" %*
if errorlevel 1 pause
