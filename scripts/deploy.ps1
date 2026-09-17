param([Parameter(Mandatory=$true)][string]$Release,[switch]$FinalizeRunningRelease,[switch]$EnsureWatchdog,[switch]$RecoverRunningRelease)
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Import-Module (Join-Path $PSScriptRoot 'release-common.psm1') -Force
$releaseRoot=(Resolve-Path (Get-TianjiReleasePath $Release)).Path
$evidence=New-TianjiDeploymentEvidence $Release;$log=Join-Path $evidence.Path 'deploy.stdout.log';$err=Join-Path $evidence.Path 'deploy.stderr.log'
function Invoke-Logged { param([scriptblock]$Command) & $Command 1>>$log 2>>$err;if($LASTEXITCODE -ne 0){throw "Command failed: $LASTEXITCODE"} }
$oldRuntime=$null;$oldReleaseRoot=$null;$oldStopped=$false;$newStartAttempted=$false;$formalEnvironment=$null
function Get-FormalEnvironmentValue {
  param([Parameter(Mandatory=$true)][string]$Name)
  $envFile=Join-Path $root 'apps\server\.env'
  if(-not(Test-Path -LiteralPath $envFile)){throw "DEPLOY_BLOCKED`nFormal environment configuration is missing."}
  foreach($line in Get-Content -LiteralPath $envFile){
    $trimmed=$line.Trim()
    if(-not $trimmed -or $trimmed.StartsWith('#')){continue}
    $separator=$trimmed.IndexOf('=')
    if($separator -lt 1){continue}
    if($trimmed.Substring(0,$separator).Trim() -eq $Name){return $trimmed.Substring($separator + 1).Trim()}
  }
  return $null
}
function Get-FormalLifecycleEnvironment {
  param([Parameter(Mandatory=$true)][string]$RuntimeStatePath)
  $configuredDataRoot=Get-FormalEnvironmentValue 'TIANJI_DATA_ROOT'
  if(-not $configuredDataRoot){throw "DEPLOY_BLOCKED`nFormal TIANJI_DATA_ROOT is missing from production configuration."}
  $dataRoot=[IO.Path]::GetFullPath($configuredDataRoot)
  $testRoot=[IO.Path]::GetFullPath('D:\TianjiTestData')
  if($dataRoot.TrimEnd('\') -eq $testRoot.TrimEnd('\')){throw "DEPLOY_BLOCKED`nFormal lifecycle data root resolves to the fixed test data directory."}
  $databasePath=Join-Path $dataRoot 'database\tianji.db'
  if(-not(Test-Path -LiteralPath $databasePath)){throw "DEPLOY_BLOCKED`nFormal database is missing under the configured data root."}
  $expectedRuntimeState=Join-Path $dataRoot 'logs\runtime-state.json'
  if([IO.Path]::GetFullPath($RuntimeStatePath) -ne [IO.Path]::GetFullPath($expectedRuntimeState)){throw "DEPLOY_BLOCKED`nFormal runtime-state does not belong to the configured data root."}
  $configuredDatabaseUrl=Get-FormalEnvironmentValue 'DATABASE_URL'
  $databaseUrl='file:' + $databasePath.Replace('\','/')
  if($configuredDatabaseUrl -and $configuredDatabaseUrl.TrimEnd('/') -ne $databaseUrl.TrimEnd('/')){throw "DEPLOY_BLOCKED`nFormal DATABASE_URL does not match the configured data root."}
  $values=[ordered]@{
    TIANJI_DATA_ROOT=$dataRoot
    DATABASE_URL=$databaseUrl
    JWT_SECRET=(Get-FormalEnvironmentValue 'JWT_SECRET')
    JWT_EXPIRES_IN=(Get-FormalEnvironmentValue 'JWT_EXPIRES_IN')
    ALLOWED_ORIGINS=(Get-FormalEnvironmentValue 'ALLOWED_ORIGINS')
    NODE_ENV=(Get-FormalEnvironmentValue 'NODE_ENV')
  }
  foreach($name in @('JWT_SECRET','ALLOWED_ORIGINS','NODE_ENV')){if(-not $values[$name]){throw "DEPLOY_BLOCKED`nFormal $name is missing from production configuration."}}
  Write-Host "DEPLOY_ENV_DIAGNOSTIC TIANJI_DATA_ROOT=present resolved=$dataRoot classification=formal"
  [pscustomobject]@{DataRoot=$dataRoot;DatabasePath=$databasePath;Values=$values}
}
function Invoke-FormalLifecycleScript {
  param([Parameter(Mandatory=$true)][string]$ScriptPath,[string[]]$Arguments=@())
  if(-not $formalEnvironment){throw 'DEPLOY_BLOCKED: formal lifecycle environment was not initialized.'}
  $previous=@{}
  try {
    foreach($entry in $formalEnvironment.Values.GetEnumerator()){
      $previous[$entry.Key]=[Environment]::GetEnvironmentVariable($entry.Key,'Process')
      [Environment]::SetEnvironmentVariable($entry.Key,$entry.Value,'Process')
    }
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $ScriptPath @Arguments
    if($LASTEXITCODE -ne 0){throw "Lifecycle script failed with exit code ${LASTEXITCODE}: $ScriptPath"}
  } finally {
    foreach($entry in $previous.GetEnumerator()){[Environment]::SetEnvironmentVariable($entry.Key,$entry.Value,'Process')}
  }
}
function Wait-FormalWatchdog {
  param([Parameter(Mandatory=$true)][string]$RuntimeStatePath,[Parameter(Mandatory=$true)][string]$ExpectedRoot,[int]$TimeoutSeconds=20)
  $deadline=(Get-Date).AddSeconds($TimeoutSeconds)
  while((Get-Date)-lt $deadline){
    if(Test-Path -LiteralPath $RuntimeStatePath){
      $state=Get-Content -LiteralPath $RuntimeStatePath -Raw|ConvertFrom-Json
      $record=$state.watchdog
      if($state.projectRoot -eq $ExpectedRoot -and $state.watchdogStatus -eq 'running' -and $record -and $record.pid -and (Get-Process -Id ([int]$record.pid) -ErrorAction SilentlyContinue)){return $true}
    }
    Start-Sleep -Milliseconds 500
  }
  return $false
}
function Restore-PreviousRelease {
  if (-not $oldStopped -or -not $oldReleaseRoot) { return }
  $newStop = Join-Path $releaseRoot 'scripts\stop-tianji.ps1'
  if (Test-Path -LiteralPath $newStop) { Invoke-FormalLifecycleScript -ScriptPath $newStop -Arguments @('-NoPause') 1>>$log 2>>$err }
  Invoke-FormalLifecycleScript -ScriptPath (Join-Path $oldReleaseRoot 'scripts\start-tianji.ps1') -Arguments @('-NoBrowser') 1>>$log 2>>$err
  if (-not(Wait-TianjiHttp200 'http://127.0.0.1:3001/api/health' 45) -or -not(Wait-TianjiHttp200 'http://127.0.0.1:3000/login' 75)) { throw 'Automatic rollback failed to restore the previous release.' }
}
try {
  $manifest=Assert-TianjiRelease $Release
  if($FinalizeRunningRelease -or $EnsureWatchdog -or $RecoverRunningRelease){
    $runtimeStatePath='D:\TianjiData\logs\runtime-state.json'
    if(-not(Test-Path -LiteralPath $runtimeStatePath)){throw "DEPLOY_INCOMPLETE`nFormal runtime-state is missing."}
    $formalEnvironment=Get-FormalLifecycleEnvironment -RuntimeStatePath $runtimeStatePath
    $runningState=Get-Content $runtimeStatePath -Raw|ConvertFrom-Json
    $runningRoot=(Resolve-Path $runningState.projectRoot).Path
    if($runningRoot -ne $releaseRoot){throw "DEPLOY_INCOMPLETE`nRunning release is not the requested release: $runningRoot"}
    if($RecoverRunningRelease){
      Invoke-FormalLifecycleScript -ScriptPath (Join-Path $releaseRoot 'scripts\start-tianji.ps1') -Arguments @('-NoBrowser') 1>>$log 2>>$err
    }
    if(-not(Wait-TianjiHttp200 'http://127.0.0.1:3001/api/health' 45) -or -not(Wait-TianjiHttp200 'http://127.0.0.1:3000/login' 75)){throw 'DEPLOY_INCOMPLETE`nRunning release health check failed.'}
    if($EnsureWatchdog -and -not(Wait-FormalWatchdog -RuntimeStatePath $runtimeStatePath -ExpectedRoot $releaseRoot -TimeoutSeconds 1)){
      Invoke-FormalLifecycleScript -ScriptPath (Join-Path $releaseRoot 'scripts\start-tianji.ps1') -Arguments @('-NoBrowser') 1>>$log 2>>$err
    }
    if(-not(Wait-FormalWatchdog -RuntimeStatePath $runtimeStatePath -ExpectedRoot $releaseRoot)){throw 'DEPLOY_INCOMPLETE`nFormal watchdog is not healthy for the running release.'}
    if($RecoverRunningRelease -and -not $FinalizeRunningRelease){Write-TianjiDeploymentEvent $evidence.Path 'running-release-recovered' @{release=$Release;releaseRoot=$releaseRoot};Write-Host 'RUNNING_RELEASE_RECOVERED';return}
    if($EnsureWatchdog -and -not $FinalizeRunningRelease){Write-TianjiDeploymentEvent $evidence.Path 'watchdog-recovered' @{release=$Release;releaseRoot=$releaseRoot};Write-Host 'WATCHDOG_READY';return}
    [ordered]@{deploymentId=$evidence.Id;release=$Release;releaseRoot=$releaseRoot;status='PASS';finalizedExistingRelease=$true;completedAt=(Get-Date).ToUniversalTime().ToString('o')}|ConvertTo-Json|Set-Content (Join-Path $evidence.Path 'deployment.json') -Encoding utf8
    Write-TianjiDeploymentEvent $evidence.Path 'running-release-finalized' @{release=$Release;releaseRoot=$releaseRoot}
    Write-Host 'DEPLOY_PASS'
    return
  }
  Invoke-Logged { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'deploy-check.ps1') -Release $Release }
  # SQLite Online Backup creates and verifies a consistent snapshot while the
  # current release remains healthy. It also proves that snapshot in isolation.
  Invoke-Logged { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'production-backup-gate.ps1') -Release $Release -EvidencePath $evidence.Path }
  $backupGate=Get-Content (Join-Path $evidence.Path 'backup-gate.json') -Raw|ConvertFrom-Json
  if($backupGate.status -ne 'PASS'){throw 'Production online backup gate did not pass.'}
  $databaseBackup=$backupGate.databaseBackup
  $runtimeStatePath='D:\TianjiData\logs\runtime-state.json'
  if(-not(Test-Path -LiteralPath $runtimeStatePath)){throw "DEPLOY_BLOCKED`nFormal runtime-state is missing."}
  $formalEnvironment=Get-FormalLifecycleEnvironment -RuntimeStatePath $runtimeStatePath
  $oldRuntime=Get-Content $runtimeStatePath -Raw|ConvertFrom-Json
  $oldReleaseRoot=(Resolve-Path $oldRuntime.projectRoot).Path
  if(-not $oldReleaseRoot.StartsWith('D:\TianjiData\releases\',[StringComparison]::OrdinalIgnoreCase)){throw "DEPLOY_BLOCKED`nFormal runtime root is invalid: $oldReleaseRoot"}
  $oldStop=Join-Path $oldReleaseRoot 'scripts\stop-tianji.ps1'
  if(-not(Test-Path -LiteralPath $oldStop)){throw "DEPLOY_BLOCKED`nOld release stop script is missing: $oldStop"}
  try { Invoke-FormalLifecycleScript -ScriptPath $oldStop -Arguments @('-NoPause') 1>>$log 2>>$err } catch { throw "DEPLOY_BLOCKED`nOld release failed to stop." }
  $oldStopped=$true
  foreach($port in 3000,3001){if(-not(Test-TianjiPortReleased $port)){throw "Port $port was not released; refusing release switch."}}
  Write-TianjiDeploymentEvent $evidence.Path 'release-validated' @{release=$Release;gitCommit=$manifest.gitCommit;releaseRoot=$releaseRoot}
  Write-TianjiDeploymentEvent $evidence.Path 'database-backup-verified' @{path=$databaseBackup;attachments=$backupGate.attachmentsBackup;restoreRoot=$backupGate.restoreRoot}
  $newStartAttempted=$true
  Invoke-FormalLifecycleScript -ScriptPath (Join-Path $releaseRoot 'scripts\start-tianji.ps1') -Arguments @('-NoBrowser') 1>>$log 2>>$err
  if(-not(Wait-TianjiHttp200 'http://127.0.0.1:3001/api/health' 45)){throw 'Backend health check failed'}
  if(-not(Wait-TianjiHttp200 'http://127.0.0.1:3000/login' 75)){throw 'Frontend health check failed'}
  $runtimeState=Get-Content 'D:\TianjiData\logs\runtime-state.json' -Raw|ConvertFrom-Json
  if($runtimeState.projectRoot -ne $releaseRoot){throw "Runtime root is not the selected release: $($runtimeState.projectRoot)"}
  if(-not(Wait-FormalWatchdog -RuntimeStatePath $runtimeStatePath -ExpectedRoot $releaseRoot)){throw 'DEPLOY_INCOMPLETE`nFormal watchdog failed to start for the selected release.'}
  [ordered]@{deploymentId=$evidence.Id;release=$Release;releaseRoot=$releaseRoot;status='PASS';databaseBackup=$databaseBackup;completedAt=(Get-Date).ToUniversalTime().ToString('o')}|ConvertTo-Json|Set-Content (Join-Path $evidence.Path 'deployment.json') -Encoding utf8
  Write-Host 'DEPLOY_PASS'
} catch {
  if($oldStopped){try { Restore-PreviousRelease } catch { Write-TianjiDeploymentEvent $evidence.Path 'rollback-failed' @{error=$_.Exception.Message} }}
  Write-TianjiDeploymentEvent $evidence.Path 'failed' @{error=$_.Exception.Message}
  [ordered]@{deploymentId=$evidence.Id;release=$Release;status='FAIL';error=$_.Exception.Message}|ConvertTo-Json|Set-Content (Join-Path $evidence.Path 'deployment.json') -Encoding utf8
  Write-Host 'DEPLOY_FAIL';throw
}
