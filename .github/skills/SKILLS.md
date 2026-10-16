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
| `full-code-review` | Review changes. If the user requests a repair, repair confirmed findings. |
| `grill-me` | Before implementation, resolve open decisions. |
| `improve-codebase-architecture` | Improve ownership boundaries and reduce structural friction. |
| `refactor` | Improve structure without changing behavior. |
| `run-quality-gate` | Run or repair configured repository checks. |
| `verify` | Collect production-browser and objective audio evidence. |

Keep each skill concise. Put branch-only detail behind a direct pointer. If a
current skill owns the action, do not add a skill.

Each indexed skill must have a matching directory with a `SKILL.md` file.
The documentation tests check this requirement in CI.
