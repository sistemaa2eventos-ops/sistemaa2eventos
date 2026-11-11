@echo off
:: NZT - liga o SERVIDOR DE IA CENTRAL (PC com placa de vídeo, fora da rede do evento).
:: Duplo clique para ligar. Para desligar: ligar-servidor-ia.bat parar
chcp 65001 >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\ligar-servidor-ia.ps1" %*
if errorlevel 1 pause
