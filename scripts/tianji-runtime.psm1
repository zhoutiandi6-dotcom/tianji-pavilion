Set-StrictMode -Version Latest

$script:TianjiRuntimeDirectory = Join-Path $env:TEMP "tianji-runtime"
$script:TianjiStateFile = Join-Path $script:TianjiRuntimeDirectory "runtime-state.json"
$script:TianjiLogLimitBytes = 1024KB

function Get-TianjiRuntimeDirectory { $script:TianjiRuntimeDirectory }
function Get-TianjiStateFile { $script:TianjiStateFile }
function Set-TianjiRuntimeDirectory {
  param([Parameter(Mandatory = $true)][string]$Path)
  $script:TianjiRuntimeDirectory = [IO.Path]::GetFullPath($Path)
  $script:TianjiStateFile = Join-Path $script:TianjiRuntimeDirectory "runtime-state.json"
}

function Get-TianjiDurableStateFile {
  param([Parameter(Mandatory = $true)][string]$Root)
  $dataConfig = Get-TianjiDataConfiguration -Root $Root
  return Join-Path $dataConfig.LogsPath "runtime-state.json"
}

function Get-TianjiLifecycleLogFile {
  param([Parameter(Mandatory = $true)][string]$Root)
  $dataConfig = Get-TianjiDataConfiguration -Root $Root
  return Join-Path $dataConfig.LogsPath "launcher-events.jsonl"
}

function Get-TianjiEnvValue {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$Name
  )
  $fromProcess = [Environment]::GetEnvironmentVariable($Name, "Process")
  if ($fromProcess) { return $fromProcess.Trim() }
  $envFile = Join-Path $Root "apps\\server\\.env"
  if (-not (Test-Path -LiteralPath $envFile)) { return $null }
  foreach ($line in Get-Content -LiteralPath $envFile) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) { continue }
    $separator = $trimmed.IndexOf("=")
    if ($separator -lt 1) { continue }
    if ($trimmed.Substring(0, $separator).Trim() -eq $Name) {
      return $trimmed.Substring($separator + 1).Trim()
    }
  }
  return $null
}

function Get-TianjiDataConfiguration {
  param([Parameter(Mandatory = $true)][string]$Root)
  $configuredRoot = Get-TianjiEnvValue -Root $Root -Name "TIANJI_DATA_ROOT"
  if (-not $configuredRoot) {
    throw "TIANJI_DATA_ROOT is required. Refusing to start Tianji with source-directory data. Run the explicit data migration first."
  }
  $dataRoot = [System.IO.Path]::GetFullPath($configuredRoot)
  $databasePath = Join-Path $dataRoot "database\tianji.db"
  $databaseUrl = "file:" + $databasePath.Replace("\", "/")
  [pscustomobject]@{
    DataRoot = $dataRoot
    DatabasePath = $databasePath
    DatabaseUrl = $databaseUrl
    AttachmentsPath = Join-Path $dataRoot "uploads\attachments"
    BackupsPath = Join-Path $dataRoot "backups"
    LogsPath = Join-Path $dataRoot "logs"
    TempPath = Join-Path $dataRoot "temp"
    QuarantinePath = Join-Path $dataRoot "quarantine"
    BackupRoot = Get-TianjiEnvValue -Root $Root -Name "TIANJI_BACKUP_ROOT"
  }
}

function Test-TianjiBackupRoot {
  param([Parameter(Mandatory = $true)]$DataConfiguration)
  $backupRoot = $DataConfiguration.BackupRoot
  if (-not $backupRoot) {
    return [pscustomobject]@{ Available = $false; Writable = $false; Message = "TIANJI_BACKUP_ROOT is not configured." }
  }
  if (-not (Test-Path -LiteralPath $backupRoot -PathType Container)) {
    return [pscustomobject]@{ Available = $false; Writable = $false; Message = "Backup root is unavailable in this PowerShell session: $backupRoot" }
  }
  $probe = Join-Path $backupRoot ".tianji-write-probe-$([Guid]::NewGuid().ToString('N')).tmp"
  try {
    [System.IO.File]::WriteAllText($probe, "probe")
    Remove-Item -LiteralPath $probe -Force
    return [pscustomobject]@{ Available = $true; Writable = $true; Message = "Backup root is available and writable: $backupRoot" }
  } catch {
    Remove-Item -LiteralPath $probe -Force -ErrorAction SilentlyContinue
    return [pscustomobject]@{ Available = $true; Writable = $false; Message = "Backup root is not writable in this PowerShell session: $backupRoot" }
  }
}

function Get-TianjiDirectoryStats {
  param([Parameter(Mandatory = $true)][string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return [pscustomobject]@{ Path = $Path; FileCount = 0; Bytes = 0 } }
  $files = @(Get-ChildItem -LiteralPath $Path -Recurse -File -Force -ErrorAction SilentlyContinue)
  return [pscustomobject]@{ Path = $Path; FileCount = $files.Count; Bytes = ($files | Measure-Object -Property Length -Sum).Sum }
}

function Get-TianjiVolumeStatus {
  param([Parameter(Mandatory = $true)][string]$Path)
  $root = [System.IO.Path]::GetPathRoot((Resolve-Path -LiteralPath $Path).Path)
  $drive = New-Object System.IO.DriveInfo($root)
  return [pscustomobject]@{ Root = $root; TotalBytes = $drive.TotalSize; FreeBytes = $drive.AvailableFreeSpace; FreePercent = if ($drive.TotalSize -gt 0) { [math]::Round(($drive.AvailableFreeSpace / $drive.TotalSize) * 100, 2) } else { 0 } }
}

function Initialize-TianjiRuntime {
  New-Item -ItemType Directory -Path $script:TianjiRuntimeDirectory -Force | Out-Null
}

function Get-TianjiMutex {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [string]$Scope
  )
  # Production and isolated test can deliberately share a release root, so
  # lifecycle locking must be scoped to its data environment instead.
  $identity = if ($Scope) { "$Name|$([IO.Path]::GetFullPath($Scope))" } else { $Name }
  $algorithm = [Security.Cryptography.SHA256]::Create()
  try {
    $hash = $algorithm.ComputeHash([Text.Encoding]::UTF8.GetBytes($identity))
    $suffix = -join ($hash | ForEach-Object { $_.ToString('x2') })
  } finally {
    $algorithm.Dispose()
  }
  return [System.Threading.Mutex]::new($false, "Local\TianjiPavilion.$Name.$suffix")
}

function Enter-TianjiMutex {
  param([Parameter(Mandatory = $true)][System.Threading.Mutex]$Mutex)
  try { return $Mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { return $true }
}

function Exit-TianjiMutex {
  param([Parameter(Mandatory = $true)][System.Threading.Mutex]$Mutex)
  try { $Mutex.ReleaseMutex() } catch [System.ApplicationException] { }
  $Mutex.Dispose()
}

function New-TianjiState {
  param([Parameter(Mandatory = $true)][string]$Root)
  $dataConfig = Get-TianjiDataConfiguration -Root $Root
  return [ordered]@{
    schemaVersion = 3
    launchId = [Guid]::NewGuid().ToString()
    release = (Split-Path $Root -Leaf)
    projectRoot = $Root
    dataRoot = $dataConfig.DataRoot
    startedAt = (Get-Date).ToUniversalTime().ToString("o")
    updatedAt = $null
    lanIp = $null
    frontendPort = 3000
    backendPort = 3001
    logDirectory = $script:TianjiRuntimeDirectory
    frontend = $null
    backend = $null
    watchdog = $null
    watchdogStatus = "stopped"
  }
}

function Convert-TianjiTimestampToIsoUtc {
  param($Value)
  if ($null -eq $Value) { return $null }
  if ($Value -is [datetimeoffset]) { return $Value.UtcDateTime.ToString("o") }
  if ($Value -is [datetime]) { return $Value.ToUniversalTime().ToString("o") }

  $raw = [string]$Value
  $parsed = [datetimeoffset]::MinValue
  if ([datetimeoffset]::TryParse($raw, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind, [ref]$parsed)) {
    return $parsed.UtcDateTime.ToString("o")
  }
  return $raw
}

function Set-TianjiTimestampProperty {
  param($Object, [Parameter(Mandatory = $true)][string]$Name)
  if ($null -eq $Object) { return }
  if ($Object -is [System.Collections.IDictionary]) {
    if ($Object.Contains($Name) -and $null -ne $Object[$Name]) { $Object[$Name] = Convert-TianjiTimestampToIsoUtc $Object[$Name] }
    return
  }
  $property = $Object.PSObject.Properties[$Name]
  if ($property -and $null -ne $property.Value) { $property.Value = Convert-TianjiTimestampToIsoUtc $property.Value }
}

function Normalize-TianjiServiceRecordTimestamps {
  param($Record)
  Set-TianjiTimestampProperty -Object $Record -Name "startedAt"
  Set-TianjiTimestampProperty -Object $Record -Name "processStartTime"
}

function ConvertTo-TianjiUtcTicks {
  param($Value)
  if ($null -eq $Value) { return $null }
  try {
    if ($Value -is [datetimeoffset]) { return $Value.UtcDateTime.Ticks }
    if ($Value -is [datetime]) { return $Value.ToUniversalTime().Ticks }
    $parsed = [datetimeoffset]::MinValue
    if ([datetimeoffset]::TryParse([string]$Value, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind, [ref]$parsed)) {
      return $parsed.UtcDateTime.Ticks
    }
  } catch { }
  return $null
}

function Normalize-TianjiStateTimestamps {
  param($State)
  Set-TianjiTimestampProperty -Object $State -Name "startedAt"
  Set-TianjiTimestampProperty -Object $State -Name "updatedAt"
  foreach ($service in @("frontend", "backend", "watchdog")) {
    if ($State -is [System.Collections.IDictionary]) { $record = $State[$service] } else { $record = $State.$service }
    Normalize-TianjiServiceRecordTimestamps -Record $record
  }
}

function Read-TianjiStateCandidate {
  param([Parameter(Mandatory = $true)][string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  try {
    $state = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
    Normalize-TianjiStateTimestamps -State $state
    return $state
  } catch {
    Write-Warning "Ignoring unreadable Tianji runtime state at ${Path}: $($_.Exception.Message)"
    return $null
  }
}

function Write-TianjiJsonAtomically {
  param([Parameter(Mandatory = $true)]$Value, [Parameter(Mandatory = $true)][string]$Path)
  $directory = Split-Path -Parent $Path
  New-Item -ItemType Directory -Path $directory -Force | Out-Null
  $temporaryFile = "$Path.$([Guid]::NewGuid().ToString('N')).tmp"
  $Value | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $temporaryFile -Encoding utf8
  Move-Item -LiteralPath $temporaryFile -Destination $Path -Force
}

function Write-TianjiLifecycleEvent {
  param([Parameter(Mandatory = $true)][string]$Root, [Parameter(Mandatory = $true)]$Event)
  $path = Get-TianjiLifecycleLogFile -Root $Root
  New-Item -ItemType Directory -Path (Split-Path -Parent $path) -Force | Out-Null
  Set-TianjiTimestampProperty -Object $Event -Name "at"
  if ($Event -is [System.Collections.IDictionary]) { $record = $Event["record"] } else { $record = $Event.record }
  Normalize-TianjiServiceRecordTimestamps -Record $record
  Add-Content -LiteralPath $path -Value ($Event | ConvertTo-Json -Compress -Depth 8) -Encoding utf8
}

function Recover-TianjiStateFromLifecycleLog {
  param([Parameter(Mandatory = $true)][string]$Root)
  $path = Get-TianjiLifecycleLogFile -Root $Root
  if (-not (Test-Path -LiteralPath $path)) { return $null }
  $records = @{}
  foreach ($line in Get-Content -LiteralPath $path -ErrorAction SilentlyContinue) {
    try {
      $entry = $line | ConvertFrom-Json
      if ($entry.projectRoot -ne $Root -or -not $entry.service) { continue }
      if ($entry.action -eq "service-started") {
        Normalize-TianjiServiceRecordTimestamps -Record $entry.record
        $records[$entry.service] = $entry.record
      }
      if ($entry.action -eq "service-stopped") { $records.Remove([string]$entry.service) | Out-Null }
    } catch { }
  }
  if (-not $records.ContainsKey("frontend") -and -not $records.ContainsKey("backend") -and -not $records.ContainsKey("watchdog")) { return $null }
  $state = New-TianjiState -Root $Root
  $state.frontend = $records["frontend"]
  $state.backend = $records["backend"]
  $state.watchdog = $records["watchdog"]
  $state.watchdogStatus = "recovered-from-lifecycle-log"
  return [pscustomobject]$state
}

function Recover-TianjiLegacyWatchdogRecord {
  param([Parameter(Mandatory = $true)][string]$Root)
  $log = Join-Path (Get-TianjiRuntimeDirectory) "watchdog.log"
  if (-not (Test-Path -LiteralPath $log)) { return $null }
  $escapedRoot = [regex]::Escape($Root)
  $match = Get-Content -LiteralPath $log -ErrorAction SilentlyContinue |
    Select-String -Pattern "^(?<at>\S+) action=started root=$escapedRoot pid=(?<pid>\d+)$" |
    Select-Object -Last 1
  if (-not $match) { return $null }
  $snapshot = Get-TianjiProcessSnapshot -Pid ([int]$match.Matches[0].Groups["pid"].Value)
  if (-not $snapshot -or $snapshot.Name -ne "powershell") { return $null }
  $watchScript = Join-Path $Root "scripts\\watch-tianji.ps1"
  if ($snapshot.CommandLine -notmatch [regex]::Escape($watchScript) -or $snapshot.CommandLine -notmatch "-Root\s+$escapedRoot") { return $null }
  $loggedAt = Convert-TianjiTimestampToIsoUtc $match.Matches[0].Groups["at"].Value
  $delta = [math]::Abs(([datetimeoffset]$snapshot.StartedAt - [datetimeoffset]$loggedAt).TotalMinutes)
  if ($delta -gt 2) { return $null }
  return [pscustomobject]@{
    pid = $snapshot.Pid
    startedAt = $snapshot.StartedAt
    processName = $snapshot.Name
    executablePath = $snapshot.Path
    commandLine = $snapshot.CommandLine
    workingDirectory = (Split-Path -Parent $watchScript)
    service = "watchdog"
  }
}

function Repair-TianjiStateOwnership {
  param([Parameter(Mandatory = $true)]$State, [Parameter(Mandatory = $true)][string]$Root)
  $fromLifecycle = Recover-TianjiStateFromLifecycleLog -Root $Root
  foreach ($service in @("frontend", "backend", "watchdog")) {
    $record = $State.$service
    if (Test-TianjiRecordedProcess -Record $record) { continue }
    $candidate = if ($fromLifecycle) { $fromLifecycle.$service } else { $null }
    if (Test-TianjiRecordedProcess -Record $candidate) {
      $State | Add-Member -NotePropertyName $service -NotePropertyValue $candidate -Force
    }
  }
  if (-not (Test-TianjiRecordedProcess -Record $State.watchdog)) {
    $watchdog = Recover-TianjiLegacyWatchdogRecord -Root $Root
    if (Test-TianjiRecordedProcess -Record $watchdog) {
      $State | Add-Member -NotePropertyName "watchdog" -NotePropertyValue $watchdog -Force
      $State | Add-Member -NotePropertyName "watchdogStatus" -NotePropertyValue "recovered-from-watchdog-log" -Force
    }
  }
  return $State
}

function Read-TianjiState {
  param([Parameter(Mandatory = $true)][string]$Root)
  $candidates = @(@(
    (Read-TianjiStateCandidate -Path (Get-TianjiDurableStateFile -Root $Root)),
    (Read-TianjiStateCandidate -Path $script:TianjiStateFile)
  ) | Where-Object { $_ -and $_.projectRoot -eq $Root })
  if ($candidates.Count -gt 0) {
    $state = $candidates | Sort-Object { if ($_.updatedAt) { [datetime]$_.updatedAt } else { [datetime]::MinValue } } -Descending | Select-Object -First 1
    return Repair-TianjiStateOwnership -State $state -Root $Root
  }
  $recovered = Recover-TianjiStateFromLifecycleLog -Root $Root
  if (-not $recovered) { return $null }
  return Repair-TianjiStateOwnership -State $recovered -Root $Root
}

function Write-TianjiState {
  param([Parameter(Mandatory = $true)]$State, [Parameter(Mandatory = $true)][string]$Root)
  $expectedRelease = Split-Path $Root -Leaf
  $dataConfig = Get-TianjiDataConfiguration -Root $Root
  if ($State.release -ne $expectedRelease -or $State.dataRoot -ne $dataConfig.DataRoot) { throw 'Runtime-state top-level release or dataRoot is inconsistent.' }
  foreach ($service in @('watchdog','frontend','backend')) {
    $record = $State.$service
    if ($record -and ($record.release -ne $expectedRelease -or $record.dataRoot -ne $dataConfig.DataRoot -or $record.projectRoot -ne $Root)) { throw "Runtime-state $service fingerprint is inconsistent." }
  }
  Initialize-TianjiRuntime
  Normalize-TianjiStateTimestamps -State $State
  $updatedAt = (Get-Date).ToUniversalTime().ToString("o")
  if ($State -is [System.Collections.IDictionary]) { $State.updatedAt = $updatedAt }
  else { $State | Add-Member -NotePropertyName updatedAt -NotePropertyValue $updatedAt -Force }
  Write-TianjiJsonAtomically -Value $State -Path (Get-TianjiDurableStateFile -Root $Root)
  Write-TianjiJsonAtomically -Value $State -Path $script:TianjiStateFile
}

function Remove-TianjiState {
  param([Parameter(Mandatory = $true)][string]$Root)
  Remove-Item -LiteralPath $script:TianjiStateFile -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath (Get-TianjiDurableStateFile -Root $Root) -Force -ErrorAction SilentlyContinue
}

function Get-TianjiPrivateLanCandidates {
  $defaultInterfaces = @(
    Get-NetRoute -AddressFamily IPv4 -DestinationPrefix "0.0.0.0/0" -ErrorAction SilentlyContinue |
      Where-Object { $_.State -eq "Alive" -and $_.NextHop -ne "0.0.0.0" } |
      Sort-Object RouteMetric |
      Select-Object -ExpandProperty InterfaceIndex -Unique
  )
  $blockedName = "(?i)(loopback|docker|wsl|hyper-v|vmware|virtualbox|vpn|tap|tailscale|zerotier)"
  $candidates = foreach ($address in Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue) {
    $ip = $address.IPAddress
    $isPrivate = $ip -match "^10\." -or $ip -match "^192\.168\." -or $ip -match "^172\.(1[6-9]|2[0-9]|3[0-1])\."
    $adapter = Get-NetAdapter -InterfaceIndex $address.InterfaceIndex -ErrorAction SilentlyContinue
    if (-not $isPrivate -or $address.AddressState -ne "Preferred" -or -not $adapter -or $adapter.Status -ne "Up" -or $adapter.InterfaceDescription -match $blockedName -or $adapter.Name -match $blockedName) {
      continue
    }
    [pscustomobject]@{
      IPAddress = $ip
      InterfaceIndex = $address.InterfaceIndex
      InterfaceAlias = $address.InterfaceAlias
      InterfaceDescription = $adapter.InterfaceDescription
      HasDefaultRoute = $defaultInterfaces -contains $address.InterfaceIndex
      RouteMetric = (($defaultInterfaces | ForEach-Object { if ($_ -eq $address.InterfaceIndex) { (Get-NetRoute -AddressFamily IPv4 -DestinationPrefix "0.0.0.0/0" -InterfaceIndex $_ | Sort-Object RouteMetric | Select-Object -First 1 -ExpandProperty RouteMetric) } }) | Select-Object -First 1)
    }
  }
  return @($candidates | Sort-Object @{ Expression = "HasDefaultRoute"; Descending = $true }, @{ Expression = "RouteMetric"; Descending = $false }, IPAddress)
}

function Select-TianjiLanAddress {
  $candidates = @(Get-TianjiPrivateLanCandidates)
  if ($candidates.Count -eq 0) {
    throw "No usable private IPv4 address was found. Connect to the LAN before starting Tianji."
  }
  $selected = $candidates[0]
  return [pscustomobject]@{
    Selected = $selected
    Candidates = $candidates
    Reason = if ($selected.HasDefaultRoute) { "selected the lowest-metric private IPv4 on the default-route adapter" } else { "selected the only eligible private IPv4 adapter" }
  }
}

function Get-TianjiProcessSnapshot {
  param([int]$Pid)
  try {
    $process = Get-Process -Id $Pid -ErrorAction Stop
    $cim = Get-CimInstance Win32_Process -Filter "ProcessId = $Pid" -ErrorAction Stop
    return [pscustomobject]@{
      Pid = $process.Id
      Name = $process.ProcessName
      Path = $process.Path
      StartedAt = $process.StartTime.ToUniversalTime().ToString("o")
      CommandLine = $cim.CommandLine
    }
  } catch { return $null }
}

function Test-TianjiRecordedProcess {
  param($Record)
  if (-not $Record -or -not $Record.pid -or -not $Record.startedAt) { return $false }
  $snapshot = Get-TianjiProcessSnapshot -Pid ([int]$Record.pid)
  $recordProcessName = $Record.PSObject.Properties["processName"]
  $expectedProcessName = if ($recordProcessName -and $recordProcessName.Value) { [string]$recordProcessName.Value } else { "node" }
  if (-not $snapshot -or $snapshot.Name -ne $expectedProcessName) { return $false }
  if ($snapshot.StartedAt -ne [string]$Record.startedAt) { return $false }
  $expectedPath = $Record.PSObject.Properties["executablePath"]
  if ($expectedPath -and $expectedPath.Value -and $snapshot.Path -ne [string]$expectedPath.Value) { return $false }
  $expectedCommand = $Record.PSObject.Properties["commandLine"]
  if ($expectedCommand -and $expectedCommand.Value -and $snapshot.CommandLine -ne [string]$expectedCommand.Value) { return $false }
  return $true
}

function Get-TianjiPortOccupant {
  param([Parameter(Mandatory = $true)][int]$Port)
  $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $connection) { return $null }
  $snapshot = Get-TianjiProcessSnapshot -Pid $connection.OwningProcess
  return [pscustomobject]@{
    Port = $Port
    LocalAddress = $connection.LocalAddress
    Pid = $connection.OwningProcess
    ProcessName = if ($snapshot) { $snapshot.Name } else { "unknown" }
    ProcessPath = if ($snapshot) { $snapshot.Path } else { $null }
  }
}

function Test-TianjiEndpoint {
  param([Parameter(Mandatory = $true)][string]$Url)
  try { return (Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 3).StatusCode -eq 200 } catch { return $false }
}

function Rotate-TianjiLog {
  param([Parameter(Mandatory = $true)][string]$Path)
  if ((Test-Path -LiteralPath $Path) -and (Get-Item -LiteralPath $Path).Length -ge $script:TianjiLogLimitBytes) {
    Move-Item -LiteralPath $Path -Destination "$Path.1" -Force
  }
}

function Write-TianjiWatchdogLog {
  param([Parameter(Mandatory = $true)][string]$Message)
  Initialize-TianjiRuntime
  $log = Join-Path $script:TianjiRuntimeDirectory "watchdog.log"
  Rotate-TianjiLog -Path $log
  Add-Content -LiteralPath $log -Value "$(Get-Date -Format o) $Message" -Encoding utf8
}

function Get-TianjiFirewallRules {
  $rules = @()
  $rules += @(Get-NetFirewallRule -DisplayName "*3000*3001*" -ErrorAction SilentlyContinue)
  $rules += @(Get-NetFirewallRule -DisplayName "Node.js JavaScript Runtime" -ErrorAction SilentlyContinue)
  return @($rules | Sort-Object Name -Unique)
}

function Start-TianjiServiceProcess {
  param(
    [Parameter(Mandatory = $true)][ValidateSet("frontend", "backend")][string]$Service,
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][int]$Port
  )
  Initialize-TianjiRuntime
  $relativeWorkingDirectory = if ($Service -eq "frontend") { "apps\\web" } else { "apps\\server" }
  $workingDirectory = Join-Path $Root $relativeWorkingDirectory
  $arguments = if ($Service -eq "frontend") { ".next\\standalone\\apps\\web\\server.js" } else { "dist\\main.js" }
  $output = Join-Path $script:TianjiRuntimeDirectory "$Service.out.log"
  $error = Join-Path $script:TianjiRuntimeDirectory "$Service.err.log"
  Rotate-TianjiLog -Path $output
  Rotate-TianjiLog -Path $error

  $oldHost = $env:HOSTNAME
  $oldPort = $env:PORT
  $oldServerPort = $env:SERVER_PORT
  $oldDataRoot = $env:TIANJI_DATA_ROOT
  $oldDatabaseUrl = $env:DATABASE_URL
  try {
    $dataConfig = Get-TianjiDataConfiguration -Root $Root
    $env:HOSTNAME = "0.0.0.0"
    $env:TIANJI_DATA_ROOT = $dataConfig.DataRoot
    $env:DATABASE_URL = $dataConfig.DatabaseUrl
    if ($Service -eq "frontend") { $env:PORT = "$Port" } else { $env:SERVER_PORT = "$Port" }
    $process = Start-Process -FilePath "node.exe" -WorkingDirectory $workingDirectory -WindowStyle Hidden -ArgumentList $arguments -RedirectStandardOutput $output -RedirectStandardError $error -PassThru
  } finally {
    $env:HOSTNAME = $oldHost
    $env:PORT = $oldPort
    $env:SERVER_PORT = $oldServerPort
    $env:TIANJI_DATA_ROOT = $oldDataRoot
    $env:DATABASE_URL = $oldDatabaseUrl
  }
  Start-Sleep -Milliseconds 250
  $snapshot = Get-TianjiProcessSnapshot -Pid $process.Id
  if (-not $snapshot) { throw "Failed to start Tianji $Service process." }
  $record = [pscustomobject]@{
    pid = $snapshot.Pid
    startedAt = $snapshot.StartedAt
    processStartTime = $snapshot.StartedAt
    processName = $snapshot.Name
    executablePath = $snapshot.Path
    commandLine = $snapshot.CommandLine
    workingDirectory = $workingDirectory
    service = $Service
    port = $Port
    dataRoot = $dataConfig.DataRoot
    projectRoot = $Root
    release = (Split-Path $Root -Leaf)
  }
  Write-TianjiLifecycleEvent -Root $Root -Event ([pscustomobject]@{
    at = (Get-Date).ToUniversalTime().ToString("o")
    action = "service-started"
    projectRoot = $Root
    service = $Service
    record = $record
  })
  return $record
}

function Stop-TianjiRecordedProcess {
  param($Record, [string]$Label, [string]$Root, [Parameter(Mandatory=$true)]$DataConfiguration)
  $auditPath = Join-Path $DataConfiguration.LogsPath 'stop-audit.jsonl'
  function Write-StopAudit($result,$reason,$attempt,$exited,$released) {
    $recordPort = if($Record -and $Record.PSObject.Properties['port']){$Record.PSObject.Properties['port'].Value}else{$null}
    [ordered]@{timestamp=(Get-Date).ToUniversalTime().ToString('o');environment=$DataConfiguration.DataRoot;dataRoot=$DataConfiguration.DataRoot;release=(Split-Path $Root -Leaf);role=$Label;pid=if($Record){$Record.pid}else{$null};processStartTime=if($Record){$Record.processStartTime}else{$null};port=$recordPort;ownershipValidation=$result;reason=$reason;stopAttempt=$attempt;exited=$exited;portReleased=$released}|ConvertTo-Json -Compress|Add-Content -LiteralPath $auditPath -Encoding utf8
  }
  if (-not $Record) { Write-StopAudit 'FAIL' 'missing-record' $false $false $false; return $false }
  $snapshot=Get-TianjiProcessSnapshot -Pid ([int]$Record.pid)
  $expectedStart=ConvertTo-TianjiUtcTicks $(if($Record.processStartTime){$Record.processStartTime}else{$Record.startedAt})
  $actualStart=if($snapshot){ConvertTo-TianjiUtcTicks $snapshot.StartedAt}else{$null}
  $portProperty=$Record.PSObject.Properties['port'];$portOk=if($portProperty -and $portProperty.Value){$occupant=Get-TianjiPortOccupant -Port ([int]$portProperty.Value);$occupant -and $occupant.Pid -eq [int]$Record.pid}else{$true}
  $ownershipOk=$snapshot -and $expectedStart -ne $null -and $actualStart -ne $null -and $actualStart -eq $expectedStart -and $snapshot.Name -eq $Record.processName -and $portOk -and $Record.dataRoot -eq $DataConfiguration.DataRoot -and $Record.projectRoot -eq $Root -and $snapshot.CommandLine -eq $Record.commandLine
  if(-not $ownershipOk){Write-StopAudit 'FAIL' 'PROCESS_OWNERSHIP_MISMATCH' $false $false $false;Write-Host 'STOP_BLOCKED PROCESS_OWNERSHIP_MISMATCH';return $false}
  Write-StopAudit 'PASS' 'validated' $true $false $false
  $portProperty = $Record.PSObject.Properties["port"]
  if ($portProperty -and $portProperty.Value) {
    $occupant = Get-TianjiPortOccupant -Port ([int]$portProperty.Value)
    if (-not $occupant -or $occupant.Pid -ne [int]$Record.pid) { Write-StopAudit 'FAIL' 'port-mismatch' $false $false $false; return $false }
  }
  $pid = [int]$Record.pid
  Stop-Process -Id $pid -ErrorAction SilentlyContinue
  $deadline = (Get-Date).AddSeconds(5)
  while ((Get-Date) -lt $deadline -and (Get-Process -Id $pid -ErrorAction SilentlyContinue)) { Start-Sleep -Milliseconds 250 }
  if (Get-Process -Id $pid -ErrorAction SilentlyContinue) {
    Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
  }
  $exited=-not [bool](Get-Process -Id $pid -ErrorAction SilentlyContinue);$released=if($portProperty -and $portProperty.Value){-not [bool](Get-TianjiPortOccupant -Port ([int]$portProperty.Value))}else{$true}
  $stopResult=if($exited -and $released){'PASS'}else{'FAIL'}
  Write-StopAudit $stopResult 'stop-complete' $true $exited $released
  if ($Root -and $Record.PSObject.Properties["service"] -and $Record.service) {
    Write-TianjiLifecycleEvent -Root $Root -Event ([pscustomobject]@{
      at = (Get-Date).ToUniversalTime().ToString("o")
      action = "service-stopped"
      projectRoot = $Root
      service = $Record.service
      record = $Record
    })
  }
  return ($exited -and $released)
}

Export-ModuleMember -Function *-Tianji*
