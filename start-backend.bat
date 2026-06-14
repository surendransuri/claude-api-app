@echo off
cd /d "%~dp0backend"
if not exist ".venv" (
    echo Creating virtual environment...
    python -m venv .venv
)
call .venv\Scripts\activate
echo Installing dependencies...
pip install -r requirements.txt -q
echo.
echo Starting NexChat backend on http://localhost:8000
echo Press Ctrl+C to stop
echo.
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
