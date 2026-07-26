# Pulsebox agent skills

Repository-local skills for repeatable Pulsebox work. Every skill is subordinate
to [AGENTS.md](../../AGENTS.md) and the
[approved product specification](../../docs/pulsebox-unified-spec-v1.0.md).

The repository does not have product code or package scripts yet. Skills must
discover current commands and files instead of assuming that planned tooling is
already available.

| Skill | Use |
| --- | --- |
| add-feature | Define or change a product contract, then keep the specification and acceptance criteria current. |
| dead-code-audit | Prove and optionally remove unreachable browser, worklet, plugin, or asset code. |
| design-pulsebox-ui | Design or verify Pulsebox UI against its approved layout, visual language, themes, and accessibility contract. |
| deslop | Remove evidence-backed low-value code, prose, data, or tests without changing behavior. |
| diagnose | Reproduce and isolate difficult browser, state, persistence, audio, or performance failures. |
| full-code-review | Review a change set against the specification and Pulsebox architecture. |
| grill-me | Resolve material product or architecture choices through structured questions. |
| handoff | Create a durable phase or session handoff with evidence and open limits. |
| improve-codebase-architecture | Find and plan high-leverage architecture improvements. |
| refactor | Make a small behavior-preserving structural improvement. |
| run-quality-gate | Run the repository checks that actually exist for the current phase. |
| skills-router | Select the right repository-local skill. |
| verify | Verify the built browser application, interactions, layouts, themes, accessibility, and audio evidence. |

Keep each skill lean. Put detailed branch-only guidance in a linked reference
file. Do not add a skill when an existing skill can own the workflow.
