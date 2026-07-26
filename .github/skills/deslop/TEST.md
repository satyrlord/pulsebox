# Test Slop

"Test slop" has no standard industry definition. Use it here as an operational
label for test code that looks useful but adds no unique defect signal, gives
false confidence, fails for changes outside the tested contract, is unreliable,
or costs more to maintain than its distinct evidence warrants.

Judge the artifact, not its presumed author. A smell is a reason to inspect a
test, never enough evidence to edit or delete it.

## Qualification test

Before changing a candidate, identify the behavior it claims to protect and
the defect that should make it fail. Classify it as test slop only when current
code, an owning spec, and a sibling test support at least one finding:

- **No signal:** it has no observable postcondition, contains a tautology, or
  checks only a value programmed into its own mock.
- **False signal:** its expected result repeats the production algorithm or
  literal, so the same mistake can exist on both sides.
- **Wrong contract:** it asserts private steps, exact internal call order, DOM
  structure, or formatting that the public or user-visible contract does not
  promise.
- **Unreliable signal:** it depends on test order, leaked mocks, wall-clock
  timing, random data, mutable external state, or fixed delays unrelated to a
  timing contract.
- **Duplicate signal:** another test fails for the same relevant defect under
  the same conditions, and this test covers no distinct boundary, regression,
  integration, accessibility, persistence, or error case.
- **Disproportionate cost:** broad fixtures, snapshots, permutations, or UI
  flows add maintenance and runtime without a distinct contract claim.

Do not use coverage percentage, test count, file size, mock count, assertion
count, or a smell detector as proof of any finding. Coverage can show that code
executed; it cannot show that a meaningful result was checked.

## High-confidence candidates

Inspect these first:

- empty bodies, placeholder `expect(true).toBe(true)`, self-equality, or
  assertions so weak that almost any result passes,
- `test.only`, stale `skip`/`todo`, commented-out bodies, and files that the
  current Vitest or Playwright configuration never discovers,
- wrong-runner APIs, imports or symbols that do not exist, and mocks that do
  not match the real dependency contract,
- a mocked subject under test, or an assertion that merely repeats the mock's
  configured return value,
- un-restored spies, globals, fake timers, module mocks, or shared fixture
  state that can leak between tests,
- real sleeps, arbitrary timeouts, immediate DOM-state reads, long CSS/XPath
  selectors, or positional locators used to avoid identifying the intended
  element,
- blind snapshot regeneration, large unstable snapshots, debug printing, and
  copied setup or assertions with no distinct scenario.

## Semantic candidates

These require contract tracing. Do not classify them from syntax alone:

- only happy-path permutations while documented failures or boundaries remain
  untested,
- assertions on private methods, internal state, exact collaborator calls, or
  invocation order,
- expected values computed by restating the production implementation,
- mocks for fast deterministic collaborators that could run for real, or
  hand-written fakes that have drifted from the real interface,
- several tests with different names but the same arrange, act, and behavioral
  assertion,
- one test that mixes unrelated behaviors so a failure does not identify the
  broken contract,
- general setup that hides dependencies or performs work unused by most tests,
- large snapshots or exhaustive property assertions where only a small stable
  subset belongs to the tested contract,
- an expensive E2E scenario that duplicates behavior already proven at a
  smaller layer without adding integration or runtime evidence.

## Valid counterexamples

Keep a candidate when context proves its value. In particular:

- a test without an explicit `expect` can be valid when the runner or harness
  itself fails on a violated throw, non-throw, compilation, or callback
  contract,
- several assertions can describe one coherent outcome,
- table-driven loops and numeric literals can make boundary cases clearer,
- mocks are valid controls for slow, destructive, nondeterministic, or external
  boundaries; exact interactions are valid when the interaction is the
  contract,
- a fixed wait can be part of an explicit timing test,
- a focused snapshot can own a stable serialized, rendered, or schema contract,
- a simple test can protect an important invariant,
- some duplication can improve isolation and local readability.

## Detection and cleanup

1. Read `vitest.config.ts`, `playwright.config.ts`, the shared test setup, the
   production owner, the owning spec, the whole test file, and one sibling.
   Finish when the runner, environment, fixtures, and claimed contracts are
   known.
2. Run the candidate unchanged with the narrowest command that actually
   discovers it. Record pre-existing failures. Finish when there is a baseline,
   not merely a claim that the file looks runnable.
3. For each candidate, write the unique behavior and relevant defect it should
   catch. Use a temporary controlled fault or mutation when static reasoning
   cannot prove whether the test has signal; restore the source immediately.
   Finish when every edit has evidence beyond a smell name.
4. Choose the smallest safe disposition:
   - **keep** when the signal is unique or uncertainty remains,
   - **refactor** to assert the public outcome, use a real collaborator or
     faithful fake, isolate state, narrow a snapshot, or use Playwright's
     user-facing locators and retrying assertions,
   - **merge/parameterize** only when distinct cases remain visible,
   - **delete** only when the test is empty, unrecoverable, or proven duplicate
     and the retained suite still catches the same relevant defect,
   - **replace** a weak sole test with a meaningful contract test instead of
     removing the only intended protection.
5. Run every edited test, then its owning project. Use
   `npx vitest run <file> --project=<renderer|backend>` for unit/backend files.
   Use `npx playwright test <file> --project=<name>` for E2E files. Run
   `npm test` after Vitest cleanup; build and run the affected Electron project
   after E2E cleanup.
6. Report kept, refactored, merged, deleted, and replaced tests separately.
   Name any skipped mutation check, pre-existing failure, undiscovered file, or
   unverified runtime surface.

## Research basis

Use these sources to interpret candidates, not as universal bans:

- [Vitest: Writing Tests with AI](https://main.vitest.dev/guide/learn/writing-tests-with-ai)
  covers weak assertions, over-mocking, implementation coupling, wrong APIs,
  mock leakage, missing edge cases, and the need to run generated tests.
- [Vitest: Testing in Practice](https://main.vitest.dev/guide/learn/testing-in-practice)
  anchors tests on input, output, side-effect, and error contracts and explains
  when real collaborators, fakes, or mocks are appropriate.
- [Playwright best practices](https://playwright.dev/docs/best-practices) covers
  isolation, user-visible behavior, resilient locators, and retrying assertions.
- [Software Unit Test Smells](https://testsmells.org/pages/testsmells.html)
  supplies established smell names, but its static patterns remain candidates.
- [Stryker mutation testing](https://stryker-mutator.io/docs/) distinguishes
  executing code from detecting an injected behavioral fault.
- [Martin Fowler: Test Coverage](https://martinfowler.com/bliki/TestCoverage.html)
  explains why high coverage can coexist with low-quality tests.
