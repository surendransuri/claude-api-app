@echo off
cd /d "%~dp0frontend"
if not exist "node_modules" (
    echo Installing npm packages...
    npm install
)
echo.
echo Starting NexChat frontend on http://localhost:3000
echo Press Ctrl+C to stop
echo.
npm run dev
