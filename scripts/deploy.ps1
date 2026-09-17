param([Parameter(Mandatory=$true)][string]$Release)
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Import-Module (Join-Path $PSScriptRoot 'release-common.psm1') -Force
$releaseRoot=(Resolve-Path (Get-TianjiReleasePath $Release)).Path
$evidence=New-TianjiDeploymentEvidence $Release;$log=Join-Path $evidence.Path 'deploy.stdout.log';$err=Join-Path $evidence.Path 'deploy.stderr.log'
function Invoke-Logged { param([scriptblock]$Command) & $Command 1>>$log 2>>$err;if($LASTEXITCODE -ne 0){throw "Command failed: $LASTEXITCODE"} }
$oldRuntime=$null;$oldReleaseRoot=$null;$oldStopped=$false;$newStartAttempted=$false
function Restore-PreviousRelease {
  if (-not $oldStopped -or -not $oldReleaseRoot) { return }
  $newStop = Join-Path $releaseRoot 'scripts\stop-tianji.ps1'
  if (Test-Path -LiteralPath $newStop) { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $newStop -NoPause 1>>$log 2>>$err }
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $oldReleaseRoot 'scripts\start-tianji.ps1') -NoBrowser 1>>$log 2>>$err
  if ($LASTEXITCODE -ne 0 -or -not(Wait-TianjiHttp200 'http://127.0.0.1:3001/api/health' 45) -or -not(Wait-TianjiHttp200 'http://127.0.0.1:3000/login' 75)) { throw 'Automatic rollback failed to restore the previous release.' }
}
try {
  $manifest=Assert-TianjiRelease $Release
  Invoke-Logged { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'deploy-check.ps1') -Release $Release }
  # SQLite Online Backup creates and verifies a consistent snapshot while the
  # current release remains healthy. It also proves that snapshot in isolation.
  Invoke-Logged { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'production-backup-gate.ps1') -Release $Release -EvidencePath $evidence.Path }
  $backupGate=Get-Content (Join-Path $evidence.Path 'backup-gate.json') -Raw|ConvertFrom-Json
  if($backupGate.status -ne 'PASS'){throw 'Production online backup gate did not pass.'}
  $databaseBackup=$backupGate.databaseBackup
  $runtimeStatePath='D:\TianjiData\logs\runtime-state.json'
  if(-not(Test-Path -LiteralPath $runtimeStatePath)){throw "DEPLOY_BLOCKED`nFormal runtime-state is missing."}
  $oldRuntime=Get-Content $runtimeStatePath -Raw|ConvertFrom-Json
  $oldReleaseRoot=(Resolve-Path $oldRuntime.projectRoot).Path
  if(-not $oldReleaseRoot.StartsWith('D:\TianjiData\releases\',[StringComparison]::OrdinalIgnoreCase)){throw "DEPLOY_BLOCKED`nFormal runtime root is invalid: $oldReleaseRoot"}
  $oldStop=Join-Path $oldReleaseRoot 'scripts\stop-tianji.ps1'
  if(-not(Test-Path -LiteralPath $oldStop)){throw "DEPLOY_BLOCKED`nOld release stop script is missing: $oldStop"}
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $oldStop -NoPause 1>>$log 2>>$err
  if($LASTEXITCODE -ne 0){throw "DEPLOY_BLOCKED`nOld release failed to stop."}
  $oldStopped=$true
  foreach($port in 3000,3001){if(-not(Test-TianjiPortReleased $port)){throw "Port $port was not released; refusing release switch."}}
  Write-TianjiDeploymentEvent $evidence.Path 'release-validated' @{release=$Release;gitCommit=$manifest.gitCommit;releaseRoot=$releaseRoot}
  Write-TianjiDeploymentEvent $evidence.Path 'database-backup-verified' @{path=$databaseBackup;attachments=$backupGate.attachmentsBackup;restoreRoot=$backupGate.restoreRoot}
  $newStartAttempted=$true
  Invoke-Logged { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $releaseRoot 'scripts\start-tianji.ps1') -NoBrowser }
  if(-not(Wait-TianjiHttp200 'http://127.0.0.1:3001/api/health' 45)){throw 'Backend health check failed'}
  if(-not(Wait-TianjiHttp200 'http://127.0.0.1:3000/login' 75)){throw 'Frontend health check failed'}
  $runtimeState=Get-Content 'D:\TianjiData\logs\runtime-state.json' -Raw|ConvertFrom-Json
  if($runtimeState.projectRoot -ne $releaseRoot){throw "Runtime root is not the selected release: $($runtimeState.projectRoot)"}
  [ordered]@{deploymentId=$evidence.Id;release=$Release;releaseRoot=$releaseRoot;status='PASS';databaseBackup=$databaseBackup;completedAt=(Get-Date).ToUniversalTime().ToString('o')}|ConvertTo-Json|Set-Content (Join-Path $evidence.Path 'deployment.json') -Encoding utf8
  Write-Host 'DEPLOY_PASS'
} catch {
  if($oldStopped){try { Restore-PreviousRelease } catch { Write-TianjiDeploymentEvent $evidence.Path 'rollback-failed' @{error=$_.Exception.Message} }}
  Write-TianjiDeploymentEvent $evidence.Path 'failed' @{error=$_.Exception.Message}
  [ordered]@{deploymentId=$evidence.Id;release=$Release;status='FAIL';error=$_.Exception.Message}|ConvertTo-Json|Set-Content (Join-Path $evidence.Path 'deployment.json') -Encoding utf8
  Write-Host 'DEPLOY_FAIL';throw
}
