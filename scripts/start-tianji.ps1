$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $env:TEMP 'tianji-runtime'
$serverOut = Join-Path $runtimeDir 'server.out.log'
$serverErr = Join-Path $runtimeDir 'server.err.log'
$webOut = Join-Path $runtimeDir 'web.out.log'
$webErr = Join-Path $runtimeDir 'web.err.log'

function Test-Endpoint {
  param([string]$Url)
  try {
    (Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 3).StatusCode -eq 200
  } catch {
    $false
  }
}

function Stop-TianjiPortProcess {
  param([int]$Port)
  $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  foreach ($connection in $connections) {
    $process = Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
    if ($process -and $process.ProcessName -eq 'node') {
      # npm/nest/next can create child processes. Terminate the full tree so a
      # watcher cannot immediately recreate a listener on the same port.
      Start-Process -FilePath 'taskkill.exe' -ArgumentList @('/PID', $process.Id, '/T', '/F') -WindowStyle Hidden -Wait -ErrorAction SilentlyContinue
    } elseif ($process) {
      throw "Port $Port is occupied by $($process.ProcessName). Close it before starting Tianji."
    }
  }
}

function Stop-TianjiDevelopmentProcesses {
  $targets = Get-CimInstance Win32_Process | Where-Object {
    $_.CommandLine -and $_.CommandLine -match '@tianji/(server|web)'
  }

  foreach ($target in $targets) {
    if ($target.Name -in @('node.exe', 'cmd.exe')) {
      # A parent may already have stopped this process. That is a normal race.
      Start-Process -FilePath 'taskkill.exe' -ArgumentList @('/PID', $target.ProcessId, '/T', '/F') -WindowStyle Hidden -Wait -ErrorAction SilentlyContinue
    }
  }
}

function Wait-ForPortRelease {
  param([int]$Port, [int]$TimeoutSeconds = 15)
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if (-not $listener) { return $true }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

function Wait-ForEndpoint {
  param([string]$Url, [int]$TimeoutSeconds)
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-Endpoint -Url $Url) { return $true }
    Start-Sleep -Seconds 2
  }
  $false
}

Set-Location $root
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw 'Node.js or npm was not found. Install Node.js LTS first.'
}
if (-not (Test-Path (Join-Path $root 'node_modules'))) {
  throw 'Project dependencies are missing. Run npm install in the project directory first.'
}

Write-Host 'Cleaning up old Tianji services...'
Stop-TianjiDevelopmentProcesses
Stop-TianjiPortProcess -Port 3000
Stop-TianjiPortProcess -Port 3001
if (-not (Wait-ForPortRelease -Port 3000) -or -not (Wait-ForPortRelease -Port 3001)) {
  throw 'An old Tianji service still holds port 3000 or 3001. Restart the launcher once after closing its terminal.'
}
Remove-Item -LiteralPath $serverOut, $serverErr, $webOut, $webErr -Force -ErrorAction SilentlyContinue

if (-not (Test-Path (Join-Path $root 'apps\server\dist\main.js')) -or -not (Test-Path (Join-Path $root 'apps\web\.next\BUILD_ID'))) {
  throw 'Build artifacts are missing. Run npm run build before starting Tianji.'
}

Write-Host 'Starting backend...'
Start-Process -FilePath 'cmd.exe' -WorkingDirectory $root -WindowStyle Hidden -ArgumentList "/c npm run start -w @tianji/server 1>`"$serverOut`" 2>`"$serverErr`""
if (-not (Wait-ForEndpoint -Url 'http://localhost:3001/api/health' -TimeoutSeconds 45)) {
  Write-Host 'Backend did not start. Recent error log:' -ForegroundColor Red
  Get-Content -LiteralPath $serverErr -Tail 30 -ErrorAction SilentlyContinue
  exit 1
}

Write-Host 'Starting frontend...'
Start-Process -FilePath 'cmd.exe' -WorkingDirectory $root -WindowStyle Hidden -ArgumentList "/c npm run start:lan -w @tianji/web 1>`"$webOut`" 2>`"$webErr`""
if (-not (Wait-ForEndpoint -Url 'http://localhost:3000' -TimeoutSeconds 75)) {
  Write-Host 'Frontend did not start. Recent error log:' -ForegroundColor Red
  Get-Content -LiteralPath $webErr -Tail 30 -ErrorAction SilentlyContinue
  exit 1
}

$lanAddress = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
  Select-Object -First 1 -ExpandProperty IPAddress

Write-Host ''
Write-Host 'Tianji startup check passed.' -ForegroundColor Green
Write-Host 'Local: http://localhost:3000'
if ($lanAddress) { Write-Host "LAN: http://${lanAddress}:3000" }
Start-Process 'http://localhost:3000'
