param([Parameter(Mandatory=$true)][string]$Release,[switch]$ApproveMigrations)
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Import-Module (Join-Path $PSScriptRoot 'release-common.psm1') -Force
$manifest=Assert-TianjiRelease $Release
$evidence=New-TianjiDeploymentEvidence $Release
$log=Join-Path $evidence.Path 'deploy.stdout.log'; $err=Join-Path $evidence.Path 'deploy.stderr.log'
$liveServer=Join-Path $root 'apps/server/dist'; $liveWeb=Join-Path $root 'apps/web/.next'
$oldServer=Join-Path $evidence.Path 'previous/server/dist'; $oldWeb=Join-Path $evidence.Path 'previous/web/.next'
$stageServer=Join-Path $root "apps/server/dist.release-$($evidence.Id)"; $stageWeb=Join-Path $root "apps/web/.next.release-$($evidence.Id)"
$switched=$false
function Invoke-Logged { param([scriptblock]$Command) & $Command 1>>$log 2>>$err; if($LASTEXITCODE -ne 0){throw "Command failed: $LASTEXITCODE"} }
try {
  $manifest | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $evidence.Path 'release.json') -Encoding utf8
  Write-TianjiDeploymentEvent $evidence.Path 'release-validated' @{release=$Release;gitCommit=$manifest.gitCommit}
  # A verified cold database backup is mandatory and uses the existing project backup workflow.
  Invoke-Logged { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'backup-tianji.ps1') -StopServices -NoPause }
  $databaseBackup=(Get-ChildItem 'D:\TianjiData\backups\batches' -Directory | Sort-Object Name -Descending | Select-Object -First 1).FullName
  if(-not $databaseBackup){throw 'No verified database backup was found after backup command.'}
  Write-TianjiDeploymentEvent $evidence.Path 'database-backup-verified' @{path=$databaseBackup}
  foreach($port in 3000,3001){if(-not (Test-TianjiPortReleased $port)){throw "Port $port was not released; refusing artifact switch."}}
  Copy-TianjiPhysicalDirectory $liveServer $oldServer; Copy-TianjiPhysicalDirectory $liveWeb $oldWeb
  Copy-TianjiPhysicalDirectory (Join-Path (Get-TianjiReleasePath $Release) 'server/dist') $stageServer
  Copy-TianjiPhysicalDirectory (Join-Path (Get-TianjiReleasePath $Release) 'web/.next') $stageWeb
  if((Get-TianjiSha256 (Join-Path $stageServer 'main.js')) -ne $manifest.hashes.serverMain){throw 'Staged server hash mismatch'}
  if((Get-TianjiSha256 (Join-Path $stageWeb 'standalone/apps/web/server.js')) -ne $manifest.hashes.webServer){throw 'Staged web hash mismatch'}
  [IO.Directory]::Move($liveServer,"$liveServer.previous-$($evidence.Id)"); [IO.Directory]::Move($liveWeb,"$liveWeb.previous-$($evidence.Id)"); [IO.Directory]::Move($stageServer,$liveServer); [IO.Directory]::Move($stageWeb,$liveWeb); $switched=$true
  Write-TianjiDeploymentEvent $evidence.Path 'artifacts-switched' @{}
  $previousDatabaseUrl=$env:DATABASE_URL; $env:DATABASE_URL="file:D:/TianjiData/database/tianji.db"
  try { & npx.cmd prisma migrate status --schema (Join-Path (Get-TianjiReleasePath $Release) 'server/prisma/schema.prisma') 1>>$log 2>>$err; $migrationStatus=$LASTEXITCODE
    if($migrationStatus -ne 0){if(-not $ApproveMigrations){throw 'Migration status is not clean. Re-run only after review with -ApproveMigrations.'}; & npx.cmd prisma migrate deploy --schema (Join-Path (Get-TianjiReleasePath $Release) 'server/prisma/schema.prisma') 1>>$log 2>>$err; if($LASTEXITCODE -ne 0){throw 'Production migration failed'}}
  } finally {$env:DATABASE_URL=$previousDatabaseUrl}
  Invoke-Logged { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'start-tianji.ps1') -NoBrowser }
  if(-not (Wait-TianjiHttp200 'http://127.0.0.1:3001/api/health' 30)){throw 'Backend health check failed'}
  if(-not (Wait-TianjiHttp200 'http://127.0.0.1:3000/login' 30)){throw 'Frontend login check failed'}
  Copy-Item "$env:TEMP\tianji-runtime\*.log" $evidence.Path -Force -ErrorAction SilentlyContinue
  [ordered]@{deploymentId=$evidence.Id;release=$Release;status='PASS';databaseBackup=$databaseBackup;artifactBackup=$evidence.Path;completedAt=(Get-Date).ToUniversalTime().ToString('o')}|ConvertTo-Json|Set-Content (Join-Path $evidence.Path 'deployment.json') -Encoding utf8
  Write-Host 'DEPLOY_PASS'
} catch {
  Write-TianjiDeploymentEvent $evidence.Path 'failed' @{error=$_.Exception.Message}
  if($switched){ & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'rollback.ps1') -Deployment $evidence.Id 1>>$log 2>>$err }
  [ordered]@{deploymentId=$evidence.Id;release=$Release;status='FAIL';error=$_.Exception.Message}|ConvertTo-Json|Set-Content (Join-Path $evidence.Path 'deployment.json') -Encoding utf8
  Write-Host 'DEPLOY_FAIL'; throw
}
