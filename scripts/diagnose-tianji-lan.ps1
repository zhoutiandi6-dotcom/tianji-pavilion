Import-Module (Join-Path $PSScriptRoot "tianji-runtime.psm1") -Force -DisableNameChecking

$selection = Select-TianjiLanAddress
Write-Host "Selected LAN IP: $($selection.Selected.IPAddress) ($($selection.Selected.InterfaceAlias))"
Write-Host "Selection reason: $($selection.Reason)"
Write-Host "Candidates:"
$selection.Candidates | Format-Table IPAddress, InterfaceAlias, HasDefaultRoute, RouteMetric -AutoSize

Get-NetConnectionProfile | Select-Object InterfaceAlias, Name, NetworkCategory, IPv4Connectivity | Format-Table -AutoSize
foreach ($port in 3000, 3001) {
  $occupant = Get-TianjiPortOccupant -Port $port
  if ($occupant) { Write-Host "Port ${port}: $($occupant.LocalAddress) PID $($occupant.Pid) $($occupant.ProcessName) $($occupant.ProcessPath)" }
  else { Write-Host "Port ${port}: not listening" }
}

$rules = @(Get-TianjiFirewallRules)
if ($rules.Count -gt 0) { $rules | Select-Object DisplayName, Enabled, Direction, Action, Profile | Format-Table -AutoSize }
else { Write-Host "No Tianji or Node firewall rule was found. No firewall change was made." -ForegroundColor Yellow }

Write-Host "Diagnostics to run from another LAN computer:"
Write-Host "  Test-NetConnection $($selection.Selected.IPAddress) -Port 3000"
Write-Host "  Test-NetConnection $($selection.Selected.IPAddress) -Port 3001"
