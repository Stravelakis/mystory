# =============================================================================
# STOP MY STORY - kills whatever is listening on the app's port.
#
# The launcher hides the server window, so there is nothing to close by hand.
# This finds it by port rather than by process name, so it cannot take out an
# unrelated node.exe.
# =============================================================================

$ErrorActionPreference = 'SilentlyContinue'

$Root = Split-Path -Parent $PSScriptRoot
$Port = 38726
if (Test-Path (Join-Path $Root '.env')) {
  $m = Select-String -Path (Join-Path $Root '.env') -Pattern '^\s*PORT\s*=\s*"?(\d+)"?'
  if ($m) { $Port = [int]$m.Matches[0].Groups[1].Value }
}

$conns = Get-NetTCPConnection -LocalPort $Port -State Listen
if (-not $conns) {
  Write-Host "Nothing is listening on port $Port."
  exit 0
}

# $pid is a read-only automatic variable in PowerShell; naming a loop
# variable that fails at runtime rather than at parse time.
foreach ($procId in ($conns.OwningProcess | Sort-Object -Unique)) {
  $p = Get-Process -Id $procId
  Write-Host "Stopping $($p.ProcessName) (pid $procId) on port $Port"
  Stop-Process -Id $procId -Force
}
Write-Host 'Stopped. Your vault is untouched.'
