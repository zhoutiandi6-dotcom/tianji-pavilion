param([switch]$NoBrowser)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Import-Module (Join-Path $PSScriptRoot "tianji-runtime.psm1") -Force -DisableNameChecking
$script:BuildArtifactsChecked = $false

function Wait-TianjiEndpoint {
  param([string]$Url, [int]$TimeoutSeconds)
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-TianjiEndpoint -Url $Url) { return $true }
    Start-Sleep -Seconds 2
  }
  return $false
}

function Assert-TianjiPortAvailable {
  param([int]$Port, $OwnedRecord)
  $occupant = Get-TianjiPortOccupant -Port $Port
  if (-not $occupant) { return }
  if ($OwnedRecord -and (Test-TianjiRecordedProcess -Record $OwnedRecord) -and $occupant.Pid -eq [int]$OwnedRecord.pid) { return }
  throw "Port $Port is occupied by PID $($occupant.Pid) ($($occupant.ProcessName)) at $($occupant.ProcessPath). Tianji will not stop another program; close it or choose another port."
}

function Ensure-TianjiBuildArtifacts {
  if ($script:BuildArtifactsChecked) { return }
  $serverArtifact = Join-Path $root "apps\\server\\dist\\main.js"
  $webArtifact = Join-Path $root "apps\\web\\.next\\standalone\\apps\\web\\server.js"
  if (-not (Test-Path $serverArtifact) -or -not (Test-Path $webArtifact)) {
    Write-Host "Build artifacts are missing. Building Tianji before startup..." -ForegroundColor Yellow
    & cmd.exe /c "npm run build -w @tianji/server && npm run build -w @tianji/web"
    if ($LASTEXITCODE -ne 0) { throw "Tianji build failed. Review the build output before starting." }
  }
  if (-not (Test-Path $serverArtifact) -or -not (Test-Path $webArtifact)) {
    throw "Build completed but required Tianji startup artifacts are missing."
  }
  $script:BuildArtifactsChecked = $true
}

function Start-Or-ReuseTianjiService {
  param(
    [ValidateSet("frontend", "backend")][string]$Service,
    [string]$Url,
    [int]$Port,
    $State
  )
  $record = $State.$Service
  $healthy = Test-TianjiEndpoint -Url $Url
  $owned = Test-TianjiRecordedProcess -Record $record

  if ($healthy -and $owned) {
    Write-Host "Reusing healthy Tianji $Service service (PID $($record.pid))." -ForegroundColor Green
    return
  }
  if ($healthy -and -not $owned) {
    $occupant = Get-TianjiPortOccupant -Port $Port
    throw "Port $Port is healthy but is not recorded as this launcher's Tianji $Service process (PID $($occupant.Pid), $($occupant.ProcessName)). Refusing to take ownership."
  }
  if ($owned) {
    Write-Host "Restarting unhealthy Tianji $Service service (PID $($record.pid))." -ForegroundColor Yellow
    Stop-TianjiRecordedProcess -Record $record -Label $Service | Out-Null
  }

  Assert-TianjiPortAvailable -Port $Port -OwnedRecord $null
  Ensure-TianjiBuildArtifacts
  $State.$Service = Start-TianjiServiceProcess -Service $Service -Root $root
  $timeout = if ($Service -eq "frontend") { 75 } else { 45 }
  if (-not (Wait-TianjiEndpoint -Url $Url -TimeoutSeconds $timeout)) {
    $errorPath = Join-Path (Get-TianjiRuntimeDirectory) "$Service.err.log"
    $errorText = Get-Content -LiteralPath $errorPath -Tail 30 -ErrorAction SilentlyContinue | Out-String
    throw "Tianji $Service failed its health check. Recent error log:`n$errorText"
  }
  Write-Host "Started Tianji $Service service (PID $($State.$Service.pid))." -ForegroundColor Green
}

$mutex = Get-TianjiMutex -Name "launcher"
if (-not (Enter-TianjiMutex -Mutex $mutex)) {
  throw "Another Tianji start or stop operation is already running."
}

try {
  Initialize-TianjiRuntime
  if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "Node.js or npm was not found. Install Node.js LTS first."
  }
  if (-not (Test-Path (Join-Path $root "node_modules"))) {
    throw "Project dependencies are missing. Run npm install in the project directory first."
  }
  $dataConfig = Get-TianjiDataConfiguration -Root $root
  Write-Host "Tianji data root: $($dataConfig.DataRoot)"
  Write-Host "Tianji database: $($dataConfig.DatabasePath)"
  Write-Host "Tianji uploads: $($dataConfig.AttachmentsPath)"
  $servicesAlreadyHealthy = (Test-TianjiEndpoint -Url "http://127.0.0.1:3000/login") -and (Test-TianjiEndpoint -Url "http://127.0.0.1:3001/api/health")
  if (-not $servicesAlreadyHealthy) {
    Write-Host "Checking daily local cold backup before startup..." -ForegroundColor Yellow
    & (Join-Path $PSScriptRoot "backup-tianji.ps1") -Automatic -NoPause
    if (-not $?) { throw "Daily Tianji cold backup failed. Startup was stopped to protect the active data set." }
  } else {
    Write-Host "Tianji is already healthy; daily cold backup is skipped." -ForegroundColor Green
  }
  $backupRootStatus = Test-TianjiBackupRoot -DataConfiguration $dataConfig
  if ($backupRootStatus.Writable) {
    Write-Host $backupRootStatus.Message -ForegroundColor Green
  } else {
    Write-Host "Warning: $($backupRootStatus.Message) Local Tianji services will continue without Z-drive backup sync." -ForegroundColor Yellow
  }
  $dataVolume = Get-TianjiVolumeStatus -Path $dataConfig.DataRoot
  Write-Host "Data volume $($dataVolume.Root): $([math]::Round($dataVolume.FreeBytes / 1GB, 2)) GB free ($($dataVolume.FreePercent)%)."
  if ($dataVolume.FreeBytes -lt 20GB -or $dataVolume.FreePercent -lt 10) { Write-Warning "Tianji data volume is low. No business files were removed." }
  if (-not $servicesAlreadyHealthy -and $backupRootStatus.Writable) {
    $todayPrefix = (Get-Date).ToString("yyyyMMdd") + "-"
    $latestBatch = Get-ChildItem -LiteralPath (Join-Path $dataConfig.BackupsPath "batches") -Directory -ErrorAction SilentlyContinue |
      Where-Object { $_.Name.StartsWith($todayPrefix) } | Sort-Object Name -Descending | Select-Object -First 1
    if ($latestBatch) {
      try {
        & (Join-Path $PSScriptRoot "sync-tianji-backup.ps1") -BackupBatchPath $latestBatch.FullName -NoPause
        if (-not $?) { throw "sync script failed" }
      } catch {
        Write-Warning "Tianji local backup is valid, but Z-drive sync was skipped or failed: $($_.Exception.Message)"
      }
    }
  }
  $network = Select-TianjiLanAddress
  if ($network.Candidates.Count -gt 1) {
    Write-Host "LAN candidates:" -ForegroundColor Yellow
    $network.Candidates | Format-Table IPAddress, InterfaceAlias, HasDefaultRoute, RouteMetric -AutoSize
  }
  Write-Host "LAN selection: $($network.Selected.IPAddress) on $($network.Selected.InterfaceAlias) ($($network.Reason))."

  $state = Read-TianjiState
  if (-not $state -or $state.projectRoot -ne $root) { $state = New-TianjiState -Root $root }
  $state.lanIp = $network.Selected.IPAddress
  $state.frontendPort = 3000
  $state.backendPort = 3001
  $state.logDirectory = Get-TianjiRuntimeDirectory

  # Validate both ports before starting either service. This prevents a partial
  # startup when the other required port belongs to another application.
  Assert-TianjiPortAvailable -Port 3001 -OwnedRecord $state.backend
  Assert-TianjiPortAvailable -Port 3000 -OwnedRecord $state.frontend

  Start-Or-ReuseTianjiService -Service "backend" -Url "http://127.0.0.1:3001/api/health" -Port 3001 -State $state
  Start-Or-ReuseTianjiService -Service "frontend" -Url "http://127.0.0.1:3000/login" -Port 3000 -State $state
  Write-TianjiState -State $state

  if (-not (Test-TianjiRecordedProcess -Record $state.watchdog)) {
    $watchdog = Start-Process -FilePath "powershell.exe" -WindowStyle Hidden -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $root "scripts\\watch-tianji.ps1"), "-Root", $root) -PassThru
    # The watchdog registers its own PID before it starts monitoring. The
    # launcher must not write a stale in-memory state after that registration.
    Write-Host "Watchdog starting (PID $($watchdog.Id))."
  } else {
    Write-Host "Watchdog already running (PID $($state.watchdog.pid))." -ForegroundColor Green
  }

  Write-Host ""
  Write-Host "Tianji startup check passed." -ForegroundColor Green
  Write-Host "Local frontend:  http://127.0.0.1:3000/login"
  Write-Host "Local backend:   http://127.0.0.1:3001/api/health"
  Write-Host "LAN frontend:    http://$($state.lanIp):3000/login"
  Write-Host "LAN backend:     http://$($state.lanIp):3001/api/health"
  Write-Host "Frontend PID: $($state.frontend.pid) | Backend PID: $($state.backend.pid) | Watchdog: $($state.watchdogStatus)"
  foreach ($port in 3000, 3001) {
    $occupant = Get-TianjiPortOccupant -Port $port
    Write-Host "Port $port listener: $($occupant.LocalAddress) (PID $($occupant.Pid))"
  }
  Get-NetConnectionProfile | Select-Object InterfaceAlias, Name, NetworkCategory, IPv4Connectivity | Format-Table -AutoSize
  $firewallRules = @(Get-TianjiFirewallRules)
  if ($firewallRules.Count -gt 0) { $firewallRules | Select-Object DisplayName, Enabled, Direction, Action, Profile | Format-Table -AutoSize }
  else { Write-Host "No Tianji or Node firewall rule was found. No firewall change was made." -ForegroundColor Yellow }
  Write-Host "LAN diagnostics:"
  Write-Host "  Test-NetConnection $($state.lanIp) -Port 3000"
  Write-Host "  Test-NetConnection $($state.lanIp) -Port 3001"
  if (-not $NoBrowser) { Start-Process "http://127.0.0.1:3000/login" }
} finally {
  Exit-TianjiMutex -Mutex $mutex
}
