# Skill glossary

This file defines the terms used by [create-skill](SKILL.md).

## Contents

- [Invocation](#invocation)
- [Structure](#structure)
- [Quality](#quality)
- [Failure modes](#failure-modes)

## Invocation

### Model-invoked skill

A model-invoked skill has a description that lets the agent find and use it.
Other skills can also reach it.

### User-invoked skill

User invocation is valid only when the skill requires an explicit user action
and the host supports this mode.

### Description

The description is the machine-readable trigger for a skill. It states the
action and each distinct request branch.

### Router skill

A router skill directs the user to other user-invoked skills. It reduces the
number of skill names that the user must remember.

### Context load

Context load is the text and attention cost that a skill adds before it runs.

### Cognitive load

Cognitive load is the effort that the user needs to remember and select a
user-invoked skill.

## Structure

### Branch

A branch is one distinct way to invoke or run a skill.

### Steps

Steps are the ordered actions that the agent performs.

### Completion criterion

A completion criterion states the observable condition that ends a step or
task. A strong criterion is clear, checkable, and exhaustive.

### Post-completion steps

Post-completion steps are the steps that follow the current step. Visible later
work can pull attention from the current criterion.

### Reference

Reference is supporting information that the agent reads when a branch needs
it. Examples include rules, facts, schemas, and examples.

### External reference

External reference is supporting information outside the skill package. More
than one skill can use it.

### Information hierarchy

The information hierarchy ranks content by when the agent needs it. Put steps
first, shared reference second, and branch-only reference behind direct pointers.

### Progressive disclosure

Progressive disclosure moves branch-only reference out of `SKILL.md`. A precise
pointer tells the agent when to read that reference.

### Context pointer

A context pointer names out-of-context material and states when to read it. Its
wording controls whether the agent finds the material.

### Co-location

Co-location keeps a concept, its rules, and its limits in one place.

### Granularity

Granularity shows how a design divides work across skills and reference files.
If the split improves invocation or execution, split the content.

## Quality

### Predictability

Predictability is the degree to which a skill produces the same process on each
run. The output can still change with the request.

### Leading word

A leading word is a compact, familiar concept that anchors invocation or
execution. It replaces repeated explanations only when its meaning is precise.

### Legwork

Legwork is the evidence collection and analysis that the agent completes inside
a step. An exhaustive completion criterion increases necessary legwork.

### Single source of truth

A single source of truth gives each instruction, definition, or contract one
authoritative owner.

### Relevance

Relevance measures whether a line still supports the skill process or required
reference.

## Failure modes

### Premature completion

Premature completion ends a step before it meets its criterion. First make the
criterion precise. If later steps still cause the failure, split the sequence.

### Duplication

Duplication gives one meaning more than one owner. It increases context cost and
can make the copies disagree.

### Sediment

Sediment is stale text that remains after the skill or repository changes.

### Sprawl

Sprawl is excess skill length, even when each line is current. Use progressive
disclosure or a justified skill split.

### No-op

A no-op instruction does not change agent behavior. If it does not supply
required domain reference, remove it.
