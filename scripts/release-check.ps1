param([Parameter(Mandatory=$true)][string]$Release)
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'release-common.psm1') -Force
try {
  $manifest=Assert-TianjiRelease $Release
  foreach($log in @('server-build.stdout.log','web-build.stdout.log','server-test.stdout.log')){if(-not(Test-Path (Join-Path (Get-TianjiReleasePath $Release) $log))){throw "Release evidence missing: $log"}}
  $status=& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'test-environment.ps1') -Action Status | Out-String
  if($status -notmatch '"web"\s*:\s*true' -or $status -notmatch '"api"\s*:\s*true' -or $status -notmatch [regex]::Escape('"release":  "'+$Release+'"')){throw 'Fixed test environment is not healthy on this release.'}
  [ordered]@{release=$Release;checkedAt=(Get-Date).ToUniversalTime().ToString('o');gitCommit=$manifest.gitCommit;status='READY'}|ConvertTo-Json|Set-Content (Join-Path (Get-TianjiReleasePath $Release) 'preflight.json') -Encoding utf8
  Write-Host 'RELEASE_READY'
} catch {Write-Host 'RELEASE_BLOCKED';throw}
