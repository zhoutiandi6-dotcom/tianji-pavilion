param(
  [Parameter(Mandatory = $true)][string]$Root
)

$ErrorActionPreference = "Continue"
Import-Module (Join-Path $PSScriptRoot "tianji-runtime.psm1") -Force -DisableNameChecking

$failureThreshold = 2
$maxRestarts = 3
$restartWindow = [TimeSpan]::FromMinutes(10)
$failureCounts = @{ frontend = 0; backend = 0 }
$restartHistory = @{ frontend = @(); backend = @() }
$mutex = Get-TianjiMutex -Name "watchdog"

function Get-WatchdogServiceUrl([string]$Service) {
  if ($Service -eq "frontend") { return "http://127.0.0.1:3000/login" }
  return "http://127.0.0.1:3001/api/health"
}

function Restart-WatchedService {
  param([string]$Service, $State)
  $now = Get-Date
  $restartHistory[$Service] = @($restartHistory[$Service] | Where-Object { $now - $_ -lt $restartWindow })
  if ($restartHistory[$Service].Count -ge $maxRestarts) {
    $State.watchdogStatus = "paused: $Service restart limit reached"
    Write-TianjiState -State $State -Root $Root
    Write-TianjiWatchdogLog "service=$Service action=paused reason=restart-limit count=$($restartHistory[$Service].Count)"
    return $false
  }

  $record = $State.$Service
  $oldPid = if ($record) { $record.pid } else { "none" }
  if (Test-TianjiRecordedProcess -Record $record) {
    Stop-TianjiRecordedProcess -Record $record -Label $Service -Root $Root | Out-Null
  }

  $port = if ($Service -eq "frontend") { 3000 } else { 3001 }
  $deadline = (Get-Date).AddSeconds(10)
  while ((Get-Date) -lt $deadline -and (Get-TianjiPortOccupant -Port $port)) { Start-Sleep -Milliseconds 250 }
  $occupant = Get-TianjiPortOccupant -Port $port
  if ($occupant) {
    Write-TianjiWatchdogLog "service=$Service action=skip-restart reason=port-occupied pid=$($occupant.Pid) name=$($occupant.ProcessName)"
    return $true
  }

  try {
    $State.$Service = Start-TianjiServiceProcess -Service $Service -Root $Root
    $restartHistory[$Service] += $now
    $State.watchdogStatus = "running"
    Write-TianjiState -State $State -Root $Root
    Write-TianjiWatchdogLog "service=$Service action=restarted reason=health-failure oldPid=$oldPid newPid=$($State.$Service.pid) restartCount=$($restartHistory[$Service].Count)"
    return $true
  } catch {
    Write-TianjiWatchdogLog "service=$Service action=restart-failed oldPid=$oldPid error=$($_.Exception.Message)"
    return $true
  }
}

if (-not (Enter-TianjiMutex -Mutex $mutex)) {
  Write-TianjiWatchdogLog "action=exit reason=already-running"
  exit 0
}

try {
  Initialize-TianjiRuntime
  $initialState = Read-TianjiState -Root $Root
  if (-not $initialState -or $initialState.projectRoot -ne $Root) {
    Write-TianjiWatchdogLog "action=exit reason=runtime-state-missing-or-root-changed"
    exit 0
  }
  $watchdogSnapshot = Get-TianjiProcessSnapshot -Pid $PID
  if (-not $watchdogSnapshot) {
    Write-TianjiWatchdogLog "action=exit reason=watchdog-process-not-found"
    exit 1
  }
  $initialState.watchdog = [pscustomobject]@{
    pid = $watchdogSnapshot.Pid
    startedAt = $watchdogSnapshot.StartedAt
    processName = $watchdogSnapshot.Name
  }
  $initialState.watchdogStatus = "running"
  Write-TianjiLifecycleEvent -Root $Root -Event ([pscustomobject]@{
    at = (Get-Date).ToUniversalTime().ToString("o")
    action = "service-started"
    projectRoot = $Root
    service = "watchdog"
    record = $initialState.watchdog
  })
  Write-TianjiState -State $initialState -Root $Root
  Write-TianjiWatchdogLog "action=started root=$Root pid=$PID"
  while ($true) {
    $state = Read-TianjiState -Root $Root
    if (-not $state -or $state.projectRoot -ne $Root) {
      Write-TianjiWatchdogLog "action=exit reason=runtime-state-missing-or-root-changed"
      break
    }

    try {
      $network = Select-TianjiLanAddress
      if ($state.lanIp -ne $network.Selected.IPAddress) {
        $state.lanIp = $network.Selected.IPAddress
        Write-TianjiWatchdogLog "action=lan-ip-updated ip=$($state.lanIp)"
      }
    } catch {
      Write-TianjiWatchdogLog "action=lan-ip-check-failed error=$($_.Exception.Message)"
    }

    $shouldExit = $false
    foreach ($service in @("backend", "frontend")) {
      $url = Get-WatchdogServiceUrl -Service $service
      $healthy = Test-TianjiEndpoint -Url $url
      $owned = Test-TianjiRecordedProcess -Record $state.$service
      if ($healthy -and $owned) {
        $failureCounts[$service] = 0
        continue
      }

      $failureCounts[$service]++
      Write-TianjiWatchdogLog "service=$service health=$healthy owned=$owned consecutiveFailures=$($failureCounts[$service])"
      if ($failureCounts[$service] -lt $failureThreshold) { continue }
      if (-not (Restart-WatchedService -Service $service -State $state)) { $shouldExit = $true; break }
      $failureCounts[$service] = 0
    }

    foreach ($logName in @("frontend.out.log", "frontend.err.log", "backend.out.log", "backend.err.log")) {
      Rotate-TianjiLog -Path (Join-Path (Get-TianjiRuntimeDirectory) $logName)
    }
    Write-TianjiState -State $state -Root $Root
    if ($shouldExit) { break }
    Start-Sleep -Seconds 10
  }
} finally {
  Exit-TianjiMutex -Mutex $mutex
}
