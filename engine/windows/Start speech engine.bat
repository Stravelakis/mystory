@echo off
rem Starts the engine with its taskbar icon, and no window.
call "%~dp0common.bat"
if not exist "%VENV%\Scripts\pythonw.exe" (
  echo The speech engine is not installed yet. Run "Install speech engine" first.
  pause & exit /b 1
)
rem Listen on the Tailscale address, so the mini PC can reach it and nobody else.
set STT_HOST=127.0.0.1
for /f "usebackq delims=" %%i in (`tailscale ip -4 2^>nul`) do set "STT_HOST=%%i"
start "" "%VENV%\Scripts\pythonw.exe" "%ENGINE%\stt_engine.py" --tray --host %STT_HOST% --port %STT_PORT%
