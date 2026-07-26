#!/usr/bin/env pwsh
# Human-in-the-loop reproduction loop.
# Copy this file, edit the steps below, and run it.
# The agent runs the script; the user follows prompts in their terminal.
#
# Usage:
#   ./hitl-loop.template.ps1
#
# Two helpers:
#   step "<instruction>"          → show instruction, wait for Enter
#   capture VAR "<question>"      → show question, read response into VAR
#
# At the end, captured values are printed as KEY=VALUE for the agent to parse.

function step {
  param([string]$message)
  Write-Host "`n>>> $message"
  Read-Host "    [Enter when done]" | Out-Null
}

function capture {
  param([string]$varName, [string]$question)
  Write-Host "`n>>> $question"
  $answer = Read-Host "    > "
  Set-Variable -Name $varName -Value $answer -Scope 1
}

# --- edit below ---------------------------------------------------------

step "Open the app at http://localhost:3000 and sign in."

capture ERRORED "Click the 'Export' button. Did it throw an error? (y/n)"

capture ERROR_MSG "Paste the error message (or 'none'):"

# --- edit above ---------------------------------------------------------

Write-Host "`n--- Captured ---"
Write-Host "ERRORED=$ERRORED"
Write-Host "ERROR_MSG=$ERROR_MSG"
