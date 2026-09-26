@echo off
setlocal
cd /d "%~dp0..\.."
set "PORT=8767"
set "PREVIEW_URL=http://127.0.0.1:%PORT%/projects/skb-connection/index.html"
set "BUNDLED_PYTHON=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"

echo SKB C-One local preview
echo Open %PREVIEW_URL% after the server starts.
echo Press Ctrl+C to stop the server.
echo.

if exist "%BUNDLED_PYTHON%" goto bundled_python
py -3 --version >nul 2>&1
if not errorlevel 1 goto python_launcher
python --version >nul 2>&1
if not errorlevel 1 goto system_python

echo Python is required to start the local preview server.
pause
exit /b 1

:bundled_python
"%BUNDLED_PYTHON%" -m http.server %PORT% --bind 127.0.0.1
exit /b %ERRORLEVEL%

:python_launcher
py -3 -m http.server %PORT% --bind 127.0.0.1
exit /b %ERRORLEVEL%

:system_python
python -m http.server %PORT% --bind 127.0.0.1
exit /b %ERRORLEVEL%
