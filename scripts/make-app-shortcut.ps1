# =============================================================================
# MAKE APP SHORTCUT - "My Story" on the Desktop, opening in its own window.
#
#   powershell -ExecutionPolicy Bypass -File scripts\make-app-shortcut.ps1 -Url https://your-box.your-tailnet.ts.net:38726
#
# For when My Story runs on another machine (a home server over Tailscale)
# and this computer only needs a window onto it. Chrome or Edge is opened in
# app mode: no address bar, no tabs, its own taskbar entry, and its own
# browser profile, so it behaves like a separate program and remembers its
# microphone permission apart from your everyday browsing.
#
# Nothing is installed. To undo: delete the shortcut, and optionally the
# profile folder %LOCALAPPDATA%\MyStory\app-window.
#
# (make-shortcut.ps1 is the other one: it starts the app on THIS machine.)
# =============================================================================

param(
  [string]$Url = 'http://localhost:38726',
  [string]$Name = 'My Story'
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot

$candidates = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
)
$browser = $candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $browser) { throw 'Neither Chrome nor Edge was found.' }

$profileDir = Join-Path $env:LOCALAPPDATA 'MyStory\app-window'
New-Item -ItemType Directory -Force $profileDir | Out-Null

$icon = Join-Path $Root 'public\mystory.ico'
$desktop = [Environment]::GetFolderPath('Desktop')
$lnk = Join-Path $desktop "$Name.lnk"

$shell = New-Object -ComObject WScript.Shell
$s = $shell.CreateShortcut($lnk)
$s.TargetPath = $browser
$s.Arguments = "--app=`"$Url`" --user-data-dir=`"$profileDir`" --no-first-run --no-default-browser-check --window-size=1440,960"
$s.WorkingDirectory = Split-Path $browser
if (Test-Path $icon) { $s.IconLocation = "$icon,0" }
$s.Description = 'My Story - a private journal'
$s.Save()

Write-Host "Created: $lnk"
Write-Host "Opens:   $Url  (in $([IO.Path]::GetFileNameWithoutExtension($browser)) app mode)"
