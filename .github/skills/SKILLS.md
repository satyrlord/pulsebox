# Pulsebox agent skills

These repository skills follow [AGENTS.md](../../AGENTS.md) and the
[specification index](../../docs/specs/spec-000-index.md).

Read `package.json` for runnable commands. Do not copy command lists into a
skill.

| Skill | Primary action |
| --- | --- |
| `add-feature` | Change a product contract or implement approved behavior. |
| `create-skill` | Create or revise a predictable skill. |
| `dead-code-audit` | Prove reachability and remove proven dead items. |
| `design-pulsebox-ui` | Design, audit, implement, or repair the React interface. |
| `deslop` | Remove evidence-backed slop without changing true behavior. |
| `diagnose` | Reproduce and isolate a difficult failure. |
| `full-code-review` | Review changes and repair confirmed findings when requested. |
| `grill-me` | Resolve open decisions before implementation. |
| `handoff` | Transfer verified state to a fresh agent. |
| `improve-codebase-architecture` | Improve ownership boundaries and structural leverage. |
| `refactor` | Improve structure without changing behavior. |
| `run-quality-gate` | Run or repair configured repository checks. |
| `verify` | Collect production-browser and objective audio evidence. |

Keep each skill concise. Put branch-only detail behind a direct pointer. Do not
add a skill when a current skill already owns the action.
