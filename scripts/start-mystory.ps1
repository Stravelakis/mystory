# =============================================================================
# START MY STORY - double-click launcher.
#
# Starts the server if it is not already up, waits until it actually answers,
# then opens the browser. Running it twice does not start a second copy: it
# finds the running one and just opens a tab.
#
# The server window is hidden. Stop it from the tray of your task manager, or
# run  scripts\stop-mystory.ps1
# =============================================================================

$ErrorActionPreference = 'Stop'

# The project is the parent of scripts\, wherever this was copied to.
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

# Read PORT from .env if it is set there, else the app's default.
$Port = 38726
if (Test-Path (Join-Path $Root '.env')) {
  $m = Select-String -Path (Join-Path $Root '.env') -Pattern '^\s*PORT\s*=\s*"?(\d+)"?' -ErrorAction SilentlyContinue
  if ($m) { $Port = [int]$m.Matches[0].Groups[1].Value }
}
$Url = "http://localhost:$Port"
# Health checks go to 127.0.0.1 explicitly: on Windows localhost resolves to
# ::1 first, and a strict client gets a refusal rather than a retry.
$Probe = "http://127.0.0.1:$Port"

function Test-Up {
  try {
    $null = Invoke-WebRequest -Uri "$Probe/api/auth/status" -TimeoutSec 2 -UseBasicParsing
    return $true
  } catch {
    return $false
  }
}

if (Test-Up) {
  Start-Process $Url
  exit 0
}

# Node has to exist before anything else is worth trying.
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show(
    "Node.js is not installed, so My Story cannot start.`n`nInstall the LTS version from https://nodejs.org and try again.",
    'My Story', 'OK', 'Error') | Out-Null
  exit 1
}

# Dependencies, the first time only.
if (-not (Test-Path (Join-Path $Root 'node_modules'))) {
  Start-Process -FilePath 'npm.cmd' -ArgumentList 'install' -WorkingDirectory $Root -Wait -WindowStyle Hidden
}

# Built server if there is one, otherwise the dev server. The built one starts
# faster and does not need Vite.
$Built = Join-Path $Root 'dist\server.cjs'
if (Test-Path $Built) {
  # The path is quoted because this project lives under 'CLAUDE SPACE'.
  # Start-Process splits ArgumentList on spaces, so an unquoted absolute path
  # reached node as two arguments and it exited immediately, silently.
  Start-Process -FilePath 'node.exe' -ArgumentList "`"$Built`"" -WorkingDirectory $Root -WindowStyle Hidden
} else {
  Start-Process -FilePath 'npm.cmd' -ArgumentList @('run', 'dev') -WorkingDirectory $Root -WindowStyle Hidden
}

# Wait for it to actually answer rather than guessing at a sleep. A cold dev
# server with Vite can take a while on the first run.
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Milliseconds 700
  if (Test-Up) {
    Start-Process $Url
    exit 0
  }
}

Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.MessageBox]::Show(
  "My Story did not answer on port $Port within 45 seconds.`n`nOpen a terminal in`n$Root`nand run  npm run dev  to see what it says.",
  'My Story', 'OK', 'Warning') | Out-Null
exit 1
