@echo off
setlocal
cd /d "%~dp0"
title Novelmaker

rem Meldungen: vor dem Server in der Systemsprache (scripts\say.mjs), danach in der Sprache der Oberflaeche (Server).
where node >nul 2>nul
if errorlevel 1 goto nonode

if not exist node_modules (
  node scripts\say.mjs install
  call npm install
  if errorlevel 1 goto failed
)

node scripts\ensure-build.mjs
if errorlevel 1 goto failed

set NOVELMAKER_OPEN=1
rem node direkt starten (ohne npm), damit das Schliessen des Fensters beim Server ankommt und gesichert werden kann.
rem Adresse und Hinweise zum Beenden gibt der Server selbst aus.
node --import tsx server\src\index.ts
if errorlevel 1 goto failed
exit /b 0

:failed
echo.
node scripts\say.mjs failed
pause
exit /b 1

:nonode
rem Ohne Node gibt es scripts\say.mjs nicht: Sprache aus der Windows-Region, Text als UTF-8 (darum chcp 65001).
for /f "tokens=2 delims=:." %%C in ('chcp') do set "OLDCP=%%C"
chcp 65001 >nul
set "LANGCODE=en"
for /f "tokens=3" %%L in ('reg query "HKCU\Control Panel\International" /v LocaleName 2^>nul ^| find "REG_SZ"') do set "LANGCODE=%%L"
set "LANGCODE=%LANGCODE:~0,2%"
set "MSG=Node.js was not found. Please install Node.js 22 or newer from https://nodejs.org and start Novelmaker again."
if /i "%LANGCODE%"=="de" set "MSG=Node.js wurde nicht gefunden. Bitte Node.js 22 oder neuer von https://nodejs.org installieren und Novelmaker dann erneut starten."
if /i "%LANGCODE%"=="es" set "MSG=No se ha encontrado Node.js. Instala Node.js 22 o posterior desde https://nodejs.org y vuelve a iniciar Novelmaker."
if /i "%LANGCODE%"=="uk" set "MSG=Node.js не знайдено. Установіть Node.js 22 або новішу версію з https://nodejs.org і знову запустіть Novelmaker."
if /i "%LANGCODE%"=="it" set "MSG=Node.js non è stato trovato. Installa Node.js 22 o una versione successiva da https://nodejs.org e poi avvia di nuovo Novelmaker."
if /i "%LANGCODE%"=="fr" set "MSG=Node.js est introuvable. Installez Node.js 22 ou une version plus récente depuis https://nodejs.org, puis relancez Novelmaker."
echo %MSG%
pause
if defined OLDCP chcp %OLDCP% >nul
exit /b 1
