param(
  [switch]$NoBrowser,
  [int]$FrontendPort = 3000,
  [int]$BackendPort = 3001,
  [string]$DataRoot,
  [string]$RuntimeDirectory,
  [string]$JwtSecret,
  [string]$AllowedOrigins,
  [switch]$SkipWatchdog
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Import-Module (Join-Path $PSScriptRoot "tianji-runtime.psm1") -Force -DisableNameChecking
if ($RuntimeDirectory) { Set-TianjiRuntimeDirectory -Path $RuntimeDirectory }

function Wait-TianjiEndpoint { param([string]$Url, [int]$TimeoutSeconds) $deadline=(Get-Date).AddSeconds($TimeoutSeconds); while((Get-Date)-lt $deadline){if(Test-TianjiEndpoint -Url $Url){return $true};Start-Sleep -Seconds 2};return $false }
function Get-ServiceUrl { param([string]$Service) if($Service -eq 'frontend'){return "http://127.0.0.1:$FrontendPort/login"};return "http://127.0.0.1:$BackendPort/api/health" }
function Assert-TianjiPortAvailable { param([int]$Port,$OwnedRecord) $occupant=Get-TianjiPortOccupant -Port $Port;if(-not $occupant){return};if($OwnedRecord -and (Test-TianjiRecordedProcess -Record $OwnedRecord) -and $occupant.Pid -eq [int]$OwnedRecord.pid){return};throw "Port $Port is occupied by PID $($occupant.Pid)." }
function Assert-TianjiReleaseArtifacts {
  foreach($relative in @('apps/server/dist/main.js','apps/web/.next/standalone/apps/web/server.js','node_modules/@nestjs/core','node_modules/@prisma/client','node_modules/.prisma/client')){
    if(-not(Test-Path -LiteralPath (Join-Path $root $relative))){throw "Release artifact is missing: $relative"}
  }
}
function Start-Or-ReuseTianjiService {
  param([ValidateSet('frontend','backend')][string]$Service,[int]$Port,$State)
  $url=Get-ServiceUrl $Service;$record=$State.$Service;$healthy=Test-TianjiEndpoint -Url $url;$owned=Test-TianjiRecordedProcess -Record $record
  if($healthy -and $owned){return}
  if($healthy -and -not $owned){throw "Port $Port is healthy but is not owned by this release."}
  if($owned){Stop-TianjiRecordedProcess -Record $record -Label $Service -Root $root|Out-Null}
  Assert-TianjiPortAvailable -Port $Port -OwnedRecord $null
  $State.$Service=Start-TianjiServiceProcess -Service $Service -Root $root -Port $Port
  $timeout=if($Service -eq 'frontend'){75}else{45}
  if(-not(Wait-TianjiEndpoint -Url $url -TimeoutSeconds $timeout)){throw "Tianji $Service failed health check from release $root."}
}

$mutex=$null
$oldDataRoot=$env:TIANJI_DATA_ROOT
$oldJwtSecret=$env:JWT_SECRET
$oldAllowedOrigins=$env:ALLOWED_ORIGINS
try {
  if($DataRoot){$env:TIANJI_DATA_ROOT=$DataRoot}
  if($JwtSecret){$env:JWT_SECRET=$JwtSecret}
  if($AllowedOrigins){$env:ALLOWED_ORIGINS=$AllowedOrigins}
  Assert-TianjiReleaseArtifacts
  $dataConfig=Get-TianjiDataConfiguration -Root $root
  $mutex=Get-TianjiMutex -Name 'launcher' -Scope $dataConfig.DataRoot
  if(-not(Enter-TianjiMutex -Mutex $mutex)){throw 'Another Tianji start or stop operation is already running.'}
  Initialize-TianjiRuntime
  $state=Read-TianjiState -Root $root
  if(-not $state -or $state.projectRoot -ne $root){$state=New-TianjiState -Root $root}
  $state.frontendPort=$FrontendPort;$state.backendPort=$BackendPort;$state.logDirectory=Get-TianjiRuntimeDirectory
  Assert-TianjiPortAvailable -Port $BackendPort -OwnedRecord $state.backend
  Assert-TianjiPortAvailable -Port $FrontendPort -OwnedRecord $state.frontend
  Start-Or-ReuseTianjiService -Service backend -Port $BackendPort -State $state
  Start-Or-ReuseTianjiService -Service frontend -Port $FrontendPort -State $state
  Write-TianjiState -State $state -Root $root
  if(-not $SkipWatchdog -and -not(Test-TianjiRecordedProcess -Record $state.watchdog)){
    $arguments=@('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $root 'scripts\watch-tianji.ps1'),'-Root',$root,'-FrontendPort',$FrontendPort,'-BackendPort',$BackendPort,'-RuntimeDirectory',(Get-TianjiRuntimeDirectory))
    Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -ArgumentList $arguments|Out-Null
  }
  Write-Host "TIANJI_STARTED root=$root frontend=$FrontendPort backend=$BackendPort"
  if(-not $NoBrowser){Start-Process "http://127.0.0.1:$FrontendPort/login"}
} finally { $env:TIANJI_DATA_ROOT=$oldDataRoot;$env:JWT_SECRET=$oldJwtSecret;$env:ALLOWED_ORIGINS=$oldAllowedOrigins;if($mutex){Exit-TianjiMutex -Mutex $mutex} }
