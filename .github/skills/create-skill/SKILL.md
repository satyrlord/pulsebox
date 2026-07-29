---
name: create-skill
description: >
  Create or revise predictable skills. Use for skill triggers, ordered steps,
  completion criteria, reference structure, pruning, and Simplified Technical English.
---

# Create predictable skills

A skill makes an agent use a predictable process. It does not require the same
output on each run.

If a term in this skill needs a definition, read [GLOSSARY.md](GLOSSARY.md).

## 1. Establish the contract

1. Read the repository instructions and the complete current skill.
   Completion criterion: You know all applicable rules and existing user changes.
2. Collect concrete request examples for each valid branch.
   Completion criterion: Each branch has a trigger, output, boundary, and failure case.
3. Decide whether the agent or only the user must invoke the skill.
   Completion criterion: The invocation choice has a stated reason.

If the agent or another skill must find the skill, use model invocation.
Otherwise, if the host supports user invocation, use it.

## 2. Design the information hierarchy

1. Put ordered actions in `SKILL.md`.
   Completion criterion: The required process has one clear order.
2. End each step with a checkable completion criterion.
   Completion criterion: The agent can distinguish complete work from incomplete work.
3. Keep rules that every branch needs in `SKILL.md`.
   Completion criterion: No required branch depends on hidden core instructions.
4. Move branch-only facts and examples to direct reference files.
   Completion criterion: Each pointer states exactly when to read its target.
5. Keep each meaning in one authoritative place.
   Completion criterion: No instruction or definition has a duplicate owner.

Keep reference files one level below `SKILL.md`. If a reference file is longer
than 100 lines, add a contents list to it.

## 3. Write the skill

1. Start the description with the action or leading word.
   Completion criterion: The description states the distinct triggers without synonyms.
2. Use imperative sentences for procedures.
   Completion criterion: Each procedure has one action in each numbered step.
3. Apply the [repository STE contract](../../../AGENTS.md#writing).
   Completion criterion: The prose passes the repository STE self-lint.
4. Preserve code, identifiers, paths, and command syntax.
   Completion criterion: Prose edits did not change a technical token.
5. Remove stale text, duplication, sprawl, and no-op instructions.
   Completion criterion: Each remaining sentence changes behavior or supplies needed reference.

If an output branch needs a distinct voice, keep it in that branch. State the
branch and its boundary in the skill.

## 4. Validate the package

1. Check the folder name, frontmatter, links, and required files.
   Completion criterion: The package has no structural error.
2. Run the available Codex skill validator on each changed skill folder.
   Completion criterion: Every validator run passes.
3. Test each changed branch with a realistic request or artifact.
   Completion criterion: The skill follows its process without hidden context.
4. After validation, re-read the complete package.
   Completion criterion: No criterion, trigger, reference, or STE defect remains.

For forward tests of complex or substantially changed skills, use a clean
context. Give the test agent the request and raw artifacts. Do not give it the
expected answer or the prior audit findings.

## Completion criterion

The work is complete when every branch has a precise trigger and a checkable
result. All package and STE checks must pass. Every remaining line must have one
owner and a clear purpose.
