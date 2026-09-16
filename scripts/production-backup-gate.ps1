param([Parameter(Mandatory=$true)][string]$Release,[Parameter(Mandatory=$true)][string]$EvidencePath)
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Import-Module (Join-Path $PSScriptRoot 'release-common.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'tianji-runtime.psm1') -Force -DisableNameChecking
$releaseRoot=Get-TianjiReleasePath $Release
$dataRoot='D:\TianjiData';$database=Join-Path $dataRoot 'database\tianji.db';$attachments=Join-Path $dataRoot 'uploads\attachments'
function Get-NewBatch([string[]]$Before){Get-ChildItem (Join-Path $dataRoot 'backups\batches') -Directory|Where-Object{$Before -notcontains $_.Name}|Sort-Object Name -Descending|Select-Object -First 1}
function Get-EnvFileValue([string]$Name){$envFile=Join-Path $root 'apps\server\.env';foreach($line in Get-Content $envFile){if($line -match "^$Name=(.+)$"){return $Matches[1].Trim()}};throw "$Name is missing from production configuration."}
$restoreRoot=$null;$restoreProcess=$null
try {
  if(-not(Test-TianjiEndpoint 'http://127.0.0.1:3000/login') -or -not(Test-TianjiEndpoint 'http://127.0.0.1:3001/api/health')){throw 'Production services must remain healthy for the online backup gate.'}
  $before=@(Get-ChildItem (Join-Path $dataRoot 'backups\batches') -Directory|Select-Object -ExpandProperty Name)
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'backup-tianji.ps1') -Online -NoPause
  if($LASTEXITCODE -ne 0){throw 'SQLite online backup command failed.'}
  $batch=Get-NewBatch $before;if(-not $batch){throw 'Online backup completed without a new batch.'}
  $backupDatabase=Join-Path $batch.FullName 'database\tianji.db';if(-not(Test-Path $backupDatabase) -or (Get-Item $backupDatabase).Length -le 0){throw 'Online database snapshot is missing or empty.'}
  $verification=& node.exe (Join-Path $PSScriptRoot 'verify-sqlite-backup.cjs') $backupDatabase|Out-String;if($LASTEXITCODE -ne 0){throw "SQLite integrity validation failed: $verification"}
  $stamp=Get-Date -Format 'yyyyMMdd-HHmmss-fff';$restoreRoot="D:\TianjiData\restore-tests\$stamp";New-Item -ItemType Directory -Path (Join-Path $restoreRoot 'database'),(Join-Path $restoreRoot 'uploads\attachments'),(Join-Path $restoreRoot 'logs') -Force|Out-Null
  Copy-Item $backupDatabase (Join-Path $restoreRoot 'database\tianji.db') -Force
  Copy-TianjiPhysicalDirectory (Join-Path $batch.FullName 'uploads\attachments') (Join-Path $restoreRoot 'uploads\attachments')
  if(-not(Test-TianjiPortReleased 3401)){throw 'Restore-test port 3401 is occupied.'}
  $old=@{};foreach($name in 'TIANJI_DATA_ROOT','DATABASE_URL','SERVER_PORT','JWT_SECRET','NODE_PATH'){$old[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
  try {
    $env:TIANJI_DATA_ROOT=$restoreRoot;$env:DATABASE_URL=('file:' + (Join-Path $restoreRoot 'database\tianji.db').Replace('\','/'));$env:SERVER_PORT='3401';$env:JWT_SECRET=Get-EnvFileValue 'JWT_SECRET';$env:NODE_PATH=$null
    $restoreProcess=Start-Process node.exe -WorkingDirectory (Join-Path $releaseRoot 'apps\server') -ArgumentList 'dist\main.js' -WindowStyle Hidden -RedirectStandardOutput (Join-Path $restoreRoot 'logs\backend.out.log') -RedirectStandardError (Join-Path $restoreRoot 'logs\backend.err.log') -PassThru
    if(-not(Wait-TianjiHttp200 'http://127.0.0.1:3401/api/health' 45)){throw 'Restore-test backend did not become healthy.'}
  } finally {foreach($entry in $old.GetEnumerator()){[Environment]::SetEnvironmentVariable($entry.Key,$entry.Value,'Process')}}
  $restoreVerification=& node.exe (Join-Path $PSScriptRoot 'verify-sqlite-backup.cjs') (Join-Path $restoreRoot 'database\tianji.db')|Out-String;if($LASTEXITCODE -ne 0){throw 'Restore database validation failed.'}
  $report=[ordered]@{status='PASS';batchPath=$batch.FullName;databaseBackup=$backupDatabase;databaseBytes=(Get-Item $backupDatabase).Length;integrityCheck='ok';attachmentsBackup=(Join-Path $batch.FullName 'uploads\attachments');restoreRoot=$restoreRoot;restoreHealth=200;verification=($verification|ConvertFrom-Json);restoreVerification=($restoreVerification|ConvertFrom-Json)}
  $report|ConvertTo-Json -Depth 8|Set-Content (Join-Path $EvidencePath 'backup-gate.json') -Encoding utf8
  Write-Host 'PRODUCTION_BACKUP_GATE_PASS'
} finally {if($restoreProcess -and -not $restoreProcess.HasExited){Stop-Process -Id $restoreProcess.Id -ErrorAction SilentlyContinue}}
