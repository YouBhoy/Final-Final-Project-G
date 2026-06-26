color 0C

echo ============================================
echo    SPARTAN-G SYSTEM SHUTDOWN
echo ============================================
echo.

echo [1/3] Stopping Node.js / Vite dev server...
taskkill /F /IM node.exe /T 2>nul
if %errorlevel%==0 (
    echo       Node processes terminated.
) else (
    echo       No Node processes found.
)

echo.
echo [2/3] Closing Spartan-G terminal windows...
taskkill /F /FI "WINDOWTITLE eq Spartan-G Dev Server*" /T 2>nul
if %errorlevel%==0 (
    echo       Dev server window closed.
) else (
    echo       No dev server window found.
)

echo.
echo [3/3] Freeing port 5173 (if still in use)...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING') do (
    echo       Killing PID %%P on port 5173...
    taskkill /F /PID %%P /T 2>nul
)

echo.
echo ============================================
echo    SYSTEM HAS BEEN SHUT DOWN
echo ============================================
echo.
pause
