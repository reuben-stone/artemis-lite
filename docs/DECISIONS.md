# Architecture Decision Records

> Each ADR records a deliberate choice. Revisit conditions are stated so decisions can be re-evaluated with evidence rather than inertia.

---

## ADR-001: Electron desktop application

### Context
The prototype must demonstrate agent workflows with local filesystem access, repository awareness, and desktop capabilities (process control, credentials). The original Artemis is Electron-based.

### Decision
Use Electron with React and TypeScript, via electron-vite.

### Alternatives
- **Web-only (Next.js/Vite SPA):** No local filesystem, no desktop process control. Would require a separate backend service for agent work — adds deployment complexity for a prototype.
- **Tauri:** Smaller binary, Rust backend. Learning cost is high for the current timeline and doesn't demonstrate Node/TypeScript depth.

### Consequences
**Positive:** Full local-first control. Demonstrates Electron security boundaries. Directly comparable to Artemis v1. Strong Node/TypeScript story for the interview.
**Negative:** Large binary. Chromium overhead. Requires native module compilation.

### Revisit when
The prototype needs distribution to non-developer users (consider Tauri for binary size), or the demo moves to a web context.

---

## ADR-002: TypeScript/Node runtime first, no Python service

### Context
The brief notes Python is relevant to the target role but warns against adding it merely to tick a box.

### Decision
Build the entire prototype in TypeScript within Electron's main process. Defer Python to Phase 2+ only if evaluation or retrieval experiments genuinely benefit from Python tooling.

### Alternatives
- **Python FastAPI sidecar from day one:** Adds IPC complexity, two runtimes, two dependency trees. No clear benefit for the prototype scope.
- **Python evaluation runner:** Viable later if eval tooling (e.g., custom scoring) is easier in Python.

### Consequences
**Positive:** Single runtime. Simpler debugging. Faster iteration. Smaller repo.
**Negative:** If Python is added later, the boundary needs explicit justification and clean IPC.

### Revisit when
Evaluation or retrieval work hits a clear wall in TypeScript (e.g., needing a Python ML library with no JS equivalent).

---

## ADR-003: SQLite for all persistence

### Context
The prototype needs workflow state, traces, memory, document chunks, embeddings, and usage records. Postgres + pgvector is an option but adds operational overhead.

### Decision
Use SQLite (better-sqlite3) for all persistence including vector storage. Evaluate sqlite-vec or a local vector index abstraction for embeddings.

### Alternatives
- **Postgres + pgvector:** Production-grade vector search. Requires running a Postgres instance. Operational cost disproportionate for a single-user desktop prototype.
- **Separate vector DB (Chroma, Qdrant):** Another service to run. Adds complexity without proportional benefit at prototype scale.

### Consequences
**Positive:** Zero external dependencies. Single file. Portable. Consistent with the local-first principle.
**Negative:** Vector search quality may be limited. Concurrent write throughput is lower than Postgres (irrelevant for single-user).

### Revisit when
Retrieval evaluation shows SQLite vector search is a quality bottleneck, or the system needs multi-user/distributed access.

---

## ADR-004: Single agent first

### Context
Artemis v1 has two agent types (main + worker). The Lite hypothesis is that coordination overhead from multiple agents may exceed their value for many workflows.

### Decision
Start with one agent. Planner, executor, and evaluator are roles within the workflow state machine, using the same model provider. Do not create separate LLM personalities.

### Alternatives
- **Planner + Executor agents:** Classic decomposition. Adds hand-off overhead, context duplication, and makes tracing harder.
- **Planner + Executor + Reviewer:** Three model calls where one might suffice. Must be justified by eval data.

### Consequences
**Positive:** Simpler tracing. Lower token cost. Easier to attribute decisions. Easier to explain in an interview.
**Negative:** A single agent must handle planning, tool selection, and verification — may produce worse plans for complex tasks.

### Revisit when
Evaluation shows a concrete quality improvement from splitting planning and execution, and the token/latency cost is justified.

---

## ADR-005: Deterministic workflow state machine

### Context
In Artemis v1, the only persistent state is the transcript. There is no workflow lifecycle — the agent loop runs until it stops or is cancelled.

### Decision
Implement an explicit state machine with validated transitions: `queued → planning → executing → awaiting_approval → verifying → completed`, plus failure states. Persist transitions before notifying the renderer. Invalid transitions fail loudly.

### Alternatives
- **Agent-driven state:** Let the model decide when to transition. Harder to inspect, recover, and test.
- **No state machine (transcript only):** v1 approach. Cannot resume, cannot checkpoint, cannot attribute cost to phases.

### Consequences
**Positive:** Inspectable. Recoverable. Testable. Cost attributable per phase. Interview-demonstrable.
**Negative:** More upfront code. State machine must be kept in sync with actual execution.

### Revisit when
The state machine becomes a bottleneck for adding new workflow shapes. Consider a more flexible graph model at that point.

---

## ADR-006: Memory is not workflow state

### Context
Artemis v1 injects all memory into the system prompt every turn. Memory, conversation history, and workflow progress are conceptually different but practically merged.

### Decision
Separate five categories: (1) workflow state, (2) working context, (3) conversation history, (4) long-term memory, (5) retrieved knowledge. The context builder assembles a subset per step.

### Alternatives
- **Single context blob (v1 approach):** Simpler to implement but grows unboundedly. Cannot attribute which context influenced a decision.

### Consequences
**Positive:** Context is budgeted and inspectable. Memory growth doesn't degrade every workflow. Retrieval is selective.
**Negative:** More moving parts. Context builder must be correct — omitting critical context is worse than including too much.

### Revisit when
Context builder frequently omits information the model needs. May need a fallback "expand context" mechanism.

---

## ADR-007: Retrieval via local embeddings

### Context
The prototype needs to demonstrate RAG without requiring external services.

### Decision
Embed and index project documents locally. Use semantic similarity + metadata filters. Return top-K with source references. Evaluate retrieval separately from generation.

### Alternatives
- **No retrieval (keyword search only):** Simpler but doesn't demonstrate the RAG concept.
- **External embedding API:** Adds network dependency and cost. Evaluate if local embedding quality is insufficient.

### Consequences
**Positive:** Self-contained. Demonstrates the full retrieval pipeline. Evaluable.
**Negative:** Local embedding models may be lower quality. Ingestion adds startup cost.

### Revisit when
Local retrieval quality is measurably poor on the eval suite, or embedding model size is impractical for the desktop.

---

## ADR-008: Side-effecting tools require approval

### Context
Artemis v1 has a permission gate. Lite formalises this: approval is a workflow state, not just a UI modal.

### Decision
Write tools and externally consequential actions require explicit user approval. Approval requests are persisted — if the app restarts, pending approvals remain pending. Read tools never require approval.

### Alternatives
- **Trust all tools:** Faster demos but unsafe and not interview-credible.
- **Approve everything:** Too much friction for read-only operations.

### Consequences
**Positive:** Demonstrates human-in-the-loop control. Approval state survives restart. Clear audit trail.
**Negative:** Approval adds latency to write workflows. Must not block the UI.

### Revisit when
Trusted tool categories emerge where approval is unnecessary (e.g., writing to a known sandbox).

---

## ADR-009: No arbitrary shell execution

### Context
Artemis v1 exposes a full Bash tool (gated by permission) and a PTY terminal. Both are powerful but hard to constrain.

### Decision
Lite v1 does not include a Bash tool or a PTY. Tools are explicit, typed, and registered. If shell access is needed later, it will be a specific, scoped tool with an allowlist.

### Alternatives
- **Bash tool with safety classifier (v1 approach):** Powerful but the classifier is inherently incomplete — novel dangerous commands can bypass it.
- **Restricted shell with command allowlist:** More defensible but complex to implement correctly.

### Consequences
**Positive:** Smaller attack surface. Every tool action is typed and traceable. No "escape hatch" that bypasses the tool contract.
**Negative:** Cannot perform arbitrary operations. May limit the demo workflow's expressiveness.

### Revisit when
The eval suite or demo workflow requires operations that cannot be expressed as a registered tool.

---

## ADR-010: Provider adapter with domain types

### Context
Artemis v1's `ModelClient` interface uses Anthropic SDK types as the canonical format. All providers translate to/from Anthropic shapes.

### Decision
Define domain-owned request/response types. Provider adapters translate between domain types and SDK types. No SDK types leak into orchestration or tool code.

### Alternatives
- **Anthropic-native (v1 approach):** Less code initially but couples the entire codebase to one SDK's type system.
- **OpenAI-native:** Same coupling problem, different SDK.

### Consequences
**Positive:** Adding a second provider doesn't touch orchestration code. Domain types can include fields (budget, trace context) that no SDK provides natively.
**Negative:** Translation boilerplate in each adapter.

### Revisit when
Only one provider will ever be needed (unlikely for an interview-grade project).

---

## ADR-011: Append-only trace events

### Context
Artemis v1 has no structured tracing — observability is limited to the chat transcript and ephemeral turn cost.

### Decision
Every significant action produces an append-only `TraceEvent` record: timestamp, workflow/step ID, event type, status, model/provider, tokens, latency, tool name, retry count, error code. Trace is never mutated after write.

### Alternatives
- **Structured logging to stdout:** Standard but not queryable in the UI.
- **No tracing (v1 approach):** Cannot answer "why did this happen?" or "how much did this cost?"

### Consequences
**Positive:** Full execution history. Queryable in the UI. Powers the metrics card, trace inspector, and evaluation harness.
**Negative:** Storage grows with usage. Needs periodic cleanup or archival policy.

### Revisit when
Trace volume becomes a storage concern (add retention/archival).

---

## ADR-012: Evaluation as executable architecture

### Context
The brief requires 12+ deterministic eval scenarios. No eval infrastructure exists in v1.

### Decision
Create `tests/evals/` with scenario definitions, machine-checkable assertions, and structured output (JSON + readable summary). Scenarios cover happy paths, failures, retrieval, approval, idempotency, and resume.

### Alternatives
- **Manual testing only:** Not reproducible. Cannot compare across architecture changes.
- **LLM-as-judge only:** Non-deterministic. Use only for criteria that cannot be checked programmatically.

### Consequences
**Positive:** Architecture changes are quantitatively comparable. Regression detection. Interview-demonstrable.
**Negative:** Eval scenarios must be maintained as the system evolves.

### Revisit when
Scenarios become stale or the system's capabilities outgrow the initial suite.
