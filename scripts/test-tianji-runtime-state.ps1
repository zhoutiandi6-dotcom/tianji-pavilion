param(
  [string]$TestRoot = (Join-Path $env:TEMP "tianji-runtime-state-tests")
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$testId = [Guid]::NewGuid().ToString("N")
$workspace = Join-Path $TestRoot $testId
$dataRoot = Join-Path $workspace "data"
$runtimeRoot = Join-Path $workspace "runtime"

function Assert-Condition {
  param([bool]$Condition, [string]$Message)
  if (-not $Condition) { throw "Assertion failed: $Message" }
}

$oldDataRoot = $env:TIANJI_DATA_ROOT
$oldTemp = $env:TEMP
try {
  New-Item -ItemType Directory -Path $dataRoot, $runtimeRoot -Force | Out-Null
  $env:TIANJI_DATA_ROOT = $dataRoot
  $env:TEMP = $runtimeRoot
  Import-Module (Join-Path $projectRoot "scripts\tianji-runtime.psm1") -Force -DisableNameChecking

  $state = New-TianjiState -Root $projectRoot
  $state.backend = [pscustomobject]@{
    pid = 424242
    startedAt = "2026-01-01T00:00:00.0000000Z"
    processName = "node"
    executablePath = "C:\\Program Files\\nodejs\\node.exe"
    commandLine = "node dist\\main.js"
    workingDirectory = (Join-Path $projectRoot "apps\server")
    service = "backend"
    port = 3001
  }
  Write-TianjiState -State $state -Root $projectRoot

  $durable = Get-TianjiDurableStateFile -Root $projectRoot
  $temporary = Get-TianjiStateFile
  Assert-Condition (Test-Path -LiteralPath $durable) "durable runtime state is written under the data root"
  Assert-Condition (Test-Path -LiteralPath $temporary) "temporary runtime state mirror is written"

  Remove-Item -LiteralPath $temporary -Force
  $fromDurable = Read-TianjiState -Root $projectRoot
  Assert-Condition ($fromDurable.backend.pid -eq 424242) "durable state recovers a missing temporary state"

  Remove-Item -LiteralPath $durable -Force
  Write-TianjiLifecycleEvent -Root $projectRoot -Event ([pscustomobject]@{
    at = (Get-Date).ToUniversalTime().ToString("o")
    action = "service-started"
    projectRoot = $projectRoot
    service = "backend"
    record = $state.backend
  })
  $fromLifecycle = Read-TianjiState -Root $projectRoot
  Assert-Condition ($fromLifecycle.backend.pid -eq 424242) "lifecycle log recovers a missing runtime state"

  Write-Host "Tianji runtime state tests passed: $workspace" -ForegroundColor Green
} finally {
  $env:TIANJI_DATA_ROOT = $oldDataRoot
  $env:TEMP = $oldTemp
  if (Test-Path -LiteralPath $workspace) {
    $resolvedWorkspace = (Resolve-Path -LiteralPath $workspace).Path
    $resolvedRoot = (Resolve-Path -LiteralPath $TestRoot).Path
    if ($resolvedWorkspace.StartsWith($resolvedRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
      Remove-Item -LiteralPath $resolvedWorkspace -Recurse -Force
    }
  }
}
