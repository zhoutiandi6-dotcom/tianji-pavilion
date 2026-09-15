param([Parameter(Mandatory=$true)][string]$Release)
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Import-Module (Join-Path $PSScriptRoot 'release-common.psm1') -Force
$releaseRoot=(Resolve-Path (Get-TianjiReleasePath $Release)).Path
$evidence=New-TianjiDeploymentEvidence $Release;$log=Join-Path $evidence.Path 'deploy.stdout.log';$err=Join-Path $evidence.Path 'deploy.stderr.log'
function Invoke-Logged { param([scriptblock]$Command) & $Command 1>>$log 2>>$err;if($LASTEXITCODE -ne 0){throw "Command failed: $LASTEXITCODE"} }
try {
  $manifest=Assert-TianjiRelease $Release
  Invoke-Logged { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'deploy-check.ps1') -Release $Release }
  # Backup remains an operational action. Application processes are never copied
  # to or launched from this workspace; the release starts itself below.
  Invoke-Logged { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'backup-tianji.ps1') -StopServices -NoPause }
  $databaseBackup=(Get-ChildItem 'D:\TianjiData\backups\batches' -Directory|Sort-Object Name -Descending|Select-Object -First 1).FullName
  if(-not $databaseBackup){throw 'No verified database backup was found after backup command.'}
  foreach($port in 3000,3001){if(-not(Test-TianjiPortReleased $port)){throw "Port $port was not released; refusing release switch."}}
  Write-TianjiDeploymentEvent $evidence.Path 'release-validated' @{release=$Release;gitCommit=$manifest.gitCommit;releaseRoot=$releaseRoot}
  Write-TianjiDeploymentEvent $evidence.Path 'database-backup-verified' @{path=$databaseBackup}
  Invoke-Logged { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $releaseRoot 'scripts\start-tianji.ps1') -NoBrowser }
  if(-not(Wait-TianjiHttp200 'http://127.0.0.1:3001/api/health' 45)){throw 'Backend health check failed'}
  if(-not(Wait-TianjiHttp200 'http://127.0.0.1:3000/login' 75)){throw 'Frontend health check failed'}
  $runtimeState=Get-Content 'D:\TianjiData\logs\runtime-state.json' -Raw|ConvertFrom-Json
  if($runtimeState.projectRoot -ne $releaseRoot){throw "Runtime root is not the selected release: $($runtimeState.projectRoot)"}
  [ordered]@{deploymentId=$evidence.Id;release=$Release;releaseRoot=$releaseRoot;status='PASS';databaseBackup=$databaseBackup;completedAt=(Get-Date).ToUniversalTime().ToString('o')}|ConvertTo-Json|Set-Content (Join-Path $evidence.Path 'deployment.json') -Encoding utf8
  Write-Host 'DEPLOY_PASS'
} catch {
  Write-TianjiDeploymentEvent $evidence.Path 'failed' @{error=$_.Exception.Message}
  [ordered]@{deploymentId=$evidence.Id;release=$Release;status='FAIL';error=$_.Exception.Message}|ConvertTo-Json|Set-Content (Join-Path $evidence.Path 'deployment.json') -Encoding utf8
  Write-Host 'DEPLOY_FAIL';throw
}
