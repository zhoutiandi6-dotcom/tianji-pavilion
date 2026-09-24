Set-StrictMode -Version Latest

$script:TianjiAllowedOrgPermissionModes = @('compatibility', 'strict')

function Resolve-TianjiExpectedOrgPermissionMode {
  param([AllowNull()][string]$ExpectedOrgPermissionMode)

  if ([string]::IsNullOrWhiteSpace($ExpectedOrgPermissionMode)) {
    throw "DEPLOY_BLOCKED`nExpectedOrgPermissionMode is required. Refusing to infer an organization permission mode."
  }
  $normalized = $ExpectedOrgPermissionMode.Trim().ToLowerInvariant()
  if ($script:TianjiAllowedOrgPermissionModes -notcontains $normalized) {
    throw "DEPLOY_BLOCKED`nExpectedOrgPermissionMode must be one of: $($script:TianjiAllowedOrgPermissionModes -join ', ')."
  }
  return $normalized
}

function Resolve-TianjiConfiguredOrgPermissionMode {
  param([AllowNull()][string]$ConfiguredOrgPermissionMode)

  if ([string]::IsNullOrWhiteSpace($ConfiguredOrgPermissionMode)) {
    throw "DEPLOY_BLOCKED`nFormal ORG_PERMISSION_ENFORCEMENT is missing."
  }
  $normalized = $ConfiguredOrgPermissionMode.Trim().ToLowerInvariant()
  if ($script:TianjiAllowedOrgPermissionModes -notcontains $normalized) {
    throw "DEPLOY_BLOCKED`nFormal ORG_PERMISSION_ENFORCEMENT must be one of: $($script:TianjiAllowedOrgPermissionModes -join ', ')."
  }
  return $normalized
}

function Assert-TianjiExpectedOrgPermissionMode {
  param(
    [AllowNull()][string]$ConfiguredOrgPermissionMode,
    [AllowNull()][string]$ExpectedOrgPermissionMode
  )

  $expected = Resolve-TianjiExpectedOrgPermissionMode $ExpectedOrgPermissionMode
  $configured = Resolve-TianjiConfiguredOrgPermissionMode $ConfiguredOrgPermissionMode
  if ($configured -ne $expected) {
    throw "DEPLOY_BLOCKED`nFormal ORG_PERMISSION_ENFORCEMENT '$configured' does not match ExpectedOrgPermissionMode '$expected'."
  }
  return $configured
}

Export-ModuleMember -Function Resolve-TianjiExpectedOrgPermissionMode, Resolve-TianjiConfiguredOrgPermissionMode, Assert-TianjiExpectedOrgPermissionMode
