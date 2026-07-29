# Prose Slop

Preserve meaning and intentional voice. Remove prose that makes the next
reader reconstruct the point or that conflicts with the surrounding document.

## Simplified Technical English

Apply the [repository STE contract](../../../AGENTS.md#writing) to technical
prose. Use strict mode for procedures, runbooks, safety text, and error
messages. Use STE-flavored mode for general technical prose.

Use STE when the user asks for clear, plain, controlled, non-AI, or human
technical writing. Do not apply STE to code, identifiers, or command syntax.
Do not apply STE to marketing copy, essays, or text that needs a distinct
voice.

Run the STE self-lint after the evidence pass. The mechanical rules control
form. They do not prove that a claim is true or useful. Check each claim
against the file, its siblings, and the repository contract.

The official standard is copyrighted. Link to the
[official ASD-STE100 site](https://asd-ste100.org) when a source is necessary.
Do not copy the full standard into the repository.

## Empty framing

- Throat-clearing, hand-holding, and signposting before the actual point
- Rhetorical questions or dramatic fragments used only for emphasis
- Pull-quote sentences and vague declarations without concrete information
- Meta-commentary about what the document will say instead of saying it
- Filler transitions that headings already provide

## Inflated style

- Business or trend jargon standing in for a specific claim
- Repeated binary contrasts or negative lists that restate one conclusion
- Lazy absolutes unsupported by the document's evidence
- Metronomic list and sentence patterns that make unrelated ideas sound equal
- Adverbs, passive constructions, or emphatic phrases that obscure the actor
  or claim

Outside the STE contract, do not ban a word class or grammatical voice.
Rewrite only when the sentence becomes more precise and stays consistent with
sibling documents.

## Stale information

- Historical notes whose constraint no longer applies
- TODOs with no owner, condition, or live work item
- Descriptions of files, commands, or behavior that no longer exist
- Polished summaries that omit the evidence needed to act

Retain history when it explains a current constraint or prevents a rejected
decision from being reintroduced; move it to the owning durable document when
necessary.
