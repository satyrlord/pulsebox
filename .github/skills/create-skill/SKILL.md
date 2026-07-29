---
name: create-skill
description: >
  Create or revise predictable skills. Use for skill triggers, ordered steps,
  completion criteria, reference structure, pruning, and Simplified Technical English.
---

# Create predictable skills

A skill makes an agent use a predictable process. It does not require the same
output on each run.

Read [GLOSSARY.md](GLOSSARY.md) when a term in this skill needs a definition.

## 1. Establish the contract

1. Read the repository instructions and the complete current skill.
   Finish when all applicable rules and existing user changes are known.
2. Collect concrete request examples for each valid branch.
   Finish when each branch has a trigger, output, boundary, and failure case.
3. Decide whether the agent or only the user must invoke the skill.
   Finish when the invocation choice has a stated reason.

Use model invocation when the agent or another skill must find the skill.
Otherwise, use user invocation when the host supports that mode.

## 2. Design the information hierarchy

1. Put ordered actions in `SKILL.md`.
   Finish when the required process has one clear order.
2. End each step with a checkable completion criterion.
   Finish when the agent can distinguish complete work from incomplete work.
3. Keep rules that every branch needs in `SKILL.md`.
   Finish when no required branch depends on hidden core instructions.
4. Move branch-only facts and examples to direct reference files.
   Finish when each pointer states exactly when to read its target.
5. Keep each meaning in one authoritative place.
   Finish when no instruction or definition has a duplicate owner.

Keep reference files one level below `SKILL.md`. Add a contents list to a
reference file when the file is longer than 100 lines.

## 3. Write the skill

1. Start the description with the action or leading word.
   Finish when the description states the distinct triggers without synonyms.
2. Use imperative sentences for procedures.
   Finish when each procedure has one action in each numbered step.
3. Apply the [repository STE contract](../../../AGENTS.md#writing).
   Finish when the prose passes the repository STE self-lint.
4. Preserve code, identifiers, paths, and command syntax.
   Finish when prose edits did not change a technical token.
5. Remove stale text, duplication, sprawl, and no-op instructions.
   Finish when each remaining sentence changes behavior or supplies needed reference.

Keep a distinct voice only for an output branch that needs it. State the
branch and its boundary in the skill.

## 4. Validate the package

1. Check the folder name, frontmatter, links, and required files.
   Finish when the package has no structural error.
2. Run the available Codex skill validator on each changed skill folder.
   Finish when every validator run passes.
3. Test each changed branch with a realistic request or artifact.
   Finish when the skill follows its process without hidden context.
4. Re-read the complete package after validation.
   Finish when no criterion, trigger, reference, or STE defect remains.

Use a clean context for forward tests of complex or substantially changed
skills. Give the test agent the request and raw artifacts. Do not give it the
expected answer or the prior audit findings.

## Completion criterion

The work is complete when every branch has a precise trigger and a checkable
result. All package and STE checks must pass. Every remaining line must have one
owner and a clear purpose.
