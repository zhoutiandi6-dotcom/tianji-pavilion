param(
  [switch]$Automatic,
  [switch]$Online,
  [switch]$StopServices,
  [switch]$RestartAfter,
  [switch]$NoPause
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Import-Module (Join-Path $PSScriptRoot "tianji-runtime.psm1") -Force -DisableNameChecking

function Write-BackupLog {
  param([string]$Message, $DataConfig)
  $logPath = Join-Path $DataConfig.LogsPath "backup.log"
  New-Item -ItemType Directory -Path $DataConfig.LogsPath -Force | Out-Null
  Rotate-TianjiLog -Path $logPath
  Add-Content -LiteralPath $logPath -Value "$(Get-Date -Format o) $Message" -Encoding utf8
}

function Test-TianjiServicesHealthy {
  return (Test-TianjiEndpoint -Url "http://127.0.0.1:3000/login") -or (Test-TianjiEndpoint -Url "http://127.0.0.1:3001/api/health")
}

function Get-CompletedBatchToday {
  param($DataConfig)
  $batchesRoot = Join-Path $DataConfig.BackupsPath "batches"
  if (-not (Test-Path -LiteralPath $batchesRoot)) { return $null }
  $todayPrefix = (Get-Date).ToString("yyyyMMdd") + "-"
  return Get-ChildItem -LiteralPath $batchesRoot -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name.StartsWith($todayPrefix) } |
    Sort-Object Name -Descending |
    Where-Object {
      $manifestPath = Join-Path $_.FullName "manifest.json"
      if (-not (Test-Path -LiteralPath $manifestPath)) { return $false }
      try {
        $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
        return $manifest.verification.status -eq "ok" -and $manifest.automatic -eq $true
      } catch { return $false }
    } |
    Select-Object -First 1
}

function Invoke-BackupBatchTool {
  param([string]$Command, [hashtable]$Environment)
  $oldValues = @{}
  foreach ($entry in $Environment.GetEnumerator()) {
    $oldValues[$entry.Key] = [Environment]::GetEnvironmentVariable($entry.Key, "Process")
    [Environment]::SetEnvironmentVariable($entry.Key, [string]$entry.Value, "Process")
  }
  try {
    & (Join-Path $root "node_modules\.bin\ts-node.cmd") (Join-Path $root "apps\server\scripts\backup-batch.ts") $Command
    if ($LASTEXITCODE -ne 0) { throw "Backup batch tool failed with exit code $LASTEXITCODE." }
  } finally {
    foreach ($entry in $oldValues.GetEnumerator()) { [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, "Process") }
  }
}

function Invoke-LocalBatchRotation {
  param($DataConfig)
  $batchesRoot = Join-Path $DataConfig.BackupsPath "batches"
  if (-not (Test-Path -LiteralPath $batchesRoot)) { return }
  $valid = @(Get-ChildItem -LiteralPath $batchesRoot -Directory | ForEach-Object {
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
    $mustKeep = $index -lt 3 -or $createdAt -ge (Get-Date).AddDays(-14) -or $index -lt 30 -or $batch.Manifest.cloudSync.status -ne "success"
    if (-not $protected -and -not $mustKeep) {
      Remove-Item -LiteralPath $batch.Directory.FullName -Recurse -Force
      Write-BackupLog -Message "action=rotate-local deleted=$($batch.Directory.Name)" -DataConfig $DataConfig
    }
  }
}

$mutex = Get-TianjiMutex -Name "backup"
if (-not (Enter-TianjiMutex -Mutex $mutex)) { throw "Another Tianji backup operation is already running." }

try {
  $dataConfig = Get-TianjiDataConfiguration -Root $root
  if (-not (Test-Path -LiteralPath $dataConfig.DatabasePath)) { throw "Tianji database does not exist: $($dataConfig.DatabasePath)" }
  if (-not (Test-Path -LiteralPath $dataConfig.AttachmentsPath)) { throw "Tianji attachment directory does not exist: $($dataConfig.AttachmentsPath)" }
  if ($Automatic) {
    $existing = Get-CompletedBatchToday -DataConfig $dataConfig
    if ($existing) {
      Write-Host "Daily automatic backup already verified: $($existing.FullName)" -ForegroundColor Green
      return
    }
  }
  if (Test-TianjiServicesHealthy) {
    if ($Automatic) {
      Write-Host "Tianji is already healthy; daily cold backup is skipped." -ForegroundColor Yellow
      return
    }
    if ($Online) {
      Write-Host "Tianji services are healthy; creating an SQLite Online Backup snapshot without stopping services." -ForegroundColor Green
    } elseif (-not $StopServices) { throw "Tianji services are running. Re-run with -Online for a consistent SQLite snapshot or -StopServices for a cold backup." }
    if (-not $Online) {
    & (Join-Path $PSScriptRoot "stop-tianji.ps1") -NoPause
    if (Test-TianjiServicesHealthy) { throw "Tianji services are still healthy after stop. Refusing to copy an active SQLite database." }
    }
  }

  $batchId = Get-Date -Format "yyyyMMdd-HHmmss-fff"
  $batchesRoot = Join-Path $dataConfig.BackupsPath "batches"
  New-Item -ItemType Directory -Path $batchesRoot -Force | Out-Null
  $gitCommit = (& git -C $root rev-parse HEAD).Trim()
  Invoke-BackupBatchTool -Command "create" -Environment @{
    TIANJI_DATA_ROOT = $dataConfig.DataRoot
    TIANJI_BACKUP_SOURCE_DATABASE = $dataConfig.DatabasePath
    TIANJI_BACKUP_SOURCE_ATTACHMENTS = $dataConfig.AttachmentsPath
    TIANJI_BACKUP_SOURCE_QUARANTINE = (Join-Path $dataConfig.QuarantinePath "orphan-attachments")
    TIANJI_BACKUP_SOURCE_CONFIG = (Join-Path $root "apps\server\.env")
    TIANJI_BACKUP_BATCHES_ROOT = $batchesRoot
    TIANJI_BACKUP_BATCH_ID = $batchId
    TIANJI_BACKUP_GIT_COMMIT = $gitCommit
    TIANJI_BACKUP_AUTOMATIC = if ($Automatic) { "true" } else { "false" }
  }
  $batchPath = Join-Path $batchesRoot $batchId
  Invoke-LocalBatchRotation -DataConfig $dataConfig
  Write-BackupLog -Message "action=created batch=$batchId automatic=$Automatic online=$Online" -DataConfig $dataConfig
  Write-Host "Verified Tianji backup batch: $batchPath" -ForegroundColor Green
  if ($RestartAfter) { & (Join-Path $PSScriptRoot "start-tianji.ps1") -NoBrowser }
} catch {
  if (Get-Variable dataConfig -ErrorAction SilentlyContinue) { Write-BackupLog -Message "action=failed error=$($_.Exception.Message)" -DataConfig $dataConfig }
  throw
} finally {
  Exit-TianjiMutex -Mutex $mutex
}

if (-not $NoPause) { Read-Host "Press Enter to close" | Out-Null }
