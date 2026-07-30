param([switch]$NoBrowser)

# Compatibility entry point for existing shortcuts. LAN startup is now owned by
# the stateful launcher so this script cannot write a fixed API IP or create a
# second set of services.
& (Join-Path $PSScriptRoot "start-tianji.ps1") -NoBrowser:$NoBrowser
exit $LASTEXITCODE
