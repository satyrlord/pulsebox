#!/usr/bin/env pwsh
# Pulsebox human-in-the-loop reproduction.
# Copy this file to an ignored temporary path.
# Replace the example actions before you run it.

function step {
  param([string]$Message)
  Write-Host ""
  Write-Host ">>> $Message"
  Read-Host "    [Enter when done]" | Out-Null
}

function capture {
  param([string]$VariableName, [string]$Question)
  Write-Host ""
  Write-Host ">>> $Question"
  $answer = Read-Host "    > "
  Set-Variable -Name $VariableName -Value $answer -Scope 1
}

# Use the canonical Pulsebox origin.
# Replace this example with the exact reproduction action.
step "Open the running Pulsebox browser application at http://127.0.0.1:4173."
capture REPRODUCED "Perform the target action. Did the exact issue occur? (y/n)"
capture DETAILS "Paste the error or describe the visible or audible result:"

Write-Host ""
Write-Host "--- Captured ---"
Write-Host "REPRODUCED=$REPRODUCED"
Write-Host "DETAILS=$DETAILS"
