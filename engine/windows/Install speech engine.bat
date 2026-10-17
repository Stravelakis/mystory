@echo off
rem One-time setup of the My Story speech engine on this laptop.
rem Everything goes into the engine\.venv folder. Nothing system-wide.
call "%~dp0common.bat"
title My Story - installing the speech engine

where py >nul 2>nul || (
  echo Python is not installed. Get Python 3.12 from https://www.python.org/downloads/
  echo and tick "Add python.exe to PATH" during setup. Then run this again.
  pause & exit /b 1
)

if not exist "%VENV%\Scripts\python.exe" (
  echo Creating the engine's own Python folder...
  py -3.12 -m venv "%VENV%" || py -3 -m venv "%VENV%" || (echo Could not create it. & pause & exit /b 1)
)

echo Installing the engine (a few minutes)...
"%VENV%\Scripts\python.exe" -m pip install --upgrade pip >nul
"%VENV%\Scripts\python.exe" -m pip install -r "%ENGINE%\requirements.txt" || (echo Install failed. & pause & exit /b 1)

echo Downloading the Greek-capable model (about 3 GB, once)...
"%VENV%\Scripts\python.exe" -c "from faster_whisper import WhisperModel; WhisperModel('large-v3', device='cpu', compute_type='int8')" || (echo Download failed. & pause & exit /b 1)

echo Putting the shortcuts on your Desktop...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0make-shortcuts.ps1"

echo.
echo Done. Double-click "My Story speech" on your Desktop to start it.
echo Its icon appears near the clock: right-click it to pause or quit.
pause
