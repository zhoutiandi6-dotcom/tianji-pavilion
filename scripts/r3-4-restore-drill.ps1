<#
  R3-4 administrator-only recovery drill.
  The recovery source is always a new verified batch created by this run.
  Do not add a backup-path parameter: historical batches are intentionally not
  accepted by this drill.
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ConfirmMaintenanceWindow
)

$ErrorActionPreference = "Stop"
$requiredConfirmation = "R3-4-MAINTENANCE-WINDOW"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$dataRoot = "D:\TianjiData"
$databasePath = Join-Path $dataRoot "database\tianji.db"
$runtimeStatePath = Join-Path $dataRoot "logs\runtime-state.json"
$batchesPath = Join-Path $dataRoot "backups\batches"
$logPath = Join-Path $dataRoot "logs\r3-4-restore-drill.log"
$expectedAccount = "DESKTOP-BDTG8NU\zhouhaojie"
$runId = "r3-4-$(Get-Date -Format 'yyyyMMdd-HHmmss-fff')"
$script:drillBatchPath = $null
$script:protectionBatchPath = $null
$script:restoreStarted = $false
$script:rollbackAttempted = $false
$script:batchesBeforeRestore = @()

function Write-DrillLog {
  param([Parameter(Mandatory = $true)][string]$Message)
  $line = "$(Get-Date -Format o) $Message"
  Write-Host $line
  Add-Content -LiteralPath $logPath -Value $line -Encoding utf8
}

function Assert-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Administrator privileges are required. The restore drill made no changes."
  }
  Write-DrillLog "gate=administrator result=passed account=$($identity.Name)"
}

function Assert-MaintenanceWindow {
  if ($ConfirmMaintenanceWindow -cne $requiredConfirmation) {
    throw "Maintenance window confirmation is required: -ConfirmMaintenanceWindow $requiredConfirmation"
  }
  Write-DrillLog "gate=maintenance-window result=passed"
}

function Get-RunningOwner {
  param([Parameter(Mandatory = $true)][int]$ProcessId)
  $process = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction Stop
  $result = $process | Invoke-CimMethod -MethodName GetOwner
  if ($result.ReturnValue -ne 0) { throw "Unable to resolve owner for PID $ProcessId." }
  return "$($result.Domain)\$($result.User)"
}

function Assert-RecordedRuntime {
  $state = Read-TianjiState -Root $root
  if (-not $state) { throw "Tianji runtime state is unavailable." }
  foreach ($entry in @(@("frontend", $state.frontend), @("backend", $state.backend), @("watchdog", $state.watchdog))) {
    $label, $record = $entry
    if (-not (Test-TianjiRecordedProcess -Record $record)) { throw "Tianji $label is not a verified recorded process." }
    $owner = Get-RunningOwner -ProcessId ([int]$record.pid)
    if ($owner -ne $expectedAccount) { throw "Tianji $label runs as $owner, expected $expectedAccount." }
    Write-DrillLog "gate=runtime service=$label pid=$($record.pid) owner=$owner result=passed"
  }
  return $state
}

function Get-AclDigest {
  param([Parameter(Mandatory = $true)][string]$Path)
  $acl = Get-Acl -LiteralPath $Path
  return [pscustomobject]@{
    Path = $Path
    InheritanceProtected = $acl.AreAccessRulesProtected
    Rules = @($acl.Access | ForEach-Object { "$($_.IdentityReference.Value):$($_.FileSystemRights):$($_.AccessControlType):Inherited=$($_.IsInherited)" })
  }
}

function Assert-NoBroadWriteAcl {
  param([Parameter(Mandatory = $true)][string]$Path)
  $acl = Get-Acl -LiteralPath $Path
  foreach ($identity in @("NT AUTHORITY\Authenticated Users", "BUILTIN\Users", "Everyone")) {
    $broad = @($acl.Access | Where-Object {
      $_.IdentityReference.Value -eq $identity -and $_.AccessControlType -eq "Allow" -and
      (($_.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::Write) -or
       ($_.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::Modify) -or
       ($_.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::FullControl))
    })
    if ($broad.Count -gt 0) { throw "Broad write ACL remains on ${Path}: $identity" }
  }
}

function Assert-RequiredAcl {
  param([Parameter(Mandatory = $true)][string]$Path)
  $acl = Get-Acl -LiteralPath $Path
  foreach ($identity in @("NT AUTHORITY\SYSTEM", "BUILTIN\Administrators", $expectedAccount)) {
    if (-not @($acl.Access | Where-Object { $_.IdentityReference.Value -eq $identity -and $_.AccessControlType -eq "Allow" }).Count) {
      throw "Required ACL principal is missing from ${Path}: $identity"
    }
  }
  Assert-NoBroadWriteAcl -Path $Path
}

function Assert-SensitiveAclBaseline {
  $databaseDirectory = Split-Path -Parent $databasePath
  $serverEnv = Join-Path $root "apps\server\.env"
  $backupsDirectory = Join-Path $dataRoot "backups"
  foreach ($path in @($databaseDirectory, $databasePath, $serverEnv, $backupsDirectory)) {
    if (-not (Test-Path -LiteralPath $path)) { throw "Required protected path is missing: $path" }
    Assert-RequiredAcl -Path $path
  }
  Write-DrillLog "gate=acl-baseline result=passed"
}

function Invoke-HealthChecks {
  $urls = @(
    "http://127.0.0.1:3000/login",
    "http://127.0.0.1:3001/api/health",
    "http://192.168.13.126:3000/login",
    "http://192.168.13.126:3001/api/health"
  )
  foreach ($url in $urls) {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 20
    if ([int]$response.StatusCode -ne 200) { throw "Health check failed for $url with status $($response.StatusCode)." }
  }
  Write-DrillLog "health=four-endpoints result=passed"
}

function Invoke-SqliteIntegrityCheck {
  $nodeCode = @'
const sqlite=require('node:sqlite');
const db=new sqlite.DatabaseSync('D:/TianjiData/database/tianji.db',{readOnly:true});
const quick=db.prepare('PRAGMA quick_check').all().map(row=>Object.values(row)[0]);
const foreign=db.prepare('PRAGMA foreign_key_check').all().length;
db.close();
if(quick.length!==1 || quick[0]!=='ok' || foreign!==0) throw new Error('SQLite integrity validation failed');
'@
  & "E:\node.exe" -e $nodeCode
  if ($LASTEXITCODE -ne 0) { throw "SQLite integrity validation failed." }
  Write-DrillLog "sqlite=quick-check result=passed"
}

function Get-BatchNames {
  return @(Get-ChildItem -LiteralPath $batchesPath -Directory -ErrorAction Stop | Select-Object -ExpandProperty Name)
}

function Invoke-VerifiedBatchCheck {
  param([Parameter(Mandatory = $true)][string]$BatchPath)
  $manifestPath = Join-Path $BatchPath "manifest.json"
  $checksumPath = Join-Path $BatchPath "manifest.sha256"
  $verificationPath = Join-Path $BatchPath "verification.json"
  $databaseBackupPath = Join-Path $BatchPath "database\tianji.db"
  $configBackupPath = Join-Path $BatchPath "configuration\server.env"
  foreach ($path in @($manifestPath, $checksumPath, $verificationPath, $databaseBackupPath, $configBackupPath)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Backup batch is incomplete: $path" }
  }
  if ((Get-Item -LiteralPath $databaseBackupPath).Length -le 0) { throw "Backup database is empty: $databaseBackupPath" }
  $oldBatchPath = [Environment]::GetEnvironmentVariable("TIANJI_BACKUP_BATCH_PATH", "Process")
  [Environment]::SetEnvironmentVariable("TIANJI_BACKUP_BATCH_PATH", $BatchPath, "Process")
  try {
    & (Join-Path $root "node_modules\.bin\ts-node.cmd") (Join-Path $root "apps\server\scripts\backup-batch.ts") verify
    if ($LASTEXITCODE -ne 0) { throw "Backup batch verification tool failed." }
  } finally {
    [Environment]::SetEnvironmentVariable("TIANJI_BACKUP_BATCH_PATH", $oldBatchPath, "Process")
  }
  Assert-RequiredAcl -Path $configBackupPath
  Write-DrillLog "backup=verified batch=$BatchPath"
}

function Invoke-DrillBackup {
  $before = Get-BatchNames
  & (Join-Path $PSScriptRoot "backup-tianji.ps1") -StopServices -RestartAfter -NoPause
  if (-not $?) { throw "R3-4 drill backup failed." }
  $created = @(Get-BatchNames | Where-Object { $_ -notin $before })
  if ($created.Count -ne 1) { throw "Expected exactly one new drill backup batch; found $($created.Count)." }
  $script:drillBatchPath = Join-Path $batchesPath $created[0]
  Invoke-VerifiedBatchCheck -BatchPath $script:drillBatchPath
  Write-DrillLog "backup=locked-restore-source batch=$script:drillBatchPath"
}

function Invoke-FormalRestore {
  if (-not $script:drillBatchPath) { throw "No current-run drill backup was locked." }
  $script:batchesBeforeRestore = Get-BatchNames
  $script:restoreStarted = $true
  & (Join-Path $PSScriptRoot "restore-tianji.ps1") -BackupBatchPath $script:drillBatchPath -ConfirmPhrase "RESTORE-TIANJI" -NoPause
  if (-not $?) { throw "Formal restore script failed." }
  $protection = @(Get-BatchNames | Where-Object { $_ -notin $script:batchesBeforeRestore -and $_ -ne (Split-Path -Leaf $script:drillBatchPath) })
  if ($protection.Count -ne 1) { throw "Expected exactly one restore-before protection batch; found $($protection.Count)." }
  $script:protectionBatchPath = Join-Path $batchesPath $protection[0]
  Invoke-VerifiedBatchCheck -BatchPath $script:protectionBatchPath
  Write-DrillLog "restore=completed source=$script:drillBatchPath protection=$script:protectionBatchPath"
}

function Resolve-ProtectionBatch {
  if ($script:protectionBatchPath) { return $script:protectionBatchPath }
  if (-not $script:restoreStarted -or -not $script:batchesBeforeRestore) { return $null }
  $candidates = @(Get-BatchNames | Where-Object {
    $_ -notin $script:batchesBeforeRestore -and $_ -ne (Split-Path -Leaf $script:drillBatchPath)
  })
  if ($candidates.Count -eq 1) {
    $candidatePath = Join-Path $batchesPath $candidates[0]
    Invoke-VerifiedBatchCheck -BatchPath $candidatePath
    $script:protectionBatchPath = $candidatePath
    Write-DrillLog "rollback=protection-batch-recovered batch=$candidatePath"
    return $candidatePath
  }
  return $null
}

function Assert-PostRestoreRuntime {
  Assert-RecordedRuntime | Out-Null
  foreach ($port in 3000, 3001) {
    if (-not (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)) { throw "Tianji is not listening on port $port." }
  }
  Invoke-HealthChecks
  Invoke-SqliteIntegrityCheck
  Assert-SensitiveAclBaseline
  $errorLog = Join-Path $env:TEMP "tianji-runtime\backend.err.log"
  if (Test-Path -LiteralPath $errorLog) {
    $matches = Get-Content -LiteralPath $errorLog -Tail 150 -ErrorAction SilentlyContinue |
      Select-String -Pattern 'SQLITE_READONLY|SQLITE_CANTOPEN|database disk image is malformed|permission denied|access denied' -CaseSensitive:$false
    if ($matches) { throw "Recent SQLite or ACL error found in backend error log." }
  }
  Write-DrillLog "post-restore=validated"
}

function Ensure-TianjiRunning {
  try {
    Invoke-HealthChecks
    return $true
  } catch {
    Write-DrillLog "recovery=health-not-ready error=$($_.Exception.Message)"
    & (Join-Path $PSScriptRoot "start-tianji.ps1") -NoBrowser
    if (-not $?) { Write-DrillLog "recovery=start-failed"; return $false }
    try { Invoke-HealthChecks; return $true } catch { Write-DrillLog "recovery=start-health-failed error=$($_.Exception.Message)"; return $false }
  }
}

function Invoke-ProtectionRollback {
  if ($script:rollbackAttempted) { return $false }
  $protectionBatch = Resolve-ProtectionBatch
  if (-not $protectionBatch) {
    Write-DrillLog "rollback=unavailable reason=protection-batch-not-found"
    return $false
  }
  $script:rollbackAttempted = $true
  try {
    Write-DrillLog "rollback=begin protection=$protectionBatch"
    & (Join-Path $PSScriptRoot "restore-tianji.ps1") -BackupBatchPath $protectionBatch -ConfirmPhrase "RESTORE-TIANJI" -NoPause
    if (-not $?) { throw "Protection restore script failed." }
    Assert-PostRestoreRuntime
    Write-DrillLog "rollback=completed"
    return $true
  } catch {
    Write-DrillLog "rollback=failed error=$($_.Exception.Message)"
    return $false
  }
}

try {
  New-Item -ItemType Directory -Path (Split-Path -Parent $logPath) -Force | Out-Null
  Write-DrillLog "run=$runId action=begin"
  Assert-Administrator
  Assert-MaintenanceWindow
  Assert-RecordedRuntime | Out-Null
  Assert-SensitiveAclBaseline
  Invoke-HealthChecks
  $dbItem = Get-Item -LiteralPath $databasePath
  Write-DrillLog "baseline=recorded database=$databasePath bytes=$($dbItem.Length) lastWriteUtc=$($dbItem.LastWriteTimeUtc.ToString('o')) acl=$(Get-AclDigest -Path $databasePath | ConvertTo-Json -Compress)"
  Invoke-SqliteIntegrityCheck
  Invoke-DrillBackup
  Invoke-FormalRestore
  Assert-PostRestoreRuntime
  Write-DrillLog "result=AUTOMATION_PASS run=$runId source=$script:drillBatchPath protection=$script:protectionBatchPath"
  [pscustomobject]@{ Result="R3-4 automation PASS, pending manual business validation"; RunId=$runId; RestoreSource=$script:drillBatchPath; ProtectionBatch=$script:protectionBatchPath } | ConvertTo-Json
} catch {
  $failure = $_.Exception.Message
  Write-DrillLog "result=FAILED error=$failure"
  $rolledBack = Invoke-ProtectionRollback
  $running = Ensure-TianjiRunning
  if ($rolledBack -and $running) { Write-DrillLog "result=FAIL_ROLLBACK_COMPLETED run=$runId" }
  elseif (-not $script:restoreStarted -and $running) { Write-DrillLog "result=BLOCKED_BEFORE_RESTORE run=$runId" }
  else { Write-DrillLog "result=FAIL_RECOVERY_REQUIRED run=$runId" }
  throw
}
