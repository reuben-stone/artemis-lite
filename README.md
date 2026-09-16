# Artemis Lite

Artemis Lite is a deliberately smaller reconstruction of [Artemis](https://github.com/reuben-stone/artemis), an Electron desktop application that acts as an AI operations layer for a software ecosystem.

## Why it exists

The original Artemis — **Autonomous Repository-Tending Engineering, Monitoring & Intelligence System** — was built to sit above multiple repositories, produce cross-project briefings, dispatch worker agents into isolated worktrees, and return gated pull requests for human review. It worked, but building and using it exposed a harder engineering problem: giving a model capabilities is relatively easy; controlling context, state, side effects, recovery and observability around those capabilities is not.

Artemis Lite tests a different architectural hypothesis:

> **Use the minimum amount of agentic behaviour required to reliably complete the task.**

The application owns workflow lifecycle, persistence, approvals, retries, recovery, context budgets and tracing. The model owns only the decisions that genuinely require reasoning. The mission — repository-tending engineering — stays the same. The control model changes.

## Architecture

**Deterministic shell, probabilistic core.**

```
Renderer (React)
    |
typed IPC (Zod-validated)
    |
Workflow Service
  ├── Explicit state machine
  ├── Context builder
  ├── Capability registry
  └── Model provider (adapter)
    |
SQLite persistence
  workflows / steps / traces / approvals
  idempotency / usage / checkpoints
```

Key properties:

- **Explicit workflow state** — transitions are application-owned and persisted before UI notification
- **Typed tool contracts** — inputs and outputs validated at the boundary
- **Approval as state** — consequential writes pause on a persisted approval record
- **Durable recovery** — restarting Electron does not mean restarting the job
- **Idempotency** — completed side effects are not repeated after recovery
- **Tool-specific reconciliation** — ambiguous side effects are checked against reality, not blindly retried
- **Observable usage** — model calls, tokens, cost and duration persisted per workflow
- **Fault injection** — deterministic Failure Lab for testing retry and recovery behaviour

## Current state

Working prototype. The core architecture is implemented and tested:

- Electron + React + TypeScript with `contextIsolation`, `sandbox: true`, restrictive CSP
- SQLite persistence (workflows, steps, traces, approvals, idempotency ledger, usage records)
- Workflow orchestrator with explicit state machine and validated transitions
- Model provider boundary with Anthropic adapter (domain-owned types, no SDK leakage)
- Tool registry with read (`list_workspace_files`) and write (`create_work_item`) tools
- Persisted approval gate for write operations
- Workflow interruption and recovery from SQLite state
- Failure Lab with 8 injectable fault types and bounded retry policy
- 122 tests covering state machine, persistence, idempotency, tools, recovery, fault injection and retry semantics

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/DECISIONS.md](docs/DECISIONS.md) for design rationale.

## Running locally

Requirements: macOS, Node 20+, an Anthropic API key.

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...
npm run dev
```

Note: `better-sqlite3` is a native module compiled against Electron's Node ABI. After running `npm test` (which rebuilds for system Node), run `npx electron-builder install-app-deps` before `npm run dev`.

## Commands

```
npm run dev          # Electron dev server
npm run build        # Production build
npm run typecheck    # TypeScript check (both configs)
npm test             # Vitest (rebuild for system Node first)
```

## What comes next

The [feature update](docs/ARTEMIS-LITE-TECHNICAL-BRIEF.md) outlines the path from prototype to the full repository-tending workflow: project/repository domain, GitHub read adapter, capability selection, worktree workers, gated PR creation, visual verification, retrieval experiments and multi-repo morning review.

## Related

- [Original Artemis](https://github.com/reuben-stone/artemis) — the full multi-agent operations system that motivated this rebuild
- [Case study](https://github.com/reuben-stone/artemis-case-study) — the engineering case study documenting the evolution

## Author

Reuben Stone
