# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Read [AGENTS.md](AGENTS.md) first. It holds every Pulsebox rule. These rules
cover the product, repository, architecture, audio, state, UI, and checks.
Nothing in it is specific to one agent tool.

Claude Code specifics:

- Use plain English for answers. Keep each answer short and precise.
- Repository skills live in `.github/skills/`. The `.claude/skills/` and
  `.agents/skills/` junctions point to that source.
- Invoke a skill with the Skill tool and its directory name. If the workflow is
  unclear, read `.github/skills/SKILLS.md`.
- `.github/copilot-instructions.md` points to the same AGENTS.md. When agent
  instructions change, keep the three entry documents consistent.
