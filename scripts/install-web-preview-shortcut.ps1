$ErrorActionPreference = "Stop"

if ($env:OS -ne "Windows_NT") {
  throw "The desktop shortcut installer is only supported on Windows."
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$desktopDirectory = [Environment]::GetFolderPath([Environment+SpecialFolder]::DesktopDirectory)
$shortcutPath = Join-Path $desktopDirectory "Cycling Analytics Preview.lnk"
$powerShellPath = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
$escapedProjectRoot = $projectRoot.Replace("'", "''")

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $powerShellPath
$shortcut.Arguments = "-NoLogo -ExecutionPolicy Bypass -Command `"Set-Location -LiteralPath '$escapedProjectRoot'; npm.cmd run preview:web`""
$shortcut.WorkingDirectory = $projectRoot
$shortcut.Description = "Start the hot-reloading Cycling Analytics browser preview"

$iconCandidates = @(
  (Join-Path $projectRoot "dist-installers\.icon-ico\icon.ico"),
  (Join-Path $projectRoot "dist-installers\win-unpacked\Cycling Analytics.exe")
)
$icon = $iconCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if ($icon) {
  $shortcut.IconLocation = "$icon,0"
}

$shortcut.Save()
Write-Output "Created $shortcutPath"
Write-Output "Double-click it to open the persistent browser preview."
