[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$script:TargetRuleDisplayName = "Tianji LAN TCP 3000-3001 Inbound"
$script:TianjiProgram = "E:\node.exe"
$script:TianjiLocalAddress = "192.168.13.126"
$script:TianjiRemoteAddress = "192.168.12.0/23"
$script:TianjiPorts = @("3000", "3001")
$script:Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$script:RollbackFile = $null
$script:TargetRuleCreated = $false
$script:TargetRuleName = $null
$script:BroadRuleBaseline = @{}
$script:BroadRulesDisabledByRun = @()

function Test-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Assert-Administrator {
  if (-not (Test-Administrator)) {
    throw "Administrator rights are required. Re-run this script from an elevated PowerShell session."
  }
}

function Get-RuleDetails {
  param([Parameter(Mandatory = $true)]$Rule)

  $portFilter = Get-NetFirewallPortFilter -AssociatedNetFirewallRule $Rule -ErrorAction Stop
  $addressFilter = Get-NetFirewallAddressFilter -AssociatedNetFirewallRule $Rule -ErrorAction Stop
  $applicationFilter = Get-NetFirewallApplicationFilter -AssociatedNetFirewallRule $Rule -ErrorAction Stop
  return [pscustomobject]@{
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

function Split-RuleValues {
  param([object[]]$Values)
  return @($Values | ForEach-Object { [string]$_ -split "," } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
}

function Test-TargetRuleParameters {
  param([Parameter(Mandatory = $true)]$Rule)

  $details = Get-RuleDetails -Rule $Rule
  $ports = @(Split-RuleValues @($details.LocalPort) | Sort-Object -Unique)
  $localAddresses = @(Split-RuleValues @($details.LocalAddress) | Sort-Object -Unique)
  $remoteAddresses = @(Split-RuleValues @($details.RemoteAddress) | Sort-Object -Unique)
  $profile = [int]$Rule.Profile
  $hasPublic = ($profile -band 4) -ne 0
  $hasPrivate = ($profile -band 2) -ne 0
  $remoteAddressMatches = $remoteAddresses.Count -eq 1 -and $remoteAddresses[0] -in @(
    $script:TianjiRemoteAddress,
    "192.168.12.0/255.255.254.0"
  )

  return (
    $Rule.Direction -eq "Inbound" -and
    $Rule.Action -eq "Allow" -and
    $Rule.Enabled -eq "True" -and
    $details.Program -ieq $script:TianjiProgram -and
    $details.Protocol -eq "TCP" -and
    $ports.Count -eq 2 -and $ports[0] -eq "3000" -and $ports[1] -eq "3001" -and
    $localAddresses.Count -eq 1 -and $localAddresses[0] -eq $script:TianjiLocalAddress -and
    $remoteAddressMatches -and
    $hasPublic -and $hasPrivate
  )
}

function Test-BroadNodeRuleParameters {
  param([Parameter(Mandatory = $true)]$Rule)

  $details = Get-RuleDetails -Rule $Rule
  return (
    $Rule.DisplayName -eq "Node.js JavaScript Runtime" -and
    $Rule.Direction -eq "Inbound" -and
    $Rule.Action -eq "Allow" -and
    [int]$Rule.Profile -eq 6 -and
    $details.Program -ieq $script:TianjiProgram -and
    $details.Protocol -in @("TCP", "UDP") -and
    $details.LocalPort -eq "Any" -and
    $details.LocalAddress -eq "Any" -and
    $details.RemoteAddress -eq "Any"
  )
}

function Test-RuleIdentity {
  param(
    [Parameter(Mandatory = $true)]$Rule,
    [Parameter(Mandatory = $true)]$Expected
  )

  $current = Get-RuleDetails -Rule $Rule
  foreach ($property in "Name", "DisplayName", "Direction", "Action", "Profile", "Program", "Protocol", "LocalPort", "LocalAddress", "RemoteAddress") {
    if ([string]$current.$property -ne [string]$Expected.$property) { return $false }
  }
  return $true
}

function Get-BroadNodeRules {
  $rules = @(Get-NetFirewallRule -DisplayName "Node.js JavaScript Runtime" -ErrorAction SilentlyContinue | Where-Object {
    $_.Direction -eq "Inbound" -and $_.Action -eq "Allow"
  })
  $matches = foreach ($rule in $rules) {
    if (Test-BroadNodeRuleParameters -Rule $rule) {
      $rule
    }
  }
  return @($matches)
}

function Get-NodeProcessSnapshot {
  return @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ForEach-Object {
    [pscustomobject]@{
      Pid = [int]$_.ProcessId
      ExecutablePath = $_.ExecutablePath
      CommandLine = $_.CommandLine
    }
  })
}

function Assert-NoOtherENodeServices {
  param([Parameter(Mandatory = $true)]$State)

  $tianjiPids = @($State.frontend.pid, $State.backend.pid | Where-Object { $_ })
  $otherENode = @(Get-NodeProcessSnapshot | Where-Object {
    $_.ExecutablePath -ieq $script:TianjiProgram -and $_.Pid -notin $tianjiPids
  })
  if ($otherENode.Count -gt 0) {
    $summary = $otherENode | ForEach-Object { "PID $($_.Pid): $($_.CommandLine)" }
    throw "Other E:\\node.exe services are running. Refusing to disable the broad Node rules. $($summary -join '; ')"
  }

  $otherInboundRules = @(Get-NetFirewallRule -Direction Inbound -ErrorAction SilentlyContinue | ForEach-Object {
    $rule = $_
    $application = Get-NetFirewallApplicationFilter -AssociatedNetFirewallRule $rule -ErrorAction SilentlyContinue
    if ((@($application.Program) -join ",") -ieq $script:TianjiProgram -and
        $rule.DisplayName -ne "Node.js JavaScript Runtime" -and
        $rule.DisplayName -ne $script:TargetRuleDisplayName) {
      $rule
    }
  })
  if ($otherInboundRules.Count -gt 0) {
    throw "Additional inbound E:\\node.exe firewall rules were found. Refusing to disable the broad Node rules: $($otherInboundRules.Name -join ', ')"
  }
}

function Assert-FirewallEnabled {
  $disabled = @(Get-NetFirewallProfile | Where-Object { -not $_.Enabled })
  if ($disabled.Count -gt 0) { throw "Windows Firewall profile is disabled: $($disabled.Name -join ', ')" }
}

function Test-Http200 {
  param([Parameter(Mandatory = $true)][string]$Url)
  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 12
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

function Assert-LocalTianjiHealth {
  Import-Module (Join-Path $PSScriptRoot "tianji-runtime.psm1") -Force -DisableNameChecking
  $state = Read-TianjiState -Root $script:Root
  if (-not $state -or -not $state.frontend -or -not $state.backend -or -not $state.watchdog) {
    throw "Tianji runtime state is incomplete."
  }
  foreach ($service in "frontend", "backend", "watchdog") {
    if (-not (Test-TianjiRecordedProcess -Record $state.$service)) {
      throw "Tianji $service process is missing or fails strict ownership validation."
    }
  }
  foreach ($port in 3000, 3001) {
    $listener = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $listener) { throw "Tianji port $port is not listening." }
  }
  $urls = @(
    "http://127.0.0.1:3000/login",
    "http://127.0.0.1:3001/api/health",
    "http://192.168.13.126:3000/login",
    "http://192.168.13.126:3001/api/health"
  )
  foreach ($url in $urls) {
    if (-not (Test-Http200 -Url $url)) { throw "Tianji health check failed: $url" }
  }
  Assert-FirewallEnabled
  return $state
}

function Restore-LocalFirewallChanges {
  $rollbackFailures = @()

  foreach ($name in @($script:BroadRulesDisabledByRun | Select-Object -Unique)) {
    try {
      $baseline = $script:BroadRuleBaseline[$name]
      $rule = Get-NetFirewallRule -Name $name -ErrorAction Stop
      if (-not (Test-RuleIdentity -Rule $rule -Expected $baseline)) {
        throw "Rule identity changed: $name"
      }
      if ($baseline.Enabled -eq "True" -and $rule.Enabled -eq "False") {
        Enable-NetFirewallRule -Name $name -ErrorAction Stop
      }
    } catch {
      $rollbackFailures += "Could not restore broad Node rule ${name}: $($_.Exception.Message)"
    }
  }

  if ($script:TargetRuleCreated -and $script:TargetRuleName) {
    try {
      $target = Get-NetFirewallRule -Name $script:TargetRuleName -ErrorAction Stop
      if ($target.Name -ne $script:TargetRuleName -or $target.DisplayName -ne $script:TargetRuleDisplayName) {
        throw "The recorded target rule no longer matches this run's newly created rule identity."
      }
      Remove-NetFirewallRule -Name $script:TargetRuleName -ErrorAction Stop
    } catch {
      $rollbackFailures += "Could not remove this run's newly created Tianji rule: $($_.Exception.Message)"
    }
  }

  if ($rollbackFailures.Count -gt 0) {
    Write-Error ($rollbackFailures -join [Environment]::NewLine)
    Write-Error "Local rollback was incomplete. Manual disaster recovery command: netsh advfirewall import `"$script:RollbackFile`""
  } else {
    Write-Warning "Local firewall rollback completed. The .wfw export remains available for manual disaster recovery: $script:RollbackFile"
  }
}

try {
  Assert-Administrator
  Import-Module (Join-Path $PSScriptRoot "tianji-runtime.psm1") -Force -DisableNameChecking
  $initialState = Assert-LocalTianjiHealth
  $baselineNodes = Get-NodeProcessSnapshot

  $rollbackDirectory = "D:\TianjiData\backups\firewall"
  New-Item -ItemType Directory -Path $rollbackDirectory -Force | Out-Null
  $script:RollbackFile = Join-Path $rollbackDirectory ("pre-r3-2b2b-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".wfw")
  netsh advfirewall export $script:RollbackFile | Out-Host
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $script:RollbackFile) -or (Get-Item -LiteralPath $script:RollbackFile).Length -le 0) {
    throw "Windows Firewall export failed. No rules were changed."
  }

  $snapshotPath = [System.IO.Path]::ChangeExtension($script:RollbackFile, ".rules.json")
  $snapshot = @(
    Get-NetFirewallRule -DisplayName "Node.js JavaScript Runtime", $script:TargetRuleDisplayName -ErrorAction SilentlyContinue |
      ForEach-Object { Get-RuleDetails -Rule $_ }
  )
  $snapshot | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $snapshotPath -Encoding utf8

  $broadRules = Get-BroadNodeRules
  if ($broadRules.Count -ne 2) {
    throw "Expected exactly two broad Node.js JavaScript Runtime rules for E:\\node.exe; found $($broadRules.Count). No rules were changed."
  }
  $broadProtocols = @($broadRules | ForEach-Object { (Get-RuleDetails -Rule $_).Protocol } | Sort-Object -Unique)
  if ($broadProtocols.Count -ne 2 -or $broadProtocols[0] -ne "TCP" -or $broadProtocols[1] -ne "UDP") {
    throw "The two broad Node rules are not the expected TCP and UDP pair. No rules were changed."
  }
  foreach ($rule in $broadRules) {
    $script:BroadRuleBaseline[$rule.Name] = Get-RuleDetails -Rule $rule
  }
  Assert-NoOtherENodeServices -State $initialState

  $targetRules = @(Get-NetFirewallRule -DisplayName $script:TargetRuleDisplayName -ErrorAction SilentlyContinue)
  if ($targetRules.Count -gt 1) { throw "More than one Tianji target rule exists. No rules were changed." }
  if ($targetRules.Count -eq 1) {
    if (-not (Test-TargetRuleParameters -Rule $targetRules[0])) {
      throw "A Tianji target rule with the same name has different parameters. No rules were changed."
    }
    $targetRule = $targetRules[0]
  } else {
    $targetRule = New-NetFirewallRule -DisplayName $script:TargetRuleDisplayName -Direction Inbound -Action Allow `
      -Program $script:TianjiProgram -Protocol TCP -LocalAddress $script:TianjiLocalAddress `
      -LocalPort $script:TianjiPorts -RemoteAddress $script:TianjiRemoteAddress -Profile Public,Private -Enabled True
    $targetRule = Get-NetFirewallRule -Name $targetRule.Name -ErrorAction Stop
    $script:TargetRuleCreated = $true
    $script:TargetRuleName = $targetRule.Name
    if (-not (Test-TargetRuleParameters -Rule $targetRule)) {
      throw "The new Tianji firewall rule does not match the required parameters."
    }
  }

  Assert-LocalTianjiHealth | Out-Null
  foreach ($rule in $broadRules) {
    $current = Get-NetFirewallRule -Name $rule.Name -ErrorAction Stop
    $baseline = $script:BroadRuleBaseline[$rule.Name]
    if (-not (Test-RuleIdentity -Rule $current -Expected $baseline)) {
      throw "Broad Node rule identity changed before modification: $($rule.Name)"
    }
    if ($baseline.Enabled -eq "True") {
      Disable-NetFirewallRule -Name $rule.Name -ErrorAction Stop
      $script:BroadRulesDisabledByRun += $rule.Name
      $current = Get-NetFirewallRule -Name $rule.Name -ErrorAction Stop
      if ($current.Enabled -ne "False") { throw "Failed to disable broad Node rule $($rule.Name)." }
    }
    Assert-LocalTianjiHealth | Out-Null
    Assert-NoOtherENodeServices -State (Read-TianjiState -Root $script:Root)
  }

  $finalBroadRules = Get-BroadNodeRules
  if (@($finalBroadRules | Where-Object { $_.Enabled -ne "False" }).Count -ne 0) {
    throw "One or more broad Node rules remain enabled."
  }
  $finalState = Assert-LocalTianjiHealth
  $currentNodes = Get-NodeProcessSnapshot
  $missingNodes = @($baselineNodes | Where-Object { $_.Pid -notin $currentNodes.Pid })
  if ($missingNodes.Count -gt 0) { throw "A pre-existing Node process disappeared during firewall work. No process was stopped by this script; rolling back firewall policy." }

  Write-Host "R3-2B2B AUTOMATION COMPLETE" -ForegroundColor Green
  Write-Host "WAITING FOR MANUAL LAN VALIDATION" -ForegroundColor Yellow
  [pscustomobject]@{
    RollbackFile = $script:RollbackFile
    RuleName = $targetRule.Name
    RuleDisplayName = $targetRule.DisplayName
    RuleEnabled = $targetRule.Enabled
    BroadRuleNames = @($broadRules | ForEach-Object Name)
    BroadRuleEnabled = @($broadRules | ForEach-Object { (Get-NetFirewallRule -Name $_.Name).Enabled })
    FrontendPid = $finalState.frontend.pid
    BackendPid = $finalState.backend.pid
    WatchdogPid = $finalState.watchdog.pid
  } | Format-List
} catch {
  Write-Error $_.Exception.Message
  Restore-LocalFirewallChanges
  exit 1
}
