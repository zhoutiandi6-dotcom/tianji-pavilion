[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$targetDisplayName = "Tianji LAN TCP 3000-3001 Inbound"

function Get-RuleDetails {
  param([Parameter(Mandatory = $true)]$Rule)
  $portFilter = Get-NetFirewallPortFilter -AssociatedNetFirewallRule $Rule -ErrorAction Stop
  $addressFilter = Get-NetFirewallAddressFilter -AssociatedNetFirewallRule $Rule -ErrorAction Stop
  $applicationFilter = Get-NetFirewallApplicationFilter -AssociatedNetFirewallRule $Rule -ErrorAction Stop
  [pscustomobject]@{
    Name = $Rule.Name
    DisplayName = $Rule.DisplayName
    Enabled = $Rule.Enabled
    Direction = $Rule.Direction
    Action = $Rule.Action
    Profile = $Rule.Profile
    Program = @($applicationFilter.Program) -join ","
    Protocol = @($portFilter.Protocol) -join ","
    LocalPort = @($portFilter.LocalPort) -join ","
    LocalAddress = @($addressFilter.LocalAddress) -join ","
    RemoteAddress = @($addressFilter.RemoteAddress) -join ","
  }
}

function Get-HealthStatus {
  param([string]$Url)
  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 12
    return [pscustomobject]@{ Url = $Url; Status = $response.StatusCode }
  } catch {
    $status = if ($_.Exception.Response) { $_.Exception.Response.StatusCode.value__ } else { $null }
    return [pscustomobject]@{ Url = $Url; Status = $status }
  }
}

try {
  Import-Module (Join-Path $PSScriptRoot "tianji-runtime.psm1") -Force -DisableNameChecking
  $state = Read-TianjiState -Root $root
  $targetRules = @(Get-NetFirewallRule -DisplayName $targetDisplayName -ErrorAction SilentlyContinue | ForEach-Object { Get-RuleDetails -Rule $_ })
  $broadRules = @(Get-NetFirewallRule -DisplayName "Node.js JavaScript Runtime" -ErrorAction SilentlyContinue | ForEach-Object { Get-RuleDetails -Rule $_ })
  $listeners = Get-NetTCPConnection -State Listen -LocalPort 3000,3001 -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,OwningProcess
  $profiles = Get-NetFirewallProfile | Select-Object Name,Enabled,DefaultInboundAction,DefaultOutboundAction
  $health = @(
    "http://127.0.0.1:3000/login",
    "http://127.0.0.1:3001/api/health",
    "http://192.168.13.126:3000/login",
    "http://192.168.13.126:3001/api/health"
  ) | ForEach-Object { Get-HealthStatus -Url $_ }
  $nodeProcesses = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Select-Object ProcessId,ExecutablePath,CommandLine
  [pscustomobject]@{
    TianjiRule = $targetRules
    BroadNodeRules = $broadRules
    FirewallProfiles = $profiles
    Listeners = $listeners
    Health = $health
    TianjiProcesses = [pscustomobject]@{
      Frontend = $state.frontend.pid
      Backend = $state.backend.pid
      Watchdog = $state.watchdog.pid
    }
    NodeProcesses = $nodeProcesses
  } | ConvertTo-Json -Depth 6
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
