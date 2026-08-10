<#
  One-time setup: creates
    1. a shortcut in the Windows Startup folder that brings the permanent
       STRIDE ERP instance online silently every time this user logs in
    2. a "STRIDE ERP" desktop shortcut that ensures it's running and opens
       it in the default browser

  Safe to re-run - it just overwrites the two .lnk files.
#>

$ScriptDir = $PSScriptRoot
$StartScript = Join-Path $ScriptDir "start-erp.ps1"

$StartupFolder = [Environment]::GetFolderPath("Startup")
$DesktopFolder = [Environment]::GetFolderPath("Desktop")

$shell = New-Object -ComObject WScript.Shell

# 1. Startup-folder shortcut - silent, runs at every logon.
$autostartLnk = Join-Path $StartupFolder "STRIDE ERP Autostart.lnk"
$s1 = $shell.CreateShortcut($autostartLnk)
$s1.TargetPath = "powershell.exe"
$s1.Arguments = "-WindowStyle Hidden -ExecutionPolicy Bypass -File `"$StartScript`""
$s1.WorkingDirectory = $ScriptDir
$s1.WindowStyle = 7  # minimized
$s1.IconLocation = "shell32.dll,13"
$s1.Description = "Brings the STRIDE ERP database/backend/frontend online in the background"
$s1.Save()

# 2. Desktop shortcut - click to ensure it's running and open it.
$desktopLnk = Join-Path $DesktopFolder "STRIDE ERP.lnk"
$s2 = $shell.CreateShortcut($desktopLnk)
$s2.TargetPath = "powershell.exe"
$s2.Arguments = "-WindowStyle Hidden -ExecutionPolicy Bypass -File `"$StartScript`" -OpenBrowser"
$s2.WorkingDirectory = $ScriptDir
$s2.WindowStyle = 7  # minimized
$s2.IconLocation = "shell32.dll,13"
$s2.Description = "Open STRIDE ERP"
$s2.Save()

Write-Host "Created: $autostartLnk"
Write-Host "Created: $desktopLnk"
