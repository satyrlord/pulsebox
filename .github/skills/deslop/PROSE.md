# Prose slop

Preserve true meaning and intentional voice. Remove prose that hides the point
or conflicts with its owner.

## Simplified Technical English

Apply the [repository STE contract](../../../AGENTS.md#writing) to technical
prose. Use strict mode for procedures, runbooks, safety text, and errors.
Use STE-flavored mode for general technical prose.

If the user asks for clear, plain, controlled, or human technical writing,
apply STE. Do not apply it to code, identifiers, command syntax, marketing copy,
essays, or a required distinct voice.

After the evidence pass, run the STE self-lint. Mechanical rules control form.
They do not prove that a claim is true or useful.

The official standard has copyright protection. If a source is necessary, link
to the [official ASD-STE100 site](https://asd-ste100.org).
Do not copy the complete standard into the repository.

## Empty framing

Inspect these candidates:

- an introduction that delays the actual point
- a rhetorical question or fragment used only for emphasis
- a vague declaration with no concrete information
- text about what the document will say
- a transition that the heading already supplies

## Inflated style

Inspect these candidates:

- business or trend words that replace a specific claim
- repeated contrasts that restate one conclusion
- absolute claims without evidence
- repeated sentence patterns that imply false equivalence
- modifiers or passive clauses that hide the actor or claim

Outside the STE contract, do not ban a word class or voice. If a rewrite is
more precise and agrees with sibling documents, use it.

## Stale information

Inspect these candidates:

- historical notes with no current constraint
- TODO items with no owner, condition, or work item
- descriptions of removed files, commands, or behavior
- summaries that omit evidence needed for action

If history explains a current constraint or prevents a rejected decision, keep
it. If necessary, move that fact to the durable owner.
