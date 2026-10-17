@rem Shared by the other .bat files. Not meant to be double-clicked.
set "ENGINE=%~dp0.."
for %%I in ("%ENGINE%") do set "ENGINE=%%~fI"
for %%I in ("%ENGINE%\..") do set "REPO=%%~fI"
set "VENV=%ENGINE%\.venv"
set MINIPC=minipc
set MINIPC_VAULT=~/.local/share/mystory/vault
set MINIPC_REPO=~/apps/mystory
set STT_PORT=40666
if exist "%ENGINE%\settings.bat" call "%ENGINE%\settings.bat"
