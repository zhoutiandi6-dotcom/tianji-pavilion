param(
  [Parameter(Mandatory=$true)][string]$Release,
  [string]$SourceCommit = 'HEAD'
)
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Import-Module (Join-Path $PSScriptRoot 'release-common.psm1') -Force

function Assert-TianjiMigrationBytes {
  param(
    [Parameter(Mandatory=$true)][string]$SourcePrismaRoot,
    [Parameter(Mandatory=$true)][string]$ArtifactPrismaRoot
  )
  $sourceMigrations = Join-Path $SourcePrismaRoot 'migrations'
  $artifactMigrations = Join-Path $ArtifactPrismaRoot 'migrations'
  foreach ($sourceFile in Get-ChildItem -LiteralPath $sourceMigrations -Recurse -File -Filter 'migration.sql') {
    $relative = [System.IO.Path]::GetRelativePath($sourceMigrations, $sourceFile.FullName)
    $artifactFile = Join-Path $artifactMigrations $relative
    if (-not (Test-Path -LiteralPath $artifactFile)) { throw "Artifact migration is missing: $relative" }
    $sourceHash = Get-TianjiSha256 $sourceFile.FullName
    $artifactHash = Get-TianjiSha256 $artifactFile
    if ($sourceHash -ne $artifactHash) { throw "Artifact migration hash mismatch: $relative source=$sourceHash artifact=$artifactHash" }
  }
}

if ($Release -notmatch '^[0-9]{8}-[0-9]{3}$') { throw 'Release must use yyyyMMdd-NNN, for example 20260911-001.' }
if ((git -C $root status --porcelain)) { throw 'Working tree is not clean. Commit or stash before creating a release.' }
$resolvedSourceCommit = (& git -C $root rev-parse --verify "$SourceCommit^{commit}").Trim()
if ($LASTEXITCODE -ne 0) { throw "Invalid source commit: $SourceCommit" }
$target=Get-TianjiReleasePath $Release
if(Test-Path -LiteralPath $target){throw "Release already exists: $target"}
New-Item -ItemType Directory -Path $target -Force|Out-Null
$source=Join-Path $env:TEMP ("tianji-release-build-"+$Release+"-"+[Guid]::NewGuid().ToString('N'))
$archive=Join-Path $env:TEMP ("tianji-release-source-"+$Release+"-"+[Guid]::NewGuid().ToString('N')+".tar")
$prismaSnapshot=Join-Path $env:TEMP ("tianji-release-prisma-"+$Release+"-"+[Guid]::NewGuid().ToString('N'))
try {
  New-Item -ItemType Directory -Path $source -Force|Out-Null
  # Build from the committed snapshot. Never generate .next or dist in the live workspace.
  # Archive raw Git bytes: global core.autocrlf must never rewrite migration SQL in a release.
  & git -c core.autocrlf=false -C $root archive --format=tar --output=$archive $resolvedSourceCommit
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
    Copy-TianjiPhysicalDirectory (Join-Path $source 'node_modules/@prisma/client') (Join-Path $prismaSnapshot '@prisma/client')
    Copy-TianjiPhysicalDirectory (Join-Path $source 'node_modules/.prisma/client') (Join-Path $prismaSnapshot '.prisma/client')
    & npm.cmd ci --omit=dev 1> (Join-Path $target 'npm-ci-production.stdout.log') 2> (Join-Path $target 'npm-ci-production.stderr.log');$nativeExit=$LASTEXITCODE;if($nativeExit -ne 0){$ErrorActionPreference=$nativeErrorPreference;throw 'Production dependency install failed'}
    Copy-TianjiPhysicalDirectory (Join-Path $prismaSnapshot '@prisma/client') (Join-Path $source 'node_modules/@prisma/client')
    Copy-TianjiPhysicalDirectory (Join-Path $prismaSnapshot '.prisma/client') (Join-Path $source 'node_modules/.prisma/client')
    $ErrorActionPreference=$nativeErrorPreference
  } finally { $ErrorActionPreference=$nativeErrorPreference;$env:DATABASE_URL=$savedDatabaseUrl;$env:TIANJI_DATA_ROOT=$savedDataRoot;Pop-Location }
  # A release is its own production runtime unit: canonical apps/ layout,
  # physical runtime dependencies and only the scripts needed to launch/watch it.
  Copy-TianjiPhysicalDirectory (Join-Path $source 'apps/server/dist') (Join-Path $target 'apps/server/dist')
  Copy-TianjiPhysicalDirectory (Join-Path $source 'apps/web/.next') (Join-Path $target 'apps/web/.next')
  Copy-TianjiPhysicalDirectory (Join-Path $source 'apps/server/prisma') (Join-Path $target 'apps/server/prisma')
  Assert-TianjiMigrationBytes (Join-Path $source 'apps/server/prisma') (Join-Path $target 'apps/server/prisma')
  Copy-TianjiRuntimeNodeModules (Join-Path $source 'node_modules') (Join-Path $target 'node_modules')
  New-Item -ItemType Directory -Path (Join-Path $target 'scripts') -Force | Out-Null
  foreach($scriptName in @('start-tianji.ps1','watch-tianji.ps1','stop-tianji.ps1','tianji-runtime.psm1')){
    Copy-Item -LiteralPath (Join-Path $source "scripts/$scriptName") -Destination (Join-Path $target "scripts/$scriptName") -Force
  }
  $migrationNames=@(Get-ChildItem (Join-Path $source 'apps/server/prisma/migrations') -Directory | Select-Object -ExpandProperty Name)
  $manifest=[ordered]@{releaseId=$Release;createdAt=(Get-Date).ToUniversalTime().ToString('o');gitCommit=$resolvedSourceCommit;packageLockHash=(Get-TianjiSha256 (Join-Path $source 'package-lock.json'));migrations=$migrationNames;runtime=[ordered]@{webRoot=(Join-Path $target 'apps/web');serverRoot=(Join-Path $target 'apps/server');nodeModulesRoot=(Join-Path $target 'node_modules');startScript=(Join-Path $target 'scripts/start-tianji.ps1');watchdogScript=(Join-Path $target 'scripts/watch-tianji.ps1');webEntry=(Join-Path $target 'apps/web/.next/standalone/apps/web/server.js');serverEntry=(Join-Path $target 'apps/server/dist/main.js')};hashes=[ordered]@{serverMain=(Get-TianjiSha256 (Join-Path $target 'apps/server/dist/main.js'));webServer=(Get-TianjiSha256 (Join-Path $target 'apps/web/.next/standalone/apps/web/server.js'));webBuildId=(Get-TianjiSha256 (Join-Path $target 'apps/web/.next/BUILD_ID'))};server=Get-TianjiTreeStats (Join-Path $target 'apps/server');web=Get-TianjiTreeStats (Join-Path $target 'apps/web')}
  $manifest|ConvertTo-Json -Depth 8|Set-Content (Join-Path $target 'release.json') -Encoding utf8
  $manifest|ConvertTo-Json -Depth 8|Set-Content (Join-Path $target 'release-manifest.json') -Encoding utf8
  Assert-TianjiRelease $Release|Out-Null
  Write-Host 'RELEASE_CREATED'
} catch {
  $failureRoot=Join-Path 'D:\TianjiData\release-failures' ("$Release-"+(Get-Date -Format 'yyyyMMdd-HHmmss'))
  if(Test-Path -LiteralPath $target){($_ | Out-String)|Set-Content (Join-Path $target 'failure.txt') -Encoding utf8}
  if(Test-Path -LiteralPath $target){Copy-TianjiPhysicalDirectory $target $failureRoot}
  Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction SilentlyContinue
  throw
} finally { if(Test-Path -LiteralPath $source){Remove-Item -LiteralPath $source -Recurse -Force -ErrorAction SilentlyContinue};if(Test-Path -LiteralPath $archive){Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue};if(Test-Path -LiteralPath $prismaSnapshot){Remove-Item -LiteralPath $prismaSnapshot -Recurse -Force -ErrorAction SilentlyContinue} }
