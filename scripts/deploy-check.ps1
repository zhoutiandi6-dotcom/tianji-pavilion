param([Parameter(Mandatory=$true)][string]$Release)
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'release-common.psm1') -Force
try {
  $manifest=Assert-TianjiRelease $Release
  $releaseRoot=(Resolve-Path (Get-TianjiReleasePath $Release)).Path
  $preflightPath=Join-Path $releaseRoot 'preflight.json'
  if(-not(Test-Path $preflightPath)){throw 'release-check evidence is missing.'}
  $preflight=Get-Content $preflightPath -Raw|ConvertFrom-Json
  if($preflight.status -ne 'READY'){throw 'Release preflight is not READY.'}
  $paths=Assert-TianjiReleaseRuntimePaths $Release
  foreach($path in @($paths.webRuntimeRoot,$paths.serverRuntimeRoot,$paths.startScriptSource,$paths.watchdogScriptSource)){
    if(-not $path.StartsWith($releaseRoot+'\',[StringComparison]::OrdinalIgnoreCase)){throw "Deployment path escapes release: $path"}
  }
  [ordered]@{release=$Release;checkedAt=(Get-Date).ToUniversalTime().ToString('o');webRuntimeRoot=$paths.webRuntimeRoot;serverRuntimeRoot=$paths.serverRuntimeRoot;startScriptSource=$paths.startScriptSource;watchdogScriptSource=$paths.watchdogScriptSource;nodePath=$env:NODE_PATH;status='DEPLOYABLE'}|ConvertTo-Json -Depth 5|Set-Content (Join-Path $releaseRoot 'deploy-check.json') -Encoding utf8
  Write-Host 'DEPLOYABLE'
} catch { Write-Host 'DEPLOY_BLOCKED';throw }
