Set-StrictMode -Version Latest

$script:TianjiReleaseRoot = 'D:\TianjiData\releases'
$script:TianjiDeploymentRoot = 'D:\TianjiData\deployments'
$script:TianjiFormalDatabase = 'D:\TianjiData\database\tianji.db'
$script:TianjiFormalDataRoot = 'D:\TianjiData'
$script:TianjiFormalPorts = @(3000, 3001)

function Get-TianjiReleasePath { param([Parameter(Mandatory=$true)][string]$Release) Join-Path $script:TianjiReleaseRoot $Release }
function Get-TianjiDeploymentPath { param([Parameter(Mandatory=$true)][string]$Deployment) Join-Path $script:TianjiDeploymentRoot $Deployment }

function Get-TianjiTreeStats {
  param([Parameter(Mandatory=$true)][string]$Path)
  $files = @(Get-ChildItem -LiteralPath $Path -Recurse -File -Force)
  [pscustomobject]@{ FileCount=$files.Count; Bytes=[int64](($files | Measure-Object Length -Sum).Sum) }
}

function Get-TianjiSha256 { param([Parameter(Mandatory=$true)][string]$Path) (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash }

function Assert-TianjiNoReparsePoint {
  param([Parameter(Mandatory=$true)][string]$Path)
  $links = @(Get-ChildItem -LiteralPath $Path -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint })
  if ($links.Count -gt 0) { throw "Release contains junction/symlink: $($links[0].FullName)" }
}

function Read-TianjiReleaseManifest {
  param([Parameter(Mandatory=$true)][string]$Release)
  $path = Join-Path (Get-TianjiReleasePath $Release) 'release.json'
  if (-not (Test-Path -LiteralPath $path)) { throw "Release manifest does not exist: $path" }
  return Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
}

function Assert-TianjiRelease {
  param([Parameter(Mandatory=$true)][string]$Release)
  $root = Get-TianjiReleasePath $Release
  $manifest = Read-TianjiReleaseManifest $Release
  if ($manifest.releaseId -ne $Release) { throw 'Release ID does not match manifest.' }
  foreach ($relative in @('web/.next/standalone/apps/web/server.js','web/.next/BUILD_ID','web/.next/static','server/dist/main.js','server/prisma/schema.prisma')) {
    if (-not (Test-Path -LiteralPath (Join-Path $root $relative))) { throw "Release is missing $relative" }
  }
  Assert-TianjiNoReparsePoint -Path $root
  $expected = $manifest.hashes
  if ((Get-TianjiSha256 (Join-Path $root 'web/.next/standalone/apps/web/server.js')) -ne $expected.webServer) { throw 'Web server hash mismatch.' }
  if ((Get-TianjiSha256 (Join-Path $root 'web/.next/BUILD_ID')) -ne $expected.webBuildId) { throw 'Web BUILD_ID hash mismatch.' }
  if ((Get-TianjiSha256 (Join-Path $root 'server/dist/main.js')) -ne $expected.serverMain) { throw 'Server main hash mismatch.' }
  return $manifest
}

function New-TianjiDeploymentEvidence {
  param([Parameter(Mandatory=$true)][string]$Release)
  $id = "$(Get-Date -Format 'yyyyMMdd-HHmmss')-$Release"
  $path = Get-TianjiDeploymentPath $id
  New-Item -ItemType Directory -Path $path -Force | Out-Null
  [pscustomobject]@{ Id=$id; Path=$path }
}

function Write-TianjiDeploymentEvent {
  param([Parameter(Mandatory=$true)][string]$Path,[Parameter(Mandatory=$true)][string]$Event,[hashtable]$Data=@{}) 
  $row = [ordered]@{ at=(Get-Date).ToUniversalTime().ToString('o'); event=$Event; data=$Data }
  Add-Content -LiteralPath (Join-Path $Path 'events.jsonl') -Value ($row | ConvertTo-Json -Compress -Depth 6) -Encoding utf8
}

function Test-TianjiPortReleased {
  param([Parameter(Mandatory=$true)][int]$Port)
  return -not @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue).Count
}

function Wait-TianjiHttp200 {
  param([Parameter(Mandatory=$true)][string]$Url,[int]$TimeoutSeconds=60)
  $deadline=(Get-Date).AddSeconds($TimeoutSeconds)
  while((Get-Date)-lt $deadline){
    try { if((Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 -Uri $Url).StatusCode -eq 200){return $true} } catch {}
    Start-Sleep -Seconds 2
  }
  return $false
}

function Copy-TianjiPhysicalDirectory {
  param([Parameter(Mandatory=$true)][string]$Source,[Parameter(Mandatory=$true)][string]$Destination)
  & robocopy $Source $Destination /E /COPY:DAT /DCOPY:DAT /R:1 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -gt 7) { throw "Physical copy failed ($LASTEXITCODE): $Source -> $Destination" }
  Assert-TianjiNoReparsePoint -Path $Destination
}

Export-ModuleMember -Function *-Tianji*
