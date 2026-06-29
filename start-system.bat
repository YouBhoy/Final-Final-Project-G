@echo off
title Spartan-G System Launcher
color 0A

echo ============================================
echo    SPARTAN-G SYSTEM LAUNCHER
echo ============================================
echo.

cd /d "%~dp0spartan-g"

echo [1/2] Starting Spartan-G Web Application...
echo.

REM Start the dev server in a new window so it stays running
start "Spartan-G Dev Server" cmd /k "cd /d apps\web && ..\..\node_modules\.bin\vite.cmd"

echo [2/2] Waiting for server to initialize...
timeout /t 8 /nobreak >nul

echo.
echo Opening browser...
start "" "http://localhost:5173"

echo.
echo ============================================
echo    SYSTEM IS NOW RUNNING
echo ============================================
echo    Web App: http://localhost:5173
echo    Close the "Spartan-G Dev Server" window
echo    or run stop-system.bat to shut down.
echo ============================================
echo.
pause
