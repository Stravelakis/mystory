# Desktop shortcuts for the speech engine. Run by "Install speech engine".
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$desktop = [Environment]::GetFolderPath('Desktop')
$shell = New-Object -ComObject WScript.Shell
$icon = Join-Path (Split-Path -Parent (Split-Path -Parent $here)) 'public\mystory.ico'
foreach ($pair in @(@('My Story speech', 'Start speech engine.bat'), @('Train on my voice', 'Train on my voice.bat'))) {
  $lnk = $shell.CreateShortcut((Join-Path $desktop ($pair[0] + '.lnk')))
  $lnk.TargetPath = Join-Path $here $pair[1]
  $lnk.WorkingDirectory = $here
  if (Test-Path $icon) { $lnk.IconLocation = $icon }
  if ($pair[0] -eq 'My Story speech') { $lnk.WindowStyle = 7 }  # minimised: no flash
  $lnk.Save()
}
