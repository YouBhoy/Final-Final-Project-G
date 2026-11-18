@echo off
title Spartan-G System Launcher
color 0A

echo ============================================
echo    SPARTAN-G SYSTEM LAUNCHER
echo ============================================
echo.

set "PROJECT_DIR=%~dp0spartan-g"

if not exist "%PROJECT_DIR%\apps\web\package.json" (
    echo ERROR: Spartan-G web app was not found at:
    echo        "%PROJECT_DIR%\apps\web"
    echo.
    pause
    exit /b 1
)

cd /d "%PROJECT_DIR%"

set "NODE_EXE="
for /f "delims=" %%F in ('where node.exe 2^>nul') do (
    if not defined NODE_EXE set "NODE_EXE=%%~fF"
)

for /d %%D in ("%LOCALAPPDATA%\OpenAI\Codex\runtimes\cua_node\*") do (
    if exist "%%~fD\bin\node.exe" (
        if not defined NODE_EXE set "NODE_EXE=%%~fD\bin\node.exe"
    )
)

if not defined NODE_EXE (
    echo ERROR: Node.js and npm were not found.
    echo Install Node.js LTS, then reopen this terminal and run start-system.bat again.
    echo.
    pause
    exit /b 1
)

for %%F in ("%NODE_EXE%") do set "NODE_BIN=%%~dpF"
set "PATH=%NODE_BIN%;%PATH%"

if exist "services\login-captcha\.env" (
    echo Starting login CAPTCHA verification service...
    start "Spartan-G CAPTCHA" /min /D "%PROJECT_DIR%" "%NODE_EXE%" --env-file-if-exists=services\login-captcha\.env services\login-captcha\server.mjs
)

echo [1/2] Starting Spartan-G Web Application...
echo.

REM Start the dev server in a new window so it stays running
start "Spartan-G Dev Server" /D "%PROJECT_DIR%" "%NODE_EXE%" node_modules\vite\bin\vite.js --config apps\web\vite.config.ts apps\web

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
