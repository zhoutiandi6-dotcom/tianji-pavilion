param(
  [switch]$NoPause
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$serverDir = Join-Path $root "apps\server"
$webEnvPath = Join-Path $root "apps\web\.env.local"
$serverLog = Join-Path $root "server-runtime.log"
$serverErr = Join-Path $root "server-runtime.err"
$webLog = Join-Path $root "web-runtime.log"
$webErr = Join-Path $root "web-runtime.err"

function Get-LanIp {
  $addresses = Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object {
      $_.IPAddress -notlike "127.*" -and
      (
        $_.IPAddress -like "192.168.*" -or
        $_.IPAddress -like "10.*" -or
        $_.IPAddress -match "^172\.(1[6-9]|2[0-9]|3[0-1])\."
      )
    } |
    Sort-Object @{ Expression = { if ($_.IPAddress -like "192.168.*") { 0 } elseif ($_.IPAddress -like "10.*") { 1 } else { 2 } } }, InterfaceMetric

  if ($addresses) {
    return $addresses[0].IPAddress
  }

  return "127.0.0.1"
}

function Stop-TianjiProcesses {
  Get-NetTCPConnection -LocalPort 3000,3001 -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object {
      try {
        Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
      } catch {}
    }

  $escapedRoot = [Regex]::Escape($root.Path)
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
      try {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
      } catch {}
    }
}

$lanIp = Get-LanIp
$apiUrl = "http://$lanIp`:3001/api"
$frontendUrl = "http://$lanIp`:3000/login"

[System.IO.File]::WriteAllText($webEnvPath, "NEXT_PUBLIC_API_URL=$apiUrl`n", [System.Text.UTF8Encoding]::new($false))

Stop-TianjiProcesses
Start-Sleep -Seconds 2

Start-Process -FilePath "powershell.exe" `
  -ArgumentList @("-NoProfile", "-Command", "`$env:DATABASE_URL='file:./data/dev.db'; `$env:JWT_SECRET='dev-secret'; npm run start:lan >> '..\..\server-runtime.log' 2>> '..\..\server-runtime.err'") `
  -WorkingDirectory $serverDir `
  -WindowStyle Hidden

Start-Process -FilePath "powershell.exe" `
  -ArgumentList @("-NoProfile", "-Command", "npm run start:lan -w @tianji/web >> 'web-runtime.log' 2>> 'web-runtime.err'") `
  -WorkingDirectory $root `
  -WindowStyle Hidden

Write-Host "TianJi Pavilion starting..."
Write-Host "Frontend: $frontendUrl"
Write-Host "Backend: $apiUrl"
Write-Host "Logs: $webLog / $serverLog"

$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 1
  try {
    $health = Invoke-WebRequest -UseBasicParsing -Uri "$apiUrl/health" -TimeoutSec 2
    $web = Invoke-WebRequest -UseBasicParsing -Uri $frontendUrl -TimeoutSec 5
    if ($health.StatusCode -eq 200 -and $web.StatusCode -eq 200) {
      $ready = $true
      break
    }
  } catch {}
}

Start-Process $frontendUrl

if ($ready) {
  Write-Host "TianJi Pavilion is ready."
} else {
  Write-Host "TianJi Pavilion start command has been issued. First compile may need a few more seconds. Refresh later if the page is not ready."
}

if (-not $NoPause) {
  Write-Host "Press any key to close this window. Services will keep running in background."
  $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}
