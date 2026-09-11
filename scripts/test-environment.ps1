param([Parameter(Mandatory=$true)][ValidateSet('Initialize','Start','Stop','Status')][string]$Action,[string]$Release)
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'release-common.psm1') -Force
$projectRoot=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$testRoot='D:\TianjiTestData';$runtime=Join-Path $testRoot 'runtime';$statePath=Join-Path $runtime 'state.json';$testDb=Join-Path $testRoot 'database\tianji-test.db';$testAttachments=Join-Path $testRoot 'uploads\attachments'
function Assert-TestPath { if($testRoot -eq 'D:\TianjiData' -or $testDb -eq $script:TianjiFormalDatabase){throw 'Test environment resolved to production data; refusing.'} }
function Read-State { if(Test-Path $statePath){Get-Content $statePath -Raw|ConvertFrom-Json}else{$null} }
function Save-State($x){New-Item -ItemType Directory -Path $runtime -Force|Out-Null;$x|ConvertTo-Json -Depth 5|Set-Content $statePath -Encoding utf8}
function Stop-Recorded($record){if($record -and $record.pid -and (Get-Process -Id $record.pid -ErrorAction SilentlyContinue)){Stop-Process -Id $record.pid -ErrorAction Stop;Start-Sleep -Milliseconds 500}}
function Test-OwnedTestPort($port,$record){$listener=Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue|Select-Object -First 1;return [bool]($listener -and $record -and $listener.OwningProcess -eq $record.pid)}
Assert-TestPath
if($Action -eq 'Initialize'){
  $batch=Get-ChildItem 'D:\TianjiData\backups\batches' -Directory|Sort-Object Name -Descending|Where-Object{Test-Path (Join-Path $_.FullName 'database\tianji.db')}|Select-Object -First 1
  if(-not $batch){throw 'No verified cold backup batch is available for test initialization.'}
  New-Item -ItemType Directory -Path (Split-Path $testDb),$testAttachments -Force|Out-Null
  Copy-Item (Join-Path $batch.FullName 'database\tianji.db') $testDb -Force
  if(Test-Path (Join-Path $batch.FullName 'uploads\attachments')){Copy-TianjiPhysicalDirectory (Join-Path $batch.FullName 'uploads\attachments') $testAttachments}
  @("TEST_DATA_ROOT=$testRoot","TEST_DATABASE_URL=file:D:/TianjiTestData/database/tianji-test.db","TEST_ATTACHMENT_ROOT=$testAttachments")|Set-Content (Join-Path $testRoot 'test-environment.env') -Encoding ascii
  Write-Host 'TEST_ENV_INITIALIZED';exit
}
$state=Read-State
if($Action -eq 'Stop'){if($state){Stop-Recorded $state.watchdog;Stop-Recorded $state.frontend;Stop-Recorded $state.backend;Remove-Item $statePath -Force};Write-Host 'TEST_ENV_STOPPED';exit}
if($Action -eq 'Status'){[pscustomobject]@{state=$state;web=([bool]($state -and (Test-OwnedTestPort 3300 $state.frontend) -and (Wait-TianjiHttp200 'http://127.0.0.1:3300/login' 1)));api=([bool]($state -and (Test-OwnedTestPort 3301 $state.backend) -and (Wait-TianjiHttp200 'http://127.0.0.1:3301/api/health' 1)));database=$testDb;attachments=$testAttachments}|ConvertTo-Json -Depth 5;exit}
if(-not $Release){throw '-Release is required for Start.'};$manifest=Assert-TianjiRelease $Release
if(-not(Test-Path $testDb) -or -not(Test-Path $testAttachments)){throw 'Run -Action Initialize before starting the fixed test environment.'}
if(-not(Test-Path (Join-Path $projectRoot 'node_modules'))){throw 'Workspace runtime dependencies are unavailable for the fixed test environment.'}
if($state){Stop-Recorded $state.watchdog;Stop-Recorded $state.frontend;Stop-Recorded $state.backend}
foreach($port in 3300,3301){if(-not(Test-TianjiPortReleased $port)){throw "Test port $port is occupied; refusing to take ownership."}}
$releaseRoot=Get-TianjiReleasePath $Release;$logs=Join-Path $runtime 'logs';New-Item -ItemType Directory -Path $logs -Force|Out-Null
$old=@{};foreach($name in 'TIANJI_DATA_ROOT','DATABASE_URL','SERVER_PORT','PORT','HOSTNAME','JWT_SECRET','ALLOWED_ORIGINS','NODE_ENV','NODE_PATH'){$old[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try{
  $env:TIANJI_DATA_ROOT=$testRoot;$env:DATABASE_URL='file:D:/TianjiTestData/database/tianji-test.db';$env:SERVER_PORT='3301';$env:PORT='3300';$env:HOSTNAME='127.0.0.1';$env:NODE_ENV='production';$env:ALLOWED_ORIGINS='http://127.0.0.1:3300,http://localhost:3300';$env:JWT_SECRET=[Guid]::NewGuid().ToString('N');$env:NODE_PATH=(Join-Path $projectRoot 'node_modules')
  $backend=Start-Process node.exe -ArgumentList (Join-Path $releaseRoot 'server/dist/main.js') -WorkingDirectory (Join-Path $releaseRoot 'server') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs 'backend.stdout.log') -RedirectStandardError (Join-Path $logs 'backend.stderr.log') -PassThru
  if(-not(Wait-TianjiHttp200 'http://127.0.0.1:3301/api/health' 45)){throw 'Test backend did not become healthy.'}
  $frontend=Start-Process node.exe -ArgumentList (Join-Path $releaseRoot 'web/.next/standalone/apps/web/server.js') -WorkingDirectory (Join-Path $releaseRoot 'web') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs 'frontend.stdout.log') -RedirectStandardError (Join-Path $logs 'frontend.stderr.log') -PassThru
  if(-not(Wait-TianjiHttp200 'http://127.0.0.1:3300/login' 60)){throw 'Test frontend did not become healthy.'}
  Save-State ([ordered]@{release=$Release;startedAt=(Get-Date).ToUniversalTime().ToString('o');backend=@{pid=$backend.Id;port=3301};frontend=@{pid=$frontend.Id;port=3300};dataRoot=$testRoot;database=$testDb;attachments=$testAttachments})
  Write-Host 'TEST_ENV_READY'
} finally {foreach($entry in $old.GetEnumerator()){[Environment]::SetEnvironmentVariable($entry.Key,$entry.Value,'Process')}}
