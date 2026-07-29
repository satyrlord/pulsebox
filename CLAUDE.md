# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Read [AGENTS.md](AGENTS.md) first. It holds every Pulsebox rule: the source of
truth, product boundary, repository map, commands, architecture, audio, state,
UI, naming, verification, and close-out requirements. Nothing in it is specific
to one agent tool.

Claude Code specifics:

- Answers should be in Simple English. Keep answers short, clear, unambiguous and concise.
- Repository skills live in `.github/skills/` while `.claude/skills/` and `.agents\skills` are junctions pointing to the single source.
Invoke one with the Skill tool by its directory name. Start with skills-router when the  right workflow is unclear.
- `.github/copilot-instructions.md` points at the same AGENTS.md. Keep the three entry documents consistent when agent instructions change.
