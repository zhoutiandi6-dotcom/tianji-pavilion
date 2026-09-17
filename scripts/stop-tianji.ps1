param([switch]$NoPause)

$ErrorActionPreference = "Continue"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Import-Module (Join-Path $PSScriptRoot "tianji-runtime.psm1") -Force -DisableNameChecking

$dataConfig = Get-TianjiDataConfiguration -Root $root
$mutex = Get-TianjiMutex -Name "launcher" -Scope $dataConfig.DataRoot
if (-not (Enter-TianjiMutex -Mutex $mutex)) {
  Write-Host "A Tianji start or stop operation is already running." -ForegroundColor Yellow
  exit 1
}

try {
  $state = Read-TianjiState -Root $root
  if (-not $state) {
    Write-Host "No Tianji runtime state was found. No process was stopped."
    return
  }

  foreach ($entry in @(@("watchdog", $state.watchdog), @("frontend", $state.frontend), @("backend", $state.backend))) {
    $name, $record = $entry
    if (Stop-TianjiRecordedProcess -Record $record -Label $name -Root $root -DataConfiguration $dataConfig) {
      Write-Host "Stopped Tianji $name process PID $($record.pid)."
    } elseif ($record) {
      Write-Host "Skipped stale or non-owned $name PID $($record.pid)." -ForegroundColor Yellow
    }
  }
  Remove-TianjiState -Root $root
  Write-Host "Tianji runtime state cleared."
} finally {
  Exit-TianjiMutex -Mutex $mutex
}

if (-not $NoPause) { Read-Host "Press Enter to close" | Out-Null }
