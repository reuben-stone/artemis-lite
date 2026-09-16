# Artemis Lite Architecture

> Living document. Updated as implementation proceeds.

---

## Overview

Artemis Lite is a deliberately small Electron desktop application that demonstrates reliable, inspectable, persistent agent workflows.

**Core principle:** Deterministic shell, probabilistic core. The application owns workflow lifecycle, persistence, retries, timeouts, approvals, side-effect policy, tracing, and context budgets. The model owns only decisions that genuinely benefit from reasoning.

---

## Process Model

```
┌─────────────────────────────────────────────────────────────┐
│ Electron                                                    │
│                                                             │
│  Renderer (React + TypeScript)                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Workflow list · Active workflow · Approval prompts     │  │
│  │ Trace inspector · Context inspector · Metrics          │  │
│  │ Failure lab (dev)                                     │  │
│  └───────────────────────────────────────────────────────┘  │
│                         │                                   │
│              narrow typed IPC (Zod-validated)               │
│                         │                                   │
│  Main process (Node)                                        │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                                                       │  │
│  │  Workflow Service                                     │  │
│  │    ├── State Machine (explicit transitions)           │  │
│  │    ├── Orchestrator (step execution loop)             │  │
│  │    ├── Context Builder (per-step assembly)            │  │
│  │    └── Checkpoint / Recovery                          │  │
│  │                                                       │  │
│  │  Model Provider (adapter interface)                   │  │
│  │    └── Anthropic adapter (initial)                    │  │
│  │                                                       │  │
│  │  Tool Registry                                        │  │
│  │    ├── list_workspace_files (read)                    │  │
│  │    ├── read_file_excerpt (read)                       │  │
│  │    ├── search_project (read)                          │  │
│  │    ├── retrieve_memory (read)                         │  │
│  │    ├── create_work_item (write, approval required)    │  │
│  │    └── write_sandbox_file (write, approval required)  │  │
│  │                                                       │  │
│  │  Memory Service                                       │  │
│  │    ├── Long-term memory (durable facts)               │  │
│  │    └── Episodic history (workflow summaries)           │  │
│  │                                                       │  │
│  │  Retrieval Service                                    │  │
│  │    ├── Document ingestion + chunking                  │  │
│  │    ├── Embedding index                                │  │
│  │    └── Semantic + metadata search                     │  │
│  │                                                       │  │
│  │  Persistence (SQLite)                                 │  │
│  │    ├── Workflows + steps                              │  │
│  │    ├── Trace events (append-only)                     │  │
│  │    ├── Checkpoints                                    │  │
│  │    ├── Approvals                                      │  │
│  │    ├── Idempotency ledger                             │  │
│  │    ├── Memory records                                 │  │
│  │    ├── Document chunks + embeddings                   │  │
│  │    └── Usage records                                  │  │
│  │                                                       │  │
│  │  Tracing Service                                      │  │
│  │    └── Append-only structured events                  │  │
│  │                                                       │  │
│  │  Failure Lab (dev toggles)                            │  │
│  │                                                       │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## Workflow State Machine

```
queued
  ↓
planning
  ↓
executing ←──────── retrying (internal)
  ├──→ awaiting_approval ──approve──→ executing
  │                      └─reject───→ cancelled / failed
  ↓
verifying
  ├──→ executing   (corrective step if allowed)
  ↓
completed

Any active state
  ├──→ failed
  └──→ cancelled
```

- Transitions are validated — invalid transitions fail loudly in dev
- State is persisted **before** notifying the renderer
- Interrupted workflows are recoverable on restart

---

## Context Architecture

Context is assembled **per step**, not accumulated indefinitely.

### Categories

| Category | Source | Budget (starting) |
|---|---|---|
| System instructions | Static | Fixed |
| Goal | User input | ≤ 500 tokens |
| Workflow state | Persisted state | ≤ 800 tokens |
| Recent interaction | Conversation window | ≤ 1,500 tokens |
| Retrieved memory | Semantic search | ≤ 1,000 tokens |
| Retrieved documents | RAG | ≤ 3,000 tokens |
| Tool evidence | Previous step outputs | ≤ 2,000 tokens |
| Reserved for output | | ≥ 1,500 tokens |

### Context builder contract

```ts
interface ContextPacket {
  goal: string
  step: StepContext
  recentMessages: MessageExcerpt[]
  memories: RetrievedMemory[]
  documents: RetrievedDocument[]
  toolEvidence: ToolEvidence[]
  estimatedTokens: number
}
```

Every model call emits a context summary for the trace inspector.

---

## Agent Model

**One agent.** Planner, executor, and evaluator are roles/stages within the workflow, not separate LLM personalities.

A second agent is only introduced if an evaluation demonstrates concrete benefit.

---

## Tool Contracts

```ts
interface ToolDefinition<I, O> {
  name: string
  description: string
  inputSchema: z.ZodType<I>
  outputSchema: z.ZodType<O>
  mode: 'read' | 'write'
  approval: 'never' | 'write' | 'always'
  timeoutMs: number
  maxRetries: number
  execute(input: I, ctx: ToolContext): Promise<O>
}
```

Tool results return identifiers for just-in-time expansion, not raw file dumps.

---

## Persistence

SQLite (better-sqlite3), WAL mode. Tables:

| Table | Purpose |
|---|---|
| `workflows` | Workflow records with explicit status |
| `workflow_steps` | Step records within workflows |
| `trace_events` | Append-only structured events |
| `checkpoints` | Recovery snapshots |
| `approvals` | Pending/resolved approval requests |
| `idempotency_ledger` | Dedup record for write tools |
| `usage_records` | Per-call token/cost accounting |
| `memory_records` | Long-term durable facts |
| `document_chunks` | Ingested document fragments |
| `embeddings` | Vector index (or reference to external index) |

---

## Electron Security

| Property | Value |
|---|---|
| `contextIsolation` | `true` |
| `nodeIntegration` | `false` |
| `sandbox` | `true` (evaluate compatibility) |
| CSP | Restrictive, set on session |
| IPC validation | Zod on every channel |
| Filesystem | Workspace allowlist, path traversal protection |
| Shell | No arbitrary shell execution from renderer |
| Secrets | Main process only, never in renderer state |
| External URLs | Protocol allowlist before `shell.openExternal` |

---

## Streaming / Events

Typed events from main to renderer:

```ts
type RendererEvent =
  | { type: 'workflow.status'; ... }
  | { type: 'step.started'; ... }
  | { type: 'retrieval.completed'; ... }
  | { type: 'model.usage'; ... }
  | { type: 'tool.started'; ... }
  | { type: 'tool.completed'; ... }
  | { type: 'approval.requested'; ... }
  | { type: 'workflow.completed'; ... }
  | { type: 'workflow.failed'; ... }
```

Observable progress is streamed. Hidden reasoning is not.

---

## Build Phases

| Phase | Scope | Exit criterion |
|---|---|---|
| 0 | Reconnaissance | `docs/ARTEMIS-OBSERVATIONS.md` complete |
| 1 | Secure Electron shell | Renderer cannot access Node directly; IPC validated |
| 2 | Workflow engine | Fake deterministic workflow can run, stop, restart, resume |
| 3 | Model reasoning | Goal produces validated plan with trace and usage |
| 4 | Tools | Workflow can call tools without duplicate writes |
| 5 | Memory + retrieval | Known eval query retrieves expected evidence |
| 6 | Failure + recovery | Live demo can intentionally fail and recover |
| 7 | Evaluation | 12+ scenarios with quantitative comparison |
| 8 | Polish | Screenshots, README, docs, packaging |
