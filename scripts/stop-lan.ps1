param(
  [switch]$NoPause
)

$ErrorActionPreference = "SilentlyContinue"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$escapedRoot = [Regex]::Escape($root.Path)

Get-NetTCPConnection -LocalPort 3000,3001 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object {
    Stop-Process -Id $_ -Force
  }

Get-CimInstance Win32_Process |
  Where-Object {
    $_.CommandLine -and
    $_.CommandLine -match $escapedRoot -and
    (
      $_.CommandLine -match "dev:web:lan" -or
      $_.CommandLine -match "start:lan" -or
      $_.CommandLine -match "next dev" -or
      $_.CommandLine -match "dist/main"
    )
  } |
  ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force
  }

Write-Host "TianJi Pavilion local services stopped."
if (-not $NoPause) {
  Write-Host "Press any key to close this window."
  $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}
