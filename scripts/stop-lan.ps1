param([switch]$NoPause)

# Compatibility entry point for existing shortcuts. Only processes recorded by
# the Tianji runtime state are eligible to be stopped.
& (Join-Path $PSScriptRoot "stop-tianji.ps1") -NoPause:$NoPause
exit $LASTEXITCODE
