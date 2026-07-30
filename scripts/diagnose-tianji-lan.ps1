Import-Module (Join-Path $PSScriptRoot "tianji-runtime.psm1") -Force -DisableNameChecking
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

$selection = Select-TianjiLanAddress
Write-Host "Selected LAN IP: $($selection.Selected.IPAddress) ($($selection.Selected.InterfaceAlias))"
Write-Host "Selection reason: $($selection.Reason)"
Write-Host "Candidates:"
$selection.Candidates | Format-Table IPAddress, InterfaceAlias, HasDefaultRoute, RouteMetric -AutoSize

Get-NetConnectionProfile | Select-Object InterfaceAlias, Name, NetworkCategory, IPv4Connectivity | Format-Table -AutoSize
foreach ($port in 3000, 3001) {
  $occupant = Get-TianjiPortOccupant -Port $port
  if ($occupant) { Write-Host "Port ${port}: $($occupant.LocalAddress) PID $($occupant.Pid) $($occupant.ProcessName) $($occupant.ProcessPath)" }
  else { Write-Host "Port ${port}: not listening" }
}

$rules = @(Get-TianjiFirewallRules)
if ($rules.Count -gt 0) { $rules | Select-Object DisplayName, Enabled, Direction, Action, Profile | Format-Table -AutoSize }
else { Write-Host "No Tianji or Node firewall rule was found. No firewall change was made." -ForegroundColor Yellow }

Write-Host "Diagnostics to run from another LAN computer:"
Write-Host "  Test-NetConnection $($selection.Selected.IPAddress) -Port 3000"
Write-Host "  Test-NetConnection $($selection.Selected.IPAddress) -Port 3001"

$dataConfig = Get-TianjiDataConfiguration -Root $root
$database = Get-Item -LiteralPath $dataConfig.DatabasePath -ErrorAction SilentlyContinue
$uploads = Get-TianjiDirectoryStats -Path $dataConfig.AttachmentsPath
$localBackups = Get-TianjiDirectoryStats -Path $dataConfig.BackupsPath
$volume = Get-TianjiVolumeStatus -Path $dataConfig.DataRoot
Write-Host "Tianji D-drive data: database=$($database.Length) bytes; uploads=$($uploads.Bytes) bytes/$($uploads.FileCount) files; backups=$($localBackups.Bytes) bytes"
Write-Host "Data volume $($volume.Root): free=$([math]::Round($volume.FreeBytes / 1GB, 2)) GB ($($volume.FreePercent)%)"
if ($volume.FreeBytes -lt 20GB -or $volume.FreePercent -lt 10) { Write-Warning "Tianji data volume is low. No files were deleted." }
$backupStatus = Test-TianjiBackupRoot -DataConfiguration $dataConfig
Write-Host "Z-drive backup root: $($backupStatus.Message)"
if ($backupStatus.Available -and $backupStatus.Writable) {
  $cloudBackups = Get-TianjiDirectoryStats -Path $dataConfig.BackupRoot
  $cloudVolume = Get-TianjiVolumeStatus -Path $dataConfig.BackupRoot
  Write-Host "Z-drive backups=$($cloudBackups.Bytes) bytes; free=$([math]::Round($cloudVolume.FreeBytes / 1GB, 2)) GB ($($cloudVolume.FreePercent)%)"
}
