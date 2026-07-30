Set-StrictMode -Version Latest

$script:TianjiRuntimeDirectory = Join-Path $env:TEMP "tianji-runtime"
$script:TianjiStateFile = Join-Path $script:TianjiRuntimeDirectory "runtime-state.json"
$script:TianjiLogLimitBytes = 1024KB

function Get-TianjiRuntimeDirectory { $script:TianjiRuntimeDirectory }
function Get-TianjiStateFile { $script:TianjiStateFile }

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

function Initialize-TianjiRuntime {
  New-Item -ItemType Directory -Path $script:TianjiRuntimeDirectory -Force | Out-Null
}

function Get-TianjiMutex {
  param([Parameter(Mandatory = $true)][string]$Name)
  return [System.Threading.Mutex]::new($false, "Local\TianjiPavilion.$Name")
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
  return [ordered]@{
    schemaVersion = 1
    launchId = [Guid]::NewGuid().ToString()
    projectRoot = $Root
    startedAt = (Get-Date).ToUniversalTime().ToString("o")
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

function Read-TianjiState {
  if (-not (Test-Path -LiteralPath $script:TianjiStateFile)) { return $null }
  try {
    return Get-Content -LiteralPath $script:TianjiStateFile -Raw | ConvertFrom-Json
  } catch {
    Write-Warning "Ignoring unreadable Tianji runtime state: $($_.Exception.Message)"
    Remove-Item -LiteralPath $script:TianjiStateFile -Force -ErrorAction SilentlyContinue
    return $null
  }
}

function Write-TianjiState {
  param([Parameter(Mandatory = $true)]$State)
  Initialize-TianjiRuntime
  $temporaryFile = "$script:TianjiStateFile.$([Guid]::NewGuid().ToString('N')).tmp"
  $State | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $temporaryFile -Encoding utf8
  Move-Item -LiteralPath $temporaryFile -Destination $script:TianjiStateFile -Force
}

function Remove-TianjiState {
  Remove-Item -LiteralPath $script:TianjiStateFile -Force -ErrorAction SilentlyContinue
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
    return [pscustomobject]@{
      Pid = $process.Id
      Name = $process.ProcessName
      Path = $process.Path
      StartedAt = $process.StartTime.ToUniversalTime().ToString("o")
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
  return $snapshot.StartedAt -eq [string]$Record.startedAt
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
    [Parameter(Mandatory = $true)][string]$Root
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
    if ($Service -eq "frontend") { $env:PORT = "3000" } else { $env:SERVER_PORT = "3001" }
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
  return [pscustomobject]@{ pid = $snapshot.Pid; startedAt = $snapshot.StartedAt; processName = $snapshot.Name }
}

function Stop-TianjiRecordedProcess {
  param($Record, [string]$Label)
  if (-not (Test-TianjiRecordedProcess -Record $Record)) { return $false }
  $pid = [int]$Record.pid
  Stop-Process -Id $pid -ErrorAction SilentlyContinue
  $deadline = (Get-Date).AddSeconds(5)
  while ((Get-Date) -lt $deadline -and (Get-Process -Id $pid -ErrorAction SilentlyContinue)) { Start-Sleep -Milliseconds 250 }
  if (Get-Process -Id $pid -ErrorAction SilentlyContinue) {
    Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
  }
  return $true
}

Export-ModuleMember -Function *-Tianji*
