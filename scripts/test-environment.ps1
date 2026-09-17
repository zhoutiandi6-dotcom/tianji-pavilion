param([Parameter(Mandatory=$true)][ValidateSet('Initialize','Start','Stop','Status','VerifyWatchdog')][string]$Action,[string]$Release)
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'release-common.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'tianji-runtime.psm1') -Force -DisableNameChecking
$testRoot='D:\TianjiTestData';$runtime=Join-Path $testRoot 'runtime';$statePath=Join-Path $runtime 'runtime-state.json';$legacyStatePath=Join-Path $runtime 'state.json';$testDb=Join-Path $testRoot 'database\tianji.db';$testAttachments=Join-Path $testRoot 'uploads\attachments'
function Assert-TestPath { if($testRoot -eq 'D:\TianjiData' -or $testDb -eq $script:TianjiFormalDatabase){throw 'Test environment resolved to production data; refusing.'} }
function Read-State { if(Test-Path $statePath){Get-Content $statePath -Raw|ConvertFrom-Json}elseif(Test-Path $legacyStatePath){Get-Content $legacyStatePath -Raw|ConvertFrom-Json}else{$null} }
function Stop-Recorded($record,$role,$releaseRoot){
  if(-not $record){return $true}
  $previous=$env:TIANJI_DATA_ROOT
  try {
    $env:TIANJI_DATA_ROOT=$testRoot
    $dataConfig=Get-TianjiDataConfiguration -Root $releaseRoot
    return (Stop-TianjiRecordedProcess -Record $record -Label $role -Root $releaseRoot -DataConfiguration $dataConfig)
  } finally {$env:TIANJI_DATA_ROOT=$previous}
}
function Test-OwnedTestPort($port,$record){$listener=Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue|Select-Object -First 1;return [bool]($listener -and $record -and $listener.OwningProcess -eq $record.pid)}
function Get-TestRelease { param($State) if($Release){return $Release};if($State -and $State.projectRoot){return (Split-Path $State.projectRoot -Leaf)};throw 'No release is running in the isolated environment.' }
function Assert-ReleaseProcess($record,$releaseRoot){if(-not $record -or -not $record.workingDirectory){throw 'Release process record is missing workingDirectory.'};$path=(Resolve-Path $record.workingDirectory).Path;if(-not $path.StartsWith($releaseRoot+'\',[StringComparison]::OrdinalIgnoreCase)){throw "Process working directory escapes release: $path"}}
Assert-TestPath
if($Action -eq 'Initialize'){
  $batch=Get-ChildItem 'D:\TianjiData\backups\batches' -Directory|Sort-Object Name -Descending|Where-Object{Test-Path (Join-Path $_.FullName 'database\tianji.db')}|Select-Object -First 1
  if(-not $batch){throw 'No verified cold backup batch is available for test initialization.'}
  New-Item -ItemType Directory -Path (Split-Path $testDb),$testAttachments -Force|Out-Null
  Copy-Item (Join-Path $batch.FullName 'database\tianji.db') $testDb -Force
  if(Test-Path (Join-Path $batch.FullName 'uploads\attachments')){Copy-TianjiPhysicalDirectory (Join-Path $batch.FullName 'uploads\attachments') $testAttachments}
  Write-Host 'TEST_ENV_INITIALIZED';exit
}
$state=Read-State
if($Action -eq 'Stop'){
  $stopped=$true
  if($state){$releaseRoot=(Resolve-Path $state.projectRoot).Path;foreach($entry in @(@('watchdog',$state.watchdog),@('frontend',$state.frontend),@('backend',$state.backend))){$stopped=(Stop-Recorded $entry[1] $entry[0] $releaseRoot) -and $stopped}}
  if(-not $stopped){throw 'STOP_BLOCKED PROCESS_OWNERSHIP_MISMATCH'}
  Remove-Item $statePath,$legacyStatePath -Force -ErrorAction SilentlyContinue;Write-Host 'TEST_ENV_STOPPED';exit
}
if($Action -eq 'Status'){
  $release=if($state){Split-Path $state.projectRoot -Leaf}else{$null}
  [pscustomobject]@{release=$release;state=$state;web=([bool]($state -and (Test-OwnedTestPort 3300 $state.frontend) -and (Wait-TianjiHttp200 'http://127.0.0.1:3300/login' 1)));api=([bool]($state -and (Test-OwnedTestPort 3301 $state.backend) -and (Wait-TianjiHttp200 'http://127.0.0.1:3301/api/health' 1)));database=$testDb;attachments=$testAttachments;nodePath=$env:NODE_PATH}|ConvertTo-Json -Depth 7;exit
}
if($Action -eq 'Start'){
  if(-not $Release){throw '-Release is required for Start.'};$manifest=Assert-TianjiRelease $Release
  if(-not(Test-Path $testDb) -or -not(Test-Path $testAttachments)){throw 'Run -Action Initialize before starting the fixed test environment.'}
  if($state){$previousRoot=(Resolve-Path $state.projectRoot).Path;Stop-Recorded $state.watchdog 'watchdog' $previousRoot|Out-Null;Stop-Recorded $state.frontend 'frontend' $previousRoot|Out-Null;Stop-Recorded $state.backend 'backend' $previousRoot|Out-Null};Remove-Item $statePath,$legacyStatePath -Force -ErrorAction SilentlyContinue
  foreach($port in 3300,3301){if(-not(Test-TianjiPortReleased $port)){throw "Test port $port is occupied; refusing to take ownership."}}
  $releaseRoot=Get-TianjiReleasePath $Release;$oldNodePath=$env:NODE_PATH
  try{$env:NODE_PATH=$null;$jwt=[Guid]::NewGuid().ToString('N');& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $releaseRoot 'scripts\start-tianji.ps1') -NoBrowser -FrontendPort 3300 -BackendPort 3301 -DataRoot $testRoot -RuntimeDirectory $runtime -JwtSecret $jwt -AllowedOrigins 'http://127.0.0.1:3300,http://localhost:3300';if($LASTEXITCODE -ne 0){throw 'Release-internal start script failed.'}}
  finally{$env:NODE_PATH=$oldNodePath}
  if(-not(Wait-TianjiHttp200 'http://127.0.0.1:3301/api/health' 45) -or -not(Wait-TianjiHttp200 'http://127.0.0.1:3300/login' 60)){throw 'Release-internal isolated start did not become healthy.'}
  Write-Host 'TEST_ENV_READY';exit
}
if($Action -eq 'VerifyWatchdog'){
  if(-not $state){throw 'No isolated release is running.'};$releaseRoot=(Resolve-Path $state.projectRoot).Path
  foreach($service in @('frontend','backend')){
    $before=$state.$service;$oldPid=[int]$before.pid;Stop-Recorded $before $service $releaseRoot|Out-Null
    $deadline=(Get-Date).AddSeconds(55);$recovered=$null
    while((Get-Date)-lt $deadline){Start-Sleep -Seconds 2;$state=Read-State;$candidate=$state.$service;$url=if($service -eq 'frontend'){'http://127.0.0.1:3300/login'}else{'http://127.0.0.1:3301/api/health'};if($candidate -and [int]$candidate.pid -ne $oldPid -and (Test-OwnedTestPort $candidate.port $candidate) -and (Wait-TianjiHttp200 $url 1)){$recovered=$candidate;break}}
    if(-not $recovered){throw "Watchdog did not recover $service from PID $oldPid."};Assert-ReleaseProcess $recovered $releaseRoot
  }
  Write-Host 'WATCHDOG_RECOVERY_PASS';exit
}
