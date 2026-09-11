param([Parameter(Mandatory=$true)][string]$Deployment)
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Import-Module (Join-Path $PSScriptRoot 'release-common.psm1') -Force
$evidence=Get-TianjiDeploymentPath $Deployment
$oldServer=Join-Path $evidence 'previous/server/dist'; $oldWeb=Join-Path $evidence 'previous/web/.next'
if(-not(Test-Path $oldServer) -or -not(Test-Path $oldWeb)){throw 'Deployment backup is incomplete; refusing rollback.'}
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'stop-tianji.ps1') -NoPause
foreach($port in 3000,3001){if(-not(Test-TianjiPortReleased $port)){throw "Port $port was not released; refusing rollback."}}
$liveServer=Join-Path $root 'apps/server/dist';$liveWeb=Join-Path $root 'apps/web/.next'
$staging=Join-Path $evidence 'restore-stage'; Copy-TianjiPhysicalDirectory $oldServer (Join-Path $staging 'server/dist'); Copy-TianjiPhysicalDirectory $oldWeb (Join-Path $staging 'web/.next')
[IO.Directory]::Move($liveServer,"$liveServer.failed-$Deployment");[IO.Directory]::Move($liveWeb,"$liveWeb.failed-$Deployment");[IO.Directory]::Move((Join-Path $staging 'server/dist'),$liveServer);[IO.Directory]::Move((Join-Path $staging 'web/.next'),$liveWeb)
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'start-tianji.ps1') -NoBrowser
if(-not(Wait-TianjiHttp200 'http://127.0.0.1:3001/api/health' 30) -or -not(Wait-TianjiHttp200 'http://127.0.0.1:3000/login' 30)){throw 'Rollback startup check failed'}
Write-Host 'ROLLBACK_PASS'
