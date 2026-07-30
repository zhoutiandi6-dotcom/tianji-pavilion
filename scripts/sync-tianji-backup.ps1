param(
  [Parameter(Mandatory = $true)][string]$BackupBatchPath,
  [switch]$NoPause
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Import-Module (Join-Path $PSScriptRoot "tianji-runtime.psm1") -Force -DisableNameChecking

function Invoke-BackupBatchVerify {
  param([string]$BatchPath)
  $old = [Environment]::GetEnvironmentVariable("TIANJI_BACKUP_BATCH_PATH", "Process")
  [Environment]::SetEnvironmentVariable("TIANJI_BACKUP_BATCH_PATH", $BatchPath, "Process")
  try {
    & (Join-Path $root "node_modules\.bin\ts-node.cmd") (Join-Path $root "apps\server\scripts\backup-batch.ts") verify
    if ($LASTEXITCODE -ne 0) { throw "Backup batch verification failed." }
  } finally { [Environment]::SetEnvironmentVariable("TIANJI_BACKUP_BATCH_PATH", $old, "Process") }
}

function Update-CloudSyncManifest {
  param([string]$BatchPath, [string]$Status, [string]$Destination)
  $manifestPath = Join-Path $BatchPath "manifest.json"
  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  $manifest.cloudSync = [pscustomobject]@{ status = $Status; syncedAt = (Get-Date).ToUniversalTime().ToString("o"); destination = $Destination }
  $manifest | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $manifestPath -Encoding utf8
  (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant() + "  manifest.json" | Set-Content -LiteralPath (Join-Path $BatchPath "manifest.sha256") -Encoding utf8
}

function Invoke-CloudBatchRotation {
  param([string]$BatchesRoot)
  $valid = @(Get-ChildItem -LiteralPath $BatchesRoot -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    $manifestPath = Join-Path $_.FullName "manifest.json"
    if (-not (Test-Path -LiteralPath $manifestPath)) { return }
    try {
      $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
      if ($manifest.verification.status -eq "ok") { [pscustomobject]@{ Directory = $_; Manifest = $manifest } }
    } catch { }
  } | Sort-Object { $_.Directory.Name } -Descending)
  for ($index = 0; $index -lt $valid.Count; $index++) {
    $batch = $valid[$index]
    $createdAt = [datetime]$batch.Manifest.createdAt
    $protected = ($batch.Manifest.protected -eq $true) -or (Test-Path -LiteralPath (Join-Path $batch.Directory.FullName ".protected"))
    $mustKeep = $index -lt 12 -or $createdAt -ge (Get-Date).AddDays(-90)
    if (-not $protected -and -not $mustKeep) { Remove-Item -LiteralPath $batch.Directory.FullName -Recurse -Force }
  }
}

$mutex = Get-TianjiMutex -Name "backup-sync"
if (-not (Enter-TianjiMutex -Mutex $mutex)) { throw "Another Tianji backup sync operation is already running." }

try {
  $dataConfig = Get-TianjiDataConfiguration -Root $root
  $batchPath = (Resolve-Path -LiteralPath $BackupBatchPath).Path
  if ($batchPath.EndsWith(".tmp") -or (Test-Path -LiteralPath (Join-Path $batchPath "failure.json"))) {
    throw "Refusing to sync an incomplete or failed Tianji backup batch: $batchPath"
  }
  $manifestPath = Join-Path $batchPath "manifest.json"
  if (-not (Test-Path -LiteralPath $manifestPath)) { throw "Backup batch manifest was not found: $batchPath" }
  Invoke-BackupBatchVerify -BatchPath $batchPath
  if ($dataConfig.BackupRoot -and -not (Test-Path -LiteralPath $dataConfig.BackupRoot)) {
    $backupParent = Split-Path -Parent $dataConfig.BackupRoot
    if (Test-Path -LiteralPath $backupParent -PathType Container) {
      try { New-Item -ItemType Directory -Path $dataConfig.BackupRoot -Force | Out-Null }
      catch {
        Write-Warning "Z-drive backup sync skipped: cannot create configured backup root $($dataConfig.BackupRoot): $($_.Exception.Message)"
        return
      }
    }
  }
  $backupRootStatus = Test-TianjiBackupRoot -DataConfiguration $dataConfig
  if (-not $backupRootStatus.Writable) {
    Write-Warning "Z-drive backup sync skipped: $($backupRootStatus.Message)"
    return
  }
  $batchId = Split-Path -Leaf $batchPath
  $cloudBatchesRoot = Join-Path $dataConfig.BackupRoot "batches"
  $destination = Join-Path $cloudBatchesRoot $batchId
  $temporaryDestination = "$destination.tmp"
  if (Test-Path -LiteralPath $destination) {
    Invoke-BackupBatchVerify -BatchPath $destination | Out-Null
    $localManifestHash = (Get-FileHash -LiteralPath (Join-Path $batchPath "manifest.json") -Algorithm SHA256).Hash
    $cloudManifestHash = (Get-FileHash -LiteralPath (Join-Path $destination "manifest.json") -Algorithm SHA256).Hash
    if ($localManifestHash -eq $cloudManifestHash) {
      Write-Host "Verified Tianji backup batch is already synced to Z drive: $destination" -ForegroundColor Green
      return
    }
    throw "Cloud backup batch ID conflicts with different content: $destination"
  }
  if (Test-Path -LiteralPath $temporaryDestination) { throw "Cloud temporary backup batch already exists: $temporaryDestination" }
  New-Item -ItemType Directory -Path $temporaryDestination -Force | Out-Null
  Copy-Item -Path (Join-Path $batchPath "*") -Destination $temporaryDestination -Recurse -Force
  Invoke-BackupBatchVerify -BatchPath $temporaryDestination
  Update-CloudSyncManifest -BatchPath $batchPath -Status "success" -Destination $destination
  Copy-Item -LiteralPath (Join-Path $batchPath "manifest.json") -Destination (Join-Path $temporaryDestination "manifest.json") -Force
  Copy-Item -LiteralPath (Join-Path $batchPath "manifest.sha256") -Destination (Join-Path $temporaryDestination "manifest.sha256") -Force
  Move-Item -LiteralPath $temporaryDestination -Destination $destination
  Invoke-BackupBatchVerify -BatchPath $destination | Out-Null
  Invoke-CloudBatchRotation -BatchesRoot $cloudBatchesRoot
  Write-Host "Verified Tianji backup batch synced to Z drive: $destination" -ForegroundColor Green
} catch {
  if (Get-Variable temporaryDestination -ErrorAction SilentlyContinue) {
    Write-Warning "Cloud backup sync failed. Local batch remains untouched. Temporary cloud copy retained for diagnosis: $temporaryDestination"
  }
  throw
} finally {
  Exit-TianjiMutex -Mutex $mutex
}

if (-not $NoPause) { Read-Host "Press Enter to close" | Out-Null }
