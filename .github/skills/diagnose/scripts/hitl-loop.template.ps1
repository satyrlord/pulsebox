#!/usr/bin/env pwsh
# Human-in-the-loop Pulsebox reproduction loop.
# Copy this file to an ignored temporary path and replace the example steps.

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

# Discover the current localhost URL from the repository dev or preview command.
# Replace this example with the exact action that reproduces the issue.
step "Open the running Pulsebox browser application at its reported localhost URL."
capture REPRODUCED "Perform the target action. Did the exact issue occur? (y/n)"
capture DETAILS "Paste the error or describe the visible or audible result:"

Write-Host ""
Write-Host "--- Captured ---"
Write-Host "REPRODUCED=$REPRODUCED"
Write-Host "DETAILS=$DETAILS"
