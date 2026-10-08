@echo off
rem Drag a .zip onto this file, or run: node tools\import-zip.mjs your.zip
chcp 65001 >nul
setlocal
set "HERE=%~dp0"
set "REPO=%HERE%.."
cd /d "%REPO%"
if "%~1"=="" (
  echo.
  echo   Usage 1: drag a .zip file onto this file
  echo   Usage 2: node tools\import-zip.mjs your-package.zip
  echo.
  pause
  exit /b 1
)
node "tools\import-zip.mjs" %*
echo.
pause
