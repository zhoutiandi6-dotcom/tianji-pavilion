param([Parameter(Mandatory=$true)][string]$Release)
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Import-Module (Join-Path $PSScriptRoot 'release-common.psm1') -Force
if ($Release -notmatch '^[0-9]{8}-[0-9]{3}$') { throw 'Release must use yyyyMMdd-NNN, for example 20260911-001.' }
if ((git -C $root status --porcelain)) { throw 'Working tree is not clean. Commit or stash before creating a release.' }
$target=Get-TianjiReleasePath $Release
if(Test-Path -LiteralPath $target){throw "Release already exists: $target"}
New-Item -ItemType Directory -Path $target -Force|Out-Null
$source=Join-Path $env:TEMP ("tianji-release-build-"+$Release+"-"+[Guid]::NewGuid().ToString('N'))
$archive=Join-Path $env:TEMP ("tianji-release-source-"+$Release+"-"+[Guid]::NewGuid().ToString('N')+".tar")
try {
  New-Item -ItemType Directory -Path $source -Force|Out-Null
  # Build from the committed snapshot. Never generate .next or dist in the live workspace.
  & git -C $root archive --format=tar --output=$archive HEAD
  if($LASTEXITCODE -ne 0 -or -not(Test-Path -LiteralPath $archive)){throw 'Unable to create isolated source archive'}
  & tar.exe -xf $archive -C $source
  if($LASTEXITCODE -ne 0){throw 'Unable to extract isolated source snapshot'}
  $savedDatabaseUrl=$env:DATABASE_URL;$savedDataRoot=$env:TIANJI_DATA_ROOT
  Push-Location $source
  try {
    $nativeErrorPreference=$ErrorActionPreference;$ErrorActionPreference='Continue'
    & npm.cmd ci 1> (Join-Path $target 'npm-ci.stdout.log') 2> (Join-Path $target 'npm-ci.stderr.log');$nativeExit=$LASTEXITCODE; if($nativeExit -ne 0){$ErrorActionPreference=$nativeErrorPreference;throw 'Isolated dependency install failed'}
    & npm.cmd run db:generate -w '@tianji/server' 1> (Join-Path $target 'prisma-generate.stdout.log') 2> (Join-Path $target 'prisma-generate.stderr.log');$nativeExit=$LASTEXITCODE; if($nativeExit -ne 0){$ErrorActionPreference=$nativeErrorPreference;throw 'Prisma Client generation failed'}
    $env:DATABASE_URL='file:D:/TianjiTestData/database/tianji.db';$env:TIANJI_DATA_ROOT='D:\TianjiTestData'
    & npm.cmd test -w '@tianji/server' -- --runInBand 1> (Join-Path $target 'server-test.stdout.log') 2> (Join-Path $target 'server-test.stderr.log');$nativeExit=$LASTEXITCODE; if($nativeExit -ne 0){$ErrorActionPreference=$nativeErrorPreference;throw 'Server test failed'}
    & npm.cmd run build -w '@tianji/server' 1> (Join-Path $target 'server-build.stdout.log') 2> (Join-Path $target 'server-build.stderr.log');$nativeExit=$LASTEXITCODE; if($nativeExit -ne 0){$ErrorActionPreference=$nativeErrorPreference;throw 'Server build failed'}
    & npm.cmd run build -w '@tianji/web' 1> (Join-Path $target 'web-build.stdout.log') 2> (Join-Path $target 'web-build.stderr.log');$nativeExit=$LASTEXITCODE;if($nativeExit -ne 0){$ErrorActionPreference=$nativeErrorPreference;throw 'Web build failed'}
    $ErrorActionPreference=$nativeErrorPreference
  } finally { $ErrorActionPreference=$nativeErrorPreference;$env:DATABASE_URL=$savedDatabaseUrl;$env:TIANJI_DATA_ROOT=$savedDataRoot;Pop-Location }
  Copy-TianjiPhysicalDirectory (Join-Path $source 'apps/server/dist') (Join-Path $target 'server/dist')
  Copy-TianjiPhysicalDirectory (Join-Path $source 'apps/web/.next') (Join-Path $target 'web/.next')
  Copy-TianjiPhysicalDirectory (Join-Path $source 'apps/server/prisma') (Join-Path $target 'server/prisma')
  $migrationNames=@(Get-ChildItem (Join-Path $source 'apps/server/prisma/migrations') -Directory | Select-Object -ExpandProperty Name)
  $manifest=[ordered]@{releaseId=$Release;createdAt=(Get-Date).ToUniversalTime().ToString('o');gitCommit=(& git -C $root rev-parse HEAD).Trim();packageLockHash=(Get-TianjiSha256 (Join-Path $source 'package-lock.json'));migrations=$migrationNames;hashes=[ordered]@{serverMain=(Get-TianjiSha256 (Join-Path $target 'server/dist/main.js'));webServer=(Get-TianjiSha256 (Join-Path $target 'web/.next/standalone/apps/web/server.js'));webBuildId=(Get-TianjiSha256 (Join-Path $target 'web/.next/BUILD_ID'))};server=Get-TianjiTreeStats (Join-Path $target 'server/dist');web=Get-TianjiTreeStats (Join-Path $target 'web/.next')}
  $manifest|ConvertTo-Json -Depth 8|Set-Content (Join-Path $target 'release.json') -Encoding utf8
  Assert-TianjiRelease $Release|Out-Null
  Write-Host 'RELEASE_CREATED'
} catch {
  $failureRoot=Join-Path 'D:\TianjiData\release-failures' ("$Release-"+(Get-Date -Format 'yyyyMMdd-HHmmss'))
  if(Test-Path -LiteralPath $target){($_ | Out-String)|Set-Content (Join-Path $target 'failure.txt') -Encoding utf8}
  if(Test-Path -LiteralPath $target){Copy-TianjiPhysicalDirectory $target $failureRoot}
  Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction SilentlyContinue
  throw
} finally { if(Test-Path -LiteralPath $source){Remove-Item -LiteralPath $source -Recurse -Force -ErrorAction SilentlyContinue};if(Test-Path -LiteralPath $archive){Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue} }
