<#
  R3-2B2C1 administrator-only production database ACL hardening.
  This script intentionally changes ACLs only beneath D:\TianjiData\database.
#>

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$dataRoot = "D:\TianjiData"
$databasePath = Join-Path $dataRoot "database"
$databaseFile = Join-Path $databasePath "tianji.db"
$runtimeStatePath = Join-Path $dataRoot "logs\runtime-state.json"
$snapshotRoot = Join-Path $dataRoot "backups\acl\r3-2b2c1"
$logPath = Join-Path $dataRoot "logs\r3-2b2c1-database-acl.log"
$expectedAccount = "DESKTOP-BDTG8NU\zhouhaojie"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss-fff"
$runId = "r3-2b2c1-$timestamp"
$snapshotPath = Join-Path $snapshotRoot "$runId.acl"
$snapshotManifestPath = Join-Path $snapshotRoot "$runId.json"
$script:aclChanged = $false
$script:rollbackAttempted = $false

function Write-RunLog {
  param([Parameter(Mandatory = $true)][string]$Message)
  $line = "$(Get-Date -Format o) $Message"
  Write-Host $line
  Add-Content -LiteralPath $logPath -Value $line -Encoding utf8
}

function Assert-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Administrator privileges are required. No ACL changes were made."
  }
  Write-RunLog "gate=administrator result=passed account=$($identity.Name)"
}

function Get-RunningOwner {
  param([Parameter(Mandatory = $true)][int]$ProcessId)
  $process = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction Stop
  $result = $process | Invoke-CimMethod -MethodName GetOwner
  if ($result.ReturnValue -ne 0) {
    throw "Unable to resolve owner for PID $ProcessId (GetOwner return value $($result.ReturnValue))."
  }
  return "$($result.Domain)\$($result.User)"
}

function Assert-TianjiRuntimeOwner {
  if (-not (Test-Path -LiteralPath $runtimeStatePath -PathType Leaf)) {
    throw "Tianji runtime state file is missing: $runtimeStatePath"
  }
  $state = Get-Content -LiteralPath $runtimeStatePath -Raw | ConvertFrom-Json
  $records = @(
    [pscustomobject]@{ Label = "frontend"; Pid = [int]$state.frontend.pid },
    [pscustomobject]@{ Label = "backend"; Pid = [int]$state.backend.pid },
    [pscustomobject]@{ Label = "watchdog"; Pid = [int]$state.watchdog.pid }
  )
  foreach ($record in $records) {
    if (-not (Get-Process -Id $record.Pid -ErrorAction SilentlyContinue)) {
      throw "Recorded Tianji $($record.Label) PID $($record.Pid) is not running."
    }
    $owner = Get-RunningOwner -ProcessId $record.Pid
    if ($owner -ne $expectedAccount) {
      throw "Tianji $($record.Label) PID $($record.Pid) runs as $owner, expected $expectedAccount."
    }
    Write-RunLog "gate=runtime-owner service=$($record.Label) pid=$($record.Pid) owner=$owner result=passed"
  }
}

function Invoke-CheckedCommand {
  param([Parameter(Mandatory = $true)][scriptblock]$Command, [Parameter(Mandatory = $true)][string]$FailureMessage)
  & $Command
  if ($LASTEXITCODE -ne 0) { throw $FailureMessage }
}

function Save-DatabaseAclSnapshot {
  New-Item -ItemType Directory -Path $snapshotRoot -Force | Out-Null
  $snapshotItems = @((Get-Item -LiteralPath $databasePath -Force)) + @(Get-ChildItem -LiteralPath $databasePath -Force)
  $snapshotManifest = [pscustomobject]@{
    RunId = $runId
    DatabasePath = $databasePath
    AccessRules = @($snapshotItems | ForEach-Object {
      [pscustomobject]@{
        Path = $_.FullName
        AccessSddl = (Get-Acl -LiteralPath $_.FullName).GetSecurityDescriptorSddlForm([System.Security.AccessControl.AccessControlSections]::Access)
      }
    })
  }
  $snapshotManifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $snapshotManifestPath -Encoding utf8
  Push-Location $dataRoot
  try {
    Invoke-CheckedCommand -Command { & icacls.exe "database" /save $snapshotPath /t /c /q } -FailureMessage "Failed to export database ACL snapshot."
  } finally {
    Pop-Location
  }
  if (-not (Test-Path -LiteralPath $snapshotPath -PathType Leaf) -or (Get-Item -LiteralPath $snapshotPath).Length -le 0) {
    throw "Database ACL snapshot was not created or is empty: $snapshotPath"
  }
  Write-RunLog "snapshot=created path=$snapshotPath manifest=$snapshotManifestPath"
}

function Restore-DatabaseAclSnapshot {
  if ($script:rollbackAttempted -or -not $script:aclChanged) { return $true }
  $script:rollbackAttempted = $true
  if (-not (Test-Path -LiteralPath $snapshotPath -PathType Leaf) -or -not (Test-Path -LiteralPath $snapshotManifestPath -PathType Leaf)) {
    Write-RunLog "rollback=failed reason=snapshot-missing path=$snapshotPath"
    return $false
  }
  try {
    $manifest = Get-Content -LiteralPath $snapshotManifestPath -Raw | ConvertFrom-Json
    if ($manifest.DatabasePath -ne $databasePath -or @($manifest.AccessRules).Count -lt 1) {
      throw "ACL snapshot manifest does not describe the expected database scope."
    }
    foreach ($record in @($manifest.AccessRules)) {
      if (-not ([string]$record.Path).StartsWith("$databasePath\\", [StringComparison]::OrdinalIgnoreCase) -and $record.Path -ne $databasePath) {
        throw "ACL snapshot manifest contains an out-of-scope path: $($record.Path)"
      }
    }
    Push-Location $dataRoot
    try {
      # The saved entries are database and database\\<file>. Restoring from
      # D:\\TianjiData (.) avoids the former database\\database path duplication.
      $restoreOutput = & icacls.exe "." /restore $snapshotPath /q 2>&1
      $restoreExit = $LASTEXITCODE
      if ($restoreExit -ne 0) {
        throw "icacls restore failed with exit code ${restoreExit}: $($restoreOutput -join ' ')"
      }
    } finally {
      Pop-Location
    }
    foreach ($record in @($manifest.AccessRules)) {
      if (-not (Test-Path -LiteralPath $record.Path)) { throw "ACL rollback target is missing: $($record.Path)" }
      $actual = (Get-Acl -LiteralPath $record.Path).GetSecurityDescriptorSddlForm([System.Security.AccessControl.AccessControlSections]::Access)
      if ($actual -ne $record.AccessSddl) { throw "ACL rollback verification failed: $($record.Path)" }
    }
    Write-RunLog "rollback=acl-restored path=$snapshotPath verified=true"
    return $true
  } catch {
    Write-RunLog "rollback=failed error=$($_.Exception.Message) manual_restore=Set-Location `"$dataRoot`"; icacls . /restore `"$snapshotPath`""
    return $false
  }
}

function Invoke-FormalColdBackup {
  $before = @(Get-ChildItem -LiteralPath (Join-Path $dataRoot "backups\batches") -Directory -ErrorAction Stop | Select-Object -ExpandProperty Name)
  & (Join-Path $PSScriptRoot "backup-tianji.ps1") -StopServices -RestartAfter -NoPause
  if (-not $?) { throw "Formal cold backup failed before database ACL changes." }
  $after = @(Get-ChildItem -LiteralPath (Join-Path $dataRoot "backups\batches") -Directory -ErrorAction Stop | Select-Object -ExpandProperty Name)
  $created = @($after | Where-Object { $_ -notin $before })
  if ($created.Count -lt 1) { throw "Formal cold backup completed without creating a new backup batch." }
  Write-RunLog "backup=created batches=$($created -join ',')"
}

function New-ExpectedAcl {
  param([Parameter(Mandatory = $true)][bool]$Directory)
  $acl = [System.Security.AccessControl.DirectorySecurity]::new()
  if (-not $Directory) { $acl = [System.Security.AccessControl.FileSecurity]::new() }
  $inheritance = if ($Directory) {
    [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
  } else {
    [System.Security.AccessControl.InheritanceFlags]::None
  }
  $propagation = [System.Security.AccessControl.PropagationFlags]::None
  $allow = [System.Security.AccessControl.AccessControlType]::Allow
  foreach ($entry in @(
    [pscustomobject]@{ Identity = "NT AUTHORITY\SYSTEM"; Rights = [System.Security.AccessControl.FileSystemRights]::FullControl },
    [pscustomobject]@{ Identity = "BUILTIN\Administrators"; Rights = [System.Security.AccessControl.FileSystemRights]::FullControl },
    [pscustomobject]@{ Identity = $expectedAccount; Rights = [System.Security.AccessControl.FileSystemRights]::Modify }
  )) {
    $rule = [System.Security.AccessControl.FileSystemAccessRule]::new($entry.Identity, $entry.Rights, $inheritance, $propagation, $allow)
    $acl.AddAccessRule($rule)
  }
  $acl.SetAccessRuleProtection($true, $false)
  return $acl
}

function Set-DatabaseAclBoundary {
  $items = @((Get-Item -LiteralPath $databasePath -Force)) + @(Get-ChildItem -LiteralPath $databasePath -Force)
  foreach ($item in $items) {
    $acl = New-ExpectedAcl -Directory $item.PSIsContainer
    Set-Acl -LiteralPath $item.FullName -AclObject $acl
  }
  $script:aclChanged = $true
  Write-RunLog "acl=applied path=$databasePath files=$($items.Count)"
}

function Assert-DatabaseAclBoundary {
  $items = @((Get-Item -LiteralPath $databasePath -Force)) + @(Get-ChildItem -LiteralPath $databasePath -Force)
  foreach ($item in $items) {
    $acl = Get-Acl -LiteralPath $item.FullName
    if (-not $acl.AreAccessRulesProtected) { throw "ACL inheritance remains enabled: $($item.FullName)" }
    $rules = @($acl.Access | Where-Object { $_.AccessControlType -eq "Allow" })
    foreach ($required in @("NT AUTHORITY\SYSTEM", "BUILTIN\Administrators", $expectedAccount)) {
      if (-not ($rules | Where-Object { $_.IdentityReference.Value -eq $required })) { throw "Required ACL principal is missing from $($item.FullName): $required" }
    }
    foreach ($disallowed in @("NT AUTHORITY\Authenticated Users", "BUILTIN\Users", "Everyone")) {
      if ($rules | Where-Object { $_.IdentityReference.Value -eq $disallowed -and (($_.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::Write) -or ($_.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::Modify) -or ($_.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::FullControl)) }) {
        throw "Disallowed write-capable principal remains on $($item.FullName): $disallowed"
      }
    }
  }
  Write-RunLog "acl=verified path=$databasePath"
}

function Test-DatabaseDirectoryProbe {
  $probe = Join-Path $databasePath ".r3-acl-probe-$timestamp.tmp"
  $renamed = "$probe.renamed"
  try {
    [IO.File]::WriteAllText($probe, "r3-acl-probe")
    [void][IO.File]::ReadAllText($probe)
    Move-Item -LiteralPath $probe -Destination $renamed
    Remove-Item -LiteralPath $renamed -Force
    Write-RunLog "probe=filesystem result=passed"
  } finally {
    Remove-Item -LiteralPath $probe -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $renamed -Force -ErrorAction SilentlyContinue
  }
}

function Test-SqliteAccess {
  $readOnlyCode = "const s=require('node:sqlite');const d=new s.DatabaseSync('D:/TianjiData/database/tianji.db',{readOnly:true});const q=d.prepare('PRAGMA quick_check').all().map(r=>Object.values(r)[0]);const f=d.prepare('PRAGMA foreign_key_check').all().length;d.close();if(q.length!==1||q[0]!=='ok'||f!==0)throw new Error('SQLite read-only validation failed');"
  & "E:\node.exe" -e $readOnlyCode
  if ($LASTEXITCODE -ne 0) { throw "SQLite read-only validation failed." }

  $probeId = [guid]::NewGuid().ToString("N")
  $probeBase = Join-Path $databasePath ".r3-sqlite-probe-$probeId.sqlite"
  $probePath = $probeBase.Replace("\\", "/")
  $tableName = "probe_$probeId"
  if (Test-Path -LiteralPath $probeBase) { throw "Refusing to reuse an existing SQLite probe file: $probeBase" }
  $writeProbeCode = "const s=require('node:sqlite');const p='$probePath';const t='$tableName';const d=new s.DatabaseSync(p);try{d.exec('PRAGMA journal_mode=WAL; CREATE TABLE '+t+' (id INTEGER); INSERT INTO '+t+' VALUES (1);');const count=d.prepare('SELECT COUNT(*) AS count FROM '+t).get().count;if(count!==1)throw new Error('SQLite probe row validation failed');}finally{d.close();}"
  try {
    & "E:\node.exe" -e $writeProbeCode
    if ($LASTEXITCODE -ne 0) { throw "SQLite isolated write probe failed." }
    Write-RunLog "probe=sqlite result=passed"
  } finally {
    Remove-Item -LiteralPath $probeBase -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath "$probeBase-wal" -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath "$probeBase-shm" -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath "$probeBase-journal" -Force -ErrorAction SilentlyContinue
  }
}

function Test-TianjiHealth {
  $urls = @(
    "http://127.0.0.1:3000/login",
    "http://127.0.0.1:3001/api/health",
    "http://192.168.13.126:3000/login",
    "http://192.168.13.126:3001/api/health"
  )
  foreach ($url in $urls) {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 15
    if ([int]$response.StatusCode -ne 200) { throw "Health check failed for $url with status $($response.StatusCode)." }
  }
  $state = Get-Content -LiteralPath $runtimeStatePath -Raw | ConvertFrom-Json
  foreach ($processId in @($state.frontend.pid, $state.backend.pid, $state.watchdog.pid)) {
    if (-not (Get-Process -Id ([int]$processId) -ErrorAction SilentlyContinue)) { throw "Recorded Tianji process is not running: $processId" }
  }
  foreach ($port in 3000, 3001) {
    if (-not (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)) { throw "Tianji is not listening on TCP port $port." }
  }
  Write-RunLog "health=passed"
}

function Invoke-FormalRestart {
  & (Join-Path $PSScriptRoot "stop-tianji.ps1") -NoPause
  if (-not $?) { throw "Formal Tianji stop failed." }
  & (Join-Path $PSScriptRoot "start-tianji.ps1") -NoBrowser
  if (-not $?) { throw "Formal Tianji start failed." }
  Write-RunLog "lifecycle=stop-start result=passed"
}

function Assert-NoRecentSqliteAclErrors {
  $patterns = 'SQLITE_READONLY|SQLITE_CANTOPEN|permission denied|access denied'
  $logs = @(
    (Join-Path $dataRoot "logs\runtime-state.json"),
    (Join-Path $env:TEMP "tianji-runtime\backend.err.log")
  )
  foreach ($path in $logs) {
    if (Test-Path -LiteralPath $path) {
      $matches = Get-Content -LiteralPath $path -Tail 100 -ErrorAction SilentlyContinue | Select-String -Pattern $patterns -CaseSensitive:$false
      if ($matches) { throw "Recent SQLite or permission error found in $path." }
    }
  }
  Write-RunLog "logs=sqlite-acl-errors-none"
}

try {
  New-Item -ItemType Directory -Path (Split-Path -Parent $logPath) -Force | Out-Null
  Write-RunLog "run=$runId action=begin"
  Assert-Administrator
  Assert-TianjiRuntimeOwner
  if (-not (Test-Path -LiteralPath $databasePath -PathType Container) -or -not (Test-Path -LiteralPath $databaseFile -PathType Leaf)) {
    throw "Expected production database path is missing."
  }
  Save-DatabaseAclSnapshot
  Invoke-FormalColdBackup
  Set-DatabaseAclBoundary
  Assert-DatabaseAclBoundary
  Test-DatabaseDirectoryProbe
  Test-SqliteAccess
  Invoke-FormalRestart
  Test-TianjiHealth
  Test-SqliteAccess
  Assert-NoRecentSqliteAclErrors
  Write-RunLog "result=PASS run=$runId snapshot=$snapshotPath"
  [pscustomobject]@{ Result = "PASS"; RunId = $runId; Snapshot = $snapshotPath; DatabasePath = $databasePath } | ConvertTo-Json
} catch {
  $failure = $_.Exception.Message
  Write-RunLog "result=FAILED error=$failure"
  $rollbackSucceeded = Restore-DatabaseAclSnapshot
  $healthyAfterRollback = $false
  try {
    Test-TianjiHealth
    $healthyAfterRollback = $true
  } catch {
    Write-RunLog "rollback=health-check-failed error=$($_.Exception.Message)"
  }
  if ($script:aclChanged -and -not $healthyAfterRollback) {
    try {
      & (Join-Path $PSScriptRoot "start-tianji.ps1") -NoBrowser
      Write-RunLog "rollback=service-start-attempted"
    } catch {
      Write-RunLog "rollback=service-start-failed error=$($_.Exception.Message)"
    }
  }
  if ($rollbackSucceeded) {
    Write-RunLog "result=ROLLBACK run=$runId snapshot=$snapshotPath"
  } else {
    Write-RunLog "result=ROLLBACK_FAILED run=$runId snapshot=$snapshotPath"
  }
  throw
}
