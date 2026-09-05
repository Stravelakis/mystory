# =============================================================================
# MAKE SHORTCUT - puts "My Story" on the Desktop.
#
#   powershell -ExecutionPolicy Bypass -File scripts\make-shortcut.ps1
#
# The shortcut runs scripts\start-mystory.ps1 with ExecutionPolicy Bypass, so
# it works on a default Windows install where scripts are otherwise blocked.
# Nothing is installed and nothing is written outside the Desktop and this
# folder - delete the .lnk and it is gone.
# =============================================================================

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot

# --- The icon -----------------------------------------------------------------
# Windows shortcuts want a .ico. Vista and later accept PNG data inside an ICO
# container, so the existing 192px app icon is wrapped rather than redrawn -
# one mark, not two that drift apart.
$IcoPath = Join-Path $Root 'public\mystory.ico'
$PngPath = Join-Path $Root 'public\icon-192.png'

if (-not (Test-Path $IcoPath)) {
  if (-not (Test-Path $PngPath)) { throw "Missing $PngPath - run: npm run icons" }
  $png = [System.IO.File]::ReadAllBytes($PngPath)

  $ms = New-Object System.IO.MemoryStream
  $bw = New-Object System.IO.BinaryWriter($ms)
  # ICONDIR
  $bw.Write([UInt16]0)    # reserved
  $bw.Write([UInt16]1)    # type: icon
  $bw.Write([UInt16]1)    # one image
  # ICONDIRENTRY
  $bw.Write([Byte]0)      # width  0 = 256 or "read from the image"
  $bw.Write([Byte]0)      # height
  $bw.Write([Byte]0)      # palette
  $bw.Write([Byte]0)      # reserved
  $bw.Write([UInt16]1)    # colour planes
  $bw.Write([UInt16]32)   # bits per pixel
  $bw.Write([UInt32]$png.Length)
  $bw.Write([UInt32]22)   # offset: 6 byte header + 16 byte entry
  $bw.Write($png)
  $bw.Flush()
  [System.IO.File]::WriteAllBytes($IcoPath, $ms.ToArray())
  $bw.Dispose(); $ms.Dispose()
  Write-Host "Wrote $IcoPath"
}

# --- The shortcut -------------------------------------------------------------
$Desktop = [Environment]::GetFolderPath('Desktop')
$Link = Join-Path $Desktop 'My Story.lnk'
$Launcher = Join-Path $Root 'scripts\start-mystory.ps1'

$shell = New-Object -ComObject WScript.Shell
$sc = $shell.CreateShortcut($Link)
$sc.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$sc.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Launcher`""
$sc.WorkingDirectory = $Root
$sc.IconLocation = "$IcoPath,0"
$sc.Description = 'Open My Story - your private journal, on this machine'
$sc.WindowStyle = 7   # start minimised; the launcher hides the server anyway
$sc.Save()

Write-Host "Shortcut created: $Link"
Write-Host 'Double-click it. It starts the app if needed, then opens your browser.'
