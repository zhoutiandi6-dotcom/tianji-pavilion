$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'deployment-org-mode.psm1') -Force

function Assert-Pass {
  param([string]$Current, [string]$Expected, [string]$Name)
  $actual = Assert-TianjiExpectedOrgPermissionMode -ConfiguredOrgPermissionMode $Current -ExpectedOrgPermissionMode $Expected
  if ($actual -ne $Expected) { throw "$Name returned '$actual', expected '$Expected'." }
  Write-Host "PASS $Name"
}

function Assert-Fail {
  param([AllowNull()][string]$Current, [AllowNull()][string]$Expected, [string]$Name)
  try {
    Assert-TianjiExpectedOrgPermissionMode -ConfiguredOrgPermissionMode $Current -ExpectedOrgPermissionMode $Expected | Out-Null
  } catch {
    Write-Host "PASS $Name"
    return
  }
  throw "$Name unexpectedly passed."
}

Assert-Pass -Current 'strict' -Expected 'strict' -Name 'strict_expected_strict'
Assert-Fail -Current 'strict' -Expected 'compatibility' -Name 'strict_expected_compatibility'
Assert-Pass -Current 'compatibility' -Expected 'compatibility' -Name 'compatibility_expected_compatibility'
Assert-Fail -Current 'compatibility' -Expected 'strict' -Name 'compatibility_expected_strict'
Assert-Fail -Current 'strict' -Expected $null -Name 'expected_missing'
Write-Host 'DEPLOY_ORG_MODE_MATRIX_PASS'
