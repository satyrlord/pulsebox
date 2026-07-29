# Test slop

Test slop gives no unique defect signal, gives false confidence, or checks the
wrong contract. It can also be unstable or cost more than its evidence warrants.

A smell starts an inspection. It does not prove that a test is slop.

## Qualification evidence

Before you edit a candidate, identify its protected behavior and relevant
defect. Require current code, an owning contract, and a sibling test.

If evidence proves one of these findings, classify a test as slop:

- **No signal:** No observable postcondition exists, or the assertion is tautological.
- **False signal:** The expected value repeats the production algorithm or mock value.
- **Wrong contract:** The test checks an unowned internal detail.
- **Unreliable signal:** The test depends on leaked state, order, random input, or arbitrary delay.
- **Duplicate signal:** Another test catches the same defect under the same conditions.
- **Disproportionate cost:** The test adds maintenance or runtime without distinct evidence.

Coverage, test count, file size, mock count, and assertion count are not proof.
Coverage shows execution. It does not prove that a test checked a meaningful result.

## High-confidence candidates

Inspect these candidates first:

- empty bodies, tautologies, self-equality, and assertions that accept almost any result
- stale `only`, `skip`, or `todo` markers
- files that current runner configuration cannot discover
- missing imports, wrong runner APIs, and mocks that conflict with real contracts
- a mocked subject under test
- assertions that repeat a configured mock result
- leaked spies, globals, timers, module mocks, or fixture state
- real sleeps, arbitrary timeouts, and immediate reads of eventual UI state
- long structural selectors and positional locators that hide user intent
- blind snapshot updates, unstable snapshots, and debug output

## Contract-tracing candidates

After you trace the contract, inspect these candidates:

- happy paths that omit owned failures or boundaries
- assertions on private methods or unowned call order
- expected values that restate production code
- mocks for fast deterministic collaborators
- several tests with the same setup and behavioral assertion
- one test that mixes unrelated behavior
- shared setup that hides or performs unused work
- broad snapshots that exceed the stable public contract
- E2E paths that add no integration or runtime evidence

## Valid counterexamples

If context proves one of these values, keep the test:

- the runner detects a throw, compile, callback, or non-throw contract without `expect`
- several assertions describe one coherent outcome
- a table or literal makes boundaries clear
- a mock controls a slow, destructive, random, or external boundary
- exact interaction is the public contract
- a fixed wait is part of an explicit timing contract
- a focused snapshot owns a stable render, schema, or serialized value
- a simple test protects an important invariant
- small duplication improves isolation and local clarity

## Cleanup process

1. Read scripts, runner configuration, setup, production code, contract, test, and one sibling.
   Completion criterion: You know the runner, environment, fixtures, and claimed behavior.
2. Run the candidate unchanged with the narrowest configured command.
   Completion criterion: You record the pre-edit result and pre-existing failures.
3. State the unique behavior and defect for each candidate.
   Completion criterion: Each proposed edit has evidence beyond a smell name.
4. If static evidence cannot prove signal, use a temporary controlled fault.
   Completion criterion: The test responds as predicted and you remove the fault.
5. Select the smallest safe disposition.
   Completion criterion: The choice follows the rules below.
6. Run every changed test and its owning test project.
   Completion criterion: The full affected suite passes, or you report a pre-existing blocker.
7. Report each disposition and skipped proof.
   Completion criterion: You account for every candidate and runtime area.

## Dispositions

- **Keep:** The signal is unique, or material uncertainty remains.
- **Refactor:** A public result can replace an internal or unstable assertion.
- **Merge:** Distinct cases remain visible after the merge.
- **Delete:** The test is empty, irrecoverable, or proven duplicate.
- **Replace:** A meaningful contract test must preserve the only intended protection.

For browser tests, build the production app. Serve the production app. Run the
configured Chrome project. Do not invent commands.
