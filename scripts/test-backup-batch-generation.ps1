param(
  [Parameter(Mandatory = $true)][string]$FixtureBatchPath,
  [string]$TestRoot = (Join-Path $env:TEMP "tianji-backup-batch-tests\\中文 空格")
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$fixture = (Resolve-Path -LiteralPath $FixtureBatchPath).Path
$testId = [Guid]::NewGuid().ToString("N")
$workspace = Join-Path $TestRoot $testId
$sourceRoot = Join-Path $workspace "source"
$batchesRoot = Join-Path $workspace "batches"
$tool = Join-Path $root "node_modules\.bin\ts-node.cmd"
$helper = Join-Path $root "apps\server\scripts\backup-batch.ts"

function Assert-Condition {
  param([bool]$Condition, [string]$Message)
  if (-not $Condition) { throw "Assertion failed: $Message" }
}

function Invoke-Create {
  param([string]$BatchId, [string]$AttachmentsPath = (Join-Path $sourceRoot "uploads\attachments"))
  $previous = @{}
  $values = @{
    TIANJI_DATA_ROOT = $sourceRoot
    TIANJI_BACKUP_SOURCE_DATABASE = (Join-Path $sourceRoot "database\tianji.db")
    TIANJI_BACKUP_SOURCE_ATTACHMENTS = $AttachmentsPath
    TIANJI_BACKUP_SOURCE_QUARANTINE = (Join-Path $sourceRoot "quarantine\orphan-attachments")
    TIANJI_BACKUP_BATCHES_ROOT = $batchesRoot
    TIANJI_BACKUP_BATCH_ID = $BatchId
    TIANJI_BACKUP_GIT_COMMIT = "backup-batch-test"
    TIANJI_BACKUP_AUTOMATIC = "false"
  }
  foreach ($name in $values.Keys) { $previous[$name] = [Environment]::GetEnvironmentVariable($name, "Process"); [Environment]::SetEnvironmentVariable($name, $values[$name], "Process") }
  $previousPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    & $tool $helper create 2>$null | Out-Null
    return $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousPreference
    foreach ($name in $values.Keys) { [Environment]::SetEnvironmentVariable($name, $previous[$name], "Process") }
  }
}

function Invoke-Verify {
  param([string]$BatchPath)
  $previous = [Environment]::GetEnvironmentVariable("TIANJI_BACKUP_BATCH_PATH", "Process")
  [Environment]::SetEnvironmentVariable("TIANJI_BACKUP_BATCH_PATH", $BatchPath, "Process")
  $previousPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    & $tool $helper verify 2>$null | Out-Null
    return $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousPreference
    [Environment]::SetEnvironmentVariable("TIANJI_BACKUP_BATCH_PATH", $previous, "Process")
  }
}

New-Item -ItemType Directory -Path $sourceRoot, $batchesRoot -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $fixture "database") -Destination $sourceRoot -Recurse -Force
Copy-Item -LiteralPath (Join-Path $fixture "uploads") -Destination $sourceRoot -Recurse -Force
Copy-Item -LiteralPath (Join-Path $fixture "quarantine") -Destination $sourceRoot -Recurse -Force

$successId = "success-$testId"
Assert-Condition ((Invoke-Create -BatchId $successId) -eq 0) "successful batch creation"
$success = Join-Path $batchesRoot $successId
Assert-Condition (Test-Path -LiteralPath (Join-Path $success "manifest.json")) "manifest.json exists"
Assert-Condition (Test-Path -LiteralPath (Join-Path $success "manifest.sha256")) "manifest.sha256 exists"
Assert-Condition ((Invoke-Verify -BatchPath $success) -eq 0) "completed batch can be re-verified"

$incomplete = Join-Path $batchesRoot "missing-checksum-$testId.tmp"
Copy-Item -LiteralPath $success -Destination $incomplete -Recurse -Force
Remove-Item -LiteralPath (Join-Path $incomplete "manifest.sha256") -Force
Assert-Condition ((Invoke-Verify -BatchPath $incomplete) -ne 0) "missing manifest checksum is rejected"

$collisionId = "collision-$testId"
New-Item -ItemType Directory -Path (Join-Path $batchesRoot "$collisionId.tmp") -Force | Out-Null
Assert-Condition ((Invoke-Create -BatchId $collisionId) -ne 0) "existing temporary batch is never reused"
Assert-Condition (-not (Test-Path -LiteralPath (Join-Path $batchesRoot $collisionId))) "collision does not create a formal batch"

$concurrentId = "concurrent-$testId"
$jobs = @(1..2 | ForEach-Object {
  Start-Job -ScriptBlock {
    param($Tool, $Helper, $SourceRoot, $BatchesRoot, $BatchId)
    $env:TIANJI_DATA_ROOT = $SourceRoot
    $env:TIANJI_BACKUP_SOURCE_DATABASE = Join-Path $SourceRoot "database\tianji.db"
    $env:TIANJI_BACKUP_SOURCE_ATTACHMENTS = Join-Path $SourceRoot "uploads\attachments"
    $env:TIANJI_BACKUP_SOURCE_QUARANTINE = Join-Path $SourceRoot "quarantine\orphan-attachments"
    $env:TIANJI_BACKUP_BATCHES_ROOT = $BatchesRoot
    $env:TIANJI_BACKUP_BATCH_ID = $BatchId
    $env:TIANJI_BACKUP_GIT_COMMIT = "backup-batch-test"
    $env:TIANJI_BACKUP_AUTOMATIC = "false"
    & $Tool $Helper create *> $null
    return $LASTEXITCODE
  } -ArgumentList $tool, $helper, $sourceRoot, $batchesRoot, $concurrentId
})
Wait-Job -Job $jobs | Out-Null
$concurrentResults = @($jobs | ForEach-Object { Receive-Job -Job $_ })
$jobs | Remove-Job -Force
Assert-Condition ((@($concurrentResults | Where-Object { $_ -eq 0 }).Count -eq 1) -and (@($concurrentResults | Where-Object { $_ -ne 0 }).Count -eq 1)) "concurrent requests publish only one batch"
Assert-Condition (Test-Path -LiteralPath (Join-Path $batchesRoot $concurrentId)) "one concurrent request publishes its batch"

$failureId = "failure-$testId"
Assert-Condition ((Invoke-Create -BatchId $failureId -AttachmentsPath (Join-Path $sourceRoot "missing-uploads")) -ne 0) "copy failure is reported"
$failurePath = Join-Path $batchesRoot "$failureId.tmp"
Assert-Condition (Test-Path -LiteralPath (Join-Path $failurePath "failure.json")) "failed temporary batch is marked"
Assert-Condition (-not (Test-Path -LiteralPath (Join-Path $batchesRoot $failureId))) "failed batch is never published"

Write-Host "Backup batch generation reliability tests passed: $workspace" -ForegroundColor Green
