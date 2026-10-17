@echo off
rem Teaches the engine your voice from the reading clips you recorded in
rem My Story (Settings -> Your voice). About an hour on the graphics card.
call "%~dp0common.bat"
title My Story - training on your voice
if not exist "%VENV%\Scripts\python.exe" (
  echo Run "Install speech engine" first.
  pause & exit /b 1
)
set "PY=%VENV%\Scripts\python.exe"

echo [1/5] Getting the training tools (first time only, a few GB)...
"%PY%" -c "import torch, sys; sys.exit(0 if torch.cuda.is_available() else 1)" 2>nul || (
  "%PY%" -m pip install torch --index-url https://download.pytorch.org/whl/cu124 || (echo Failed. & pause & exit /b 1)
)
"%PY%" -m pip install -r "%REPO%\training\requirements.txt" >nul || (echo Failed. & pause & exit /b 1)

echo [2/5] Fetching your reading clips from the mini PC (%MINIPC%)...
if exist "%REPO%\training\voice" rmdir /s /q "%REPO%\training\voice"
scp -r "%MINIPC%:%MINIPC_VAULT%/voice" "%REPO%\training\voice" || (
  echo Could not reach the mini PC with "ssh %MINIPC%". Is it on? Set MINIPC in engine\settings.bat.
  pause & exit /b 1
)

echo [3/5] Pausing the speech engine to free the graphics memory...
powershell -NoProfile -Command "try { Invoke-RestMethod -Method Post http://127.0.0.1:%STT_PORT%/pause | Out-Null } catch {}" >nul 2>nul
for /f "usebackq delims=" %%i in (`tailscale ip -4 2^>nul`) do powershell -NoProfile -Command "try { Invoke-RestMethod -Method Post http://%%i:%STT_PORT%/pause | Out-Null } catch {}" >nul 2>nul

echo [4/5] Preparing and training (about an hour; leave this window open)...
cd /d "%REPO%"
"%PY%" training\prepare.py --voice training\voice --out training\data || (echo Failed. & pause & exit /b 1)
"%PY%" training\train.py --data training\data --out training\out --batch 2 --accum 8 || (echo Training failed. & pause & exit /b 1)

echo [5/5] Resuming the speech engine (it picks up the new voice if it was kept)...
for /f "usebackq delims=" %%i in (`tailscale ip -4 2^>nul`) do powershell -NoProfile -Command "try { Invoke-RestMethod -Method Post http://%%i:%STT_PORT%/resume | Out-Null } catch {}" >nul 2>nul
powershell -NoProfile -Command "try { Invoke-RestMethod -Method Post http://127.0.0.1:%STT_PORT%/resume | Out-Null } catch {}" >nul 2>nul
if exist "%REPO%\training\out\ct2" (
  echo Sending the trained voice to the mini PC too, so it is used when the laptop is off...
  ssh %MINIPC% "mkdir -p %MINIPC_REPO%/training/out" && scp -r "%REPO%\training\out\ct2" "%MINIPC%:%MINIPC_REPO%/training/out/" && ssh %MINIPC% "systemctl --user restart mystory-stt"
)
echo.
echo Finished. The BEFORE / AFTER lines above show how many words it gets wrong.
pause
