# Diagnose Examples

## Example 1: Tracker Dropout With Unclear Root Cause

- Prompt shape: "Diagnose these recurring dropout bars in one song."
- Good behavior: build one feedback loop, rank hypotheses, instrument one seam
  at a time, and stop guessing.
- Good result: a validated root cause or a tighter owning seam for the next
  slice.

## Example 2: Flaky Setup Crash

- Prompt shape: "The setup flow sometimes crashes when I open a picker."
- Good behavior: confirm a reproducible loop first, then isolate whether the
  fault is dialog hosting, UI thread affinity, or async state handling.
- Good result: one local repair plus a guard validation step.

## Example 3: Import Performance Regression

- Prompt shape: "Import got slower after this refactor; diagnose it."
- Good behavior: capture a baseline, compare candidate hot paths, and measure
  before changing code.
- Good result: a quantified regression source, not a speculative optimization.
