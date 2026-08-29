param(
  [Parameter(Mandatory = $true)][string]$BackupBatchPath,
  [Parameter(Mandatory = $true)][string]$ConfirmPhrase,
  [switch]$NoRestart,
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

function Copy-BackupBatchToRestoreStage {
  param([string]$SourcePath, $DataConfig)
  $batchId = Split-Path -Leaf $SourcePath
  $stage = Join-Path $DataConfig.TempPath "restore\$batchId-$((Get-Date).ToString('yyyyMMdd-HHmmss'))"
  New-Item -ItemType Directory -Path $stage -Force | Out-Null
  Copy-Item -Path (Join-Path $SourcePath "*") -Destination $stage -Recurse -Force
  Invoke-BackupBatchVerify -BatchPath $stage | Out-Null
  return $stage
}

if ($ConfirmPhrase -cne "RESTORE-TIANJI") { throw "Restore requires -ConfirmPhrase RESTORE-TIANJI." }
$mutex = Get-TianjiMutex -Name "restore"
if (-not (Enter-TianjiMutex -Mutex $mutex)) { throw "Another Tianji restore operation is already running." }

try {
  $dataConfig = Get-TianjiDataConfiguration -Root $root
  $sourceBatch = (Resolve-Path -LiteralPath $BackupBatchPath).Path
  if ($sourceBatch.EndsWith(".tmp") -or (Test-Path -LiteralPath (Join-Path $sourceBatch "failure.json"))) {
    throw "Refusing to restore from an incomplete or failed Tianji backup batch: $sourceBatch"
  }
  if (-not (Test-Path -LiteralPath (Join-Path $sourceBatch "manifest.json"))) { throw "Backup batch manifest was not found: $sourceBatch" }
  $stage = Copy-BackupBatchToRestoreStage -SourcePath $sourceBatch -DataConfig $dataConfig
  $manifest = Get-Content -LiteralPath (Join-Path $stage "manifest.json") -Raw | ConvertFrom-Json
  Write-Host "Restore batch: $($manifest.batchId)" -ForegroundColor Yellow
  Write-Host "Created: $($manifest.createdAt) | Commit: $($manifest.gitCommit)"
  Write-Host "Database: $($manifest.database.size) bytes | Attachments: $($manifest.uploads.count) files / $($manifest.uploads.bytes) bytes | Configuration: $($manifest.configuration.count) files"

  & (Join-Path $PSScriptRoot "stop-tianji.ps1") -NoPause
  foreach ($port in 3000, 3001) {
    if (Get-TianjiPortOccupant -Port $port) { throw "Port $port remains occupied after Tianji stop. Refusing restore." }
  }

  # The current D-drive state is protected with the same verified batch process
  # before anything is replaced.
  & (Join-Path $PSScriptRoot "backup-tianji.ps1") -NoPause
  if ($LASTEXITCODE -ne 0) { throw "Failed to create before-restore protection batch." }

  $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $previousRoot = Join-Path $dataConfig.TempPath "restore-previous\$timestamp"
  $previousDatabase = Join-Path $previousRoot "database"
  $previousUploads = Join-Path $previousRoot "uploads"
  New-Item -ItemType Directory -Path $previousDatabase, $previousUploads -Force | Out-Null
  $databaseMoved = $false
  $uploadsMoved = $false
  try {
    Move-Item -LiteralPath $dataConfig.DatabasePath -Destination (Join-Path $previousDatabase "tianji.db")
    $databaseMoved = $true
    Move-Item -LiteralPath $dataConfig.AttachmentsPath -Destination (Join-Path $previousUploads "attachments")
    $uploadsMoved = $true
    New-Item -ItemType Directory -Path (Split-Path $dataConfig.DatabasePath), (Split-Path $dataConfig.AttachmentsPath) -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $stage "database\tianji.db") -Destination $dataConfig.DatabasePath -Force
    Copy-Item -LiteralPath (Join-Path $stage "uploads\attachments") -Destination $dataConfig.AttachmentsPath -Recurse -Force
    if ((Get-FileHash -LiteralPath (Join-Path $stage "database\tianji.db") -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $dataConfig.DatabasePath -Algorithm SHA256).Hash) {
      throw "Restored database hash mismatch."
    }
    $restoredCount = @(Get-ChildItem -LiteralPath $dataConfig.AttachmentsPath -Recurse -File).Count
    if ($restoredCount -ne [int]$manifest.uploads.count) { throw "Restored attachment file count mismatch." }
    Push-Location (Join-Path $root "apps\server")
    try {
      & npx prisma migrate status
      if ($LASTEXITCODE -ne 0) { throw "Prisma migration status failed after restore." }
    } finally { Pop-Location }
    Write-Host "Tianji restore completed. Previous live data retained at: $previousRoot" -ForegroundColor Green
  } catch {
    Write-Warning "Restore failed; returning previous D-drive data to service locations."
    Remove-Item -LiteralPath $dataConfig.DatabasePath -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $dataConfig.AttachmentsPath -Recurse -Force -ErrorAction SilentlyContinue
    if ($databaseMoved) { Move-Item -LiteralPath (Join-Path $previousDatabase "tianji.db") -Destination $dataConfig.DatabasePath -Force }
    if ($uploadsMoved) { Move-Item -LiteralPath (Join-Path $previousUploads "attachments") -Destination $dataConfig.AttachmentsPath -Force }
    throw
  }
  if (-not $NoRestart) { & (Join-Path $PSScriptRoot "start-tianji.ps1") -NoBrowser }
} finally {
  Exit-TianjiMutex -Mutex $mutex
}

if (-not $NoPause) { Read-Host "Press Enter to close" | Out-Null }
