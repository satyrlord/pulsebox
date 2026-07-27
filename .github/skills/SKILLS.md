# Pulsebox agent skills

Repository-local skills for repeatable Pulsebox work. Every skill is subordinate
to [AGENTS.md](../../AGENTS.md) and the
[product specification index](../../docs/specs/spec-000-index.md).

Read `package.json` for the current script surface. It is the single source of
truth for runnable commands; do not copy the list into a skill.

| Skill                         | Use                                                                                                            |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------- |
| add-feature                   | Define or change a product contract, then keep the specification and acceptance criteria current.              |
| dead-code-audit               | Prove and optionally remove unreachable browser, worklet, plugin, or asset code.                               |
| design-pulsebox-ui            | Design, implement, audit, or verify Pulsebox UI against its layout, themes, and accessibility contract.        |
| deslop                        | Remove evidence-backed low-value code, prose, data, or tests without changing behavior.                        |
| diagnose                      | Reproduce and isolate difficult browser, state, persistence, audio, or performance failures.                   |
| full-code-review              | Review a change set against the specification and Pulsebox architecture.                                       |
| grill-me                      | Resolve material product or architecture choices through structured questions.                                 |
| handoff                       | Hand off a session or phase to a fresh agent, outside the repository tree.                                     |
| improve-codebase-architecture | Find and plan high-leverage architecture improvements.                                                         |
| refactor                      | Make a small behavior-preserving structural improvement.                                                       |
| run-quality-gate              | Run the repository checks that actually exist for the current phase.                                           |
| verify                        | Verify the built browser application, interactions, layouts, themes, accessibility, and audio evidence.        |

Keep each skill lean. Put detailed branch-only guidance in a linked reference
file. Do not add a skill when an existing skill can own the workflow.
