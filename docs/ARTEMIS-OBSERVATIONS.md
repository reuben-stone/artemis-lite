# Artemis v1 Observations

> Verified from the Artemis repository at `~/Desktop/artemis`.
> This document records architectural facts relevant to the Artemis Lite rebuild.
> It does not modify or judge v1 — it extracts lessons.

---

## 1. Electron Structure

### Main process (`src/main/`)
- Entry: `index.ts` — BrowserWindow setup, all IPC handler registrations, PTY spawn, menu
- `contextIsolation` defaults to `true` (not explicitly set; Electron 33 default)
- `nodeIntegration` defaults to `false`
- `sandbox: false` — required because the preload uses `require()` for `ipcRenderer`
- No Content Security Policy set anywhere
- `setWindowOpenHandler` correctly blocks in-app navigation, opens external via `shell.openExternal` (no protocol allowlist though)
- Permission handler only allows `media` (microphone for STT)
- `autoplayPolicy: 'no-user-gesture-required'` for TTS
- `backgroundThrottling: false` to keep the orb animation alive when occluded

### Preload (`src/preload/`)
- `contextBridge.exposeInMainWorld('artemis', api)` — correct pattern
- Large surface: ~50+ methods across 15 namespaces (terminal, history, memory, app, auth, projects, connections, briefing, tasks, calendar, tickets, notifications, board, prReviews, agent, permissions, screen, menu)
- Event subscriptions (`onEvent`, `onPermission`) return unsubscribe functions — clean pattern
- `any` types on raw IPC payloads — no runtime shape validation

### Renderer (`src/renderer/`)
- React 18 + Three.js (R3F) — no framework (no Next, no router)
- All state in root `App.tsx` (~1090 lines) via `useState`/`useRef`, prop-drilled
- No Redux/Zustand/context providers
- Streaming tokens coalesced via `requestAnimationFrame` to avoid per-token re-renders

### IPC surface
- ~50 `ipcMain.handle` channels, 4 `ipcMain.on` channels, 4 push channels
- **No input validation at any IPC boundary** — prompts, paths, model names, keys pass through unchecked
- PTY `pty:input` writes arbitrary data to the user shell with no filtering

### Security gaps to address in Lite
1. No CSP
2. `sandbox: false`
3. No IPC input validation (Zod or equivalent)
4. PTY exposes full shell (Lite will not have a PTY)
5. `shell.openExternal` with no protocol allowlist
6. `hardenedRuntime: false`

---

## 2. Agent Loop

### Architecture (`src/main/agent.ts`, ~2250 lines)
- Raw `@anthropic-ai/sdk` with a custom `while(true)` tool-call loop
- NOT the Anthropic Agent SDK — hand-rolled loop with streaming
- Each turn: load recent messages from SQLite, build system prompt, stream model response, execute tool calls sequentially, feed results back, repeat until `stopReason !== 'tool_use'`
- All tool calls in a single assistant turn are **sequential** (no parallel execution)
- `localMessages` is a mutable accumulator — history snapshot loaded once at turn start, then intermediate tool results appended inline

### Cancellation
- `AbortController` per turn, stored in a map by `requestId`
- Signal passed to the SDK stream
- Checked at three points: top of loop, after final, inside tool-execution loop
- Partial text preserved with `_Stop._ ` marker and persisted

### Turn buffer
- In-progress turns checkpointed to SQLite every 700ms (throttled)
- On restart, `getResyncTurn()` recovers the last unclaimed turn
- Up to 8 completed turns cached in memory; 20 in SQLite

### Error handling
- **No automatic retry** — model failures surface immediately
- Auth errors get a friendly message; all others get raw error text with warning emoji
- Tool errors are caught and returned as `is_error: true` tool results — the model decides how to handle them

---

## 3. Context Assembly

### System prompt (`buildSystemPrompt`)
- TTL-cached for 60 seconds; invalidated on `save_memory` and `switch_project` (but NOT on model switch)
- Assembled from:
  1. `ARTEMIS.md` (persona/identity)
  2. `ARTEMIS-CORE.md` (self-model)
  3. **All memory facts** — full `MEMORY.md` index + every `.md` fact file concatenated
  4. Speech format instructions
  5. Chat formatting rules
  6. Tool discipline reminder
  7. Projects list (all registered + active)
  8. Conversation context warning

### Conversation history
- Last 60 messages loaded from SQLite
- Leading assistant messages trimmed (API constraint)
- Consecutive same-role messages merged with `\n\n`
- Media (images/PDFs) embedded as base64 content blocks

### Prompt caching (Anthropic only)
- System prompt wrapped with `cache_control: { type: 'ephemeral' }`
- Last assistant message in history also cache-anchored
- Other providers ignore caching

### Key observation for Lite
The context strategy is **load everything**: all memory facts injected every turn, last 60 messages always included, no selective retrieval, no per-step context assembly. As memory grows, this erodes cache hit rates and increases input costs. The system prompt itself becomes the de facto memory store.

---

## 4. Agent Count and Coordination

### Two agent types
1. **Main agent** (`runAgent`) — interactive chat loop, one instance per user turn
2. **Worker agent** (`runWorker` via `dispatch_worker` tool) — autonomous sub-agent for PR creation

### Worker model
- Runs in an isolated git worktree (temp directory)
- Uses a separately-stored model (default Sonnet, not the chat model)
- Up to 30 tool-call rounds
- Tools: Read, Write, Edit, Glob, Bash — all scoped to worktree via `withinWorktree()`
- Sandbox: path containment + DANGEROUS blocklist + git push/commit blocked in Bash
- Opens a PR on completion (never pushes to main)
- Runs in the **same process** as the main agent (not a subprocess)
- No message-passing between agents at runtime — dispatch blocks until worker completes

### Lesson for Lite
The worker is genuinely useful but is the most complex and untested component. The coordination model is simple (blocking dispatch, tool result return) — Lite's single-agent approach is a valid simplification. If workers are added later, the v1 worktree isolation pattern is sound.

---

## 5. Model Provider Layer (`src/main/model/`)

### Interface
```ts
interface ModelClient {
  readonly id: BackendId
  stream(req: ModelTurnRequest): ModelStream
}
```
- Canonical format is **always Anthropic shapes** — providers translate in/out
- Backend read from SQLite fresh every turn (hot-swappable without restart)

### Providers
| Provider | Status | Notes |
|---|---|---|
| `AnthropicClient` | Production | Prompt caching, per-call cost estimation |
| `OllamaClient` | Production | Bidirectional format translation; `$0` cost |
| `ClaudeCliClient` | Stub | Throws on `stream()` with a design note |

### Cost estimation
- Hard-coded USD/MTok rates for opus/sonnet/haiku families
- Model matched by substring (`m.includes('opus')`)
- `turnCost` accumulated across all model calls in a turn, emitted in `done` event
- **Not persisted to SQLite** — cost is renderer-side ephemeral only

### Lesson for Lite
The provider abstraction works well. The key gap is: Lite should (a) persist usage records, (b) use a domain interface that doesn't leak Anthropic SDK types, and (c) support structured output validation natively.

---

## 6. Tool System

### 35 tools defined in `agent.ts`
- 18 auto-allowed (read/benign), 17 gated (writes/sensitive reads)
- Tool definitions are inline in agent.ts — no registry pattern
- Tool execution is a large switch/if-else block
- No typed output schemas — tools return raw strings
- No timeout on individual tools (only the overall stream has an abort signal)
- No retry policy per tool
- No idempotency mechanism
- `clampToolOutput` caps any single result at 60,000 characters

### Permission gate
- Three tiers: hard blocklist (DANGEROUS regex), auto-allow set, permission mode (guarded/smart/trusted)
- Smart mode uses `isSafeReadOnly()` classifier — conservative, no shell metacharacters
- Per-project persistent allowlist for "always allow" commands
- `sessionTrusted` is in-memory only, never persisted

### Lesson for Lite
The tool count is high (35) and they're all defined inline. Lite should have a proper registry with typed contracts, timeouts, retry policies, and idempotency. Start with 6 tools max.

---

## 7. Persistence (`src/main/store.ts`)

### SQLite schema (9 tables)
| Table | Purpose |
|---|---|
| `messages` | Durable transcript (role, text, timestamp) |
| `turns` | In-flight turn buffer, capped at 20 |
| `terminal` | Rolling scrollback, capped at 256KB |
| `meta` | Key-value settings store |
| `projects` | Registered repo paths |
| `pr_reviews` | Worker-opened PRs for human review |
| `todos` | Day-scoped personal tasks |
| `events` | Calendar events |
| `project_tickets` | GitHub Projects v2 board cache |
| `allowed_commands` | Per-project command allowlist |

### Conversation model
- One row per message in `messages`
- View floor mechanism for "new conversation" without deletion
- Undo-able via `prev_view_floor`
- Recent messages capped at 200 rows above floor

### Recovery
- Turn text checkpointed every 700ms during streaming
- On restart, unclaimed turns are recoverable
- No workflow-level persistence — only transcript and turn buffer

### Lesson for Lite
The turn-recovery pattern is clever and worth understanding, but Lite needs **workflow-level** persistence (state machine, steps, checkpoints, trace events), not just transcript recovery.

---

## 8. Token/Usage Instrumentation

### What exists
- `ModelUsage` interface: inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens
- Per-call cost estimation via hard-coded pricing table
- `turnCost` accumulated and emitted to renderer in `done` event

### What's missing
- No persistent token/cost records in SQLite
- No per-session or per-day aggregation
- No token budget or cost cap
- No per-tool-call usage attribution
- No context size estimation before model calls
- Ollama/CLI backends report zero usage

### Lesson for Lite
Usage accounting must be a first-class persistent concern, not a transient renderer display.

---

## 9. Test Coverage

### What's tested (2 test files, ~740 lines)
- `smoke.test.ts`: tool execution (Read/Write/Edit/Glob/Grep/Bash), safety gate, memory round-trip, context assembly, board helpers, Ollama translation
- `store.test.ts`: all SQLite operations — transcript, turns, projects, todos, calendar, tickets, permissions

### Major gaps
1. Worker agent loop — zero coverage (most operationally risky component)
2. Model backends — no tests for any provider
3. Permission gate flow inside `runAgent` — untested
4. Token/cost accounting — untested
5. IPC layer — untested
6. Renderer components — untested
7. GitHub/board live integration — untested
8. System prompt assembly — untested
9. No evaluation/benchmark infrastructure

### Lesson for Lite
The test strategy is decent for what it covers (fast, deterministic, no API dependency). Lite should maintain that approach and extend it to the workflow engine, provider layer (with fakes), and evaluation harness.

---

## 10. What to Carry Into Lite

### Carry the concept, not the code
1. **Provider seam** — the `ModelClient` abstraction works; redesign with domain types
2. **Permission gate model** — three tiers (block/auto-allow/ask) is sound
3. **Turn recovery to SQLite** — the checkpoint-during-stream pattern is good
4. **Safety containment** — `withinWorktree`, `DANGEROUS` blocklist, `clampToolOutput`
5. **Prompt caching awareness** — cache-control on system prompt + conversation anchor
6. **Event-based renderer communication** — `emit()` abstraction, rAF coalescing

### Do not copy
1. The 35-tool monolith in agent.ts
2. The inline tool execution switch block
3. The "load all memory every turn" context strategy
4. The 1090-line App.tsx with all state at root
5. The lack of IPC validation
6. The absence of workflow state (only transcript exists)
7. The unstructured tool outputs (raw strings)
8. The absence of retry/timeout/idempotency
9. `sandbox: false` (evaluate whether Lite can use `sandbox: true`)

---

## 11. Verified Technical Facts

```
Electron version:              33.x (package.json: ^33.2.0)
Build stack:                   electron-vite + Vite 5 + electron-builder 25
Renderer framework:            React 18 + Three.js (R3F)
Main process structure:        Single-file modules (agent.ts, store.ts, worker.ts, etc.)
Preload structure:             Single index.ts, contextBridge.exposeInMainWorld
IPC channels:                  ~50 handle + 4 on + 4 push
Agent model:                   Custom while(true) tool loop on raw @anthropic-ai/sdk
Task model:                    No workflow/task state machine — transcript only
Repository model:              Multi-project registry in SQLite, active project CWD
Persistence:                   SQLite (better-sqlite3), WAL mode, 9 tables
LLM providers:                 Anthropic (production), Ollama (production), Claude CLI (stub)
Orchestration:                 Sequential tool-call loop, no parallel execution
Tool execution:                Inline in agent.ts, 35 tools, no registry
Context strategy:              Full memory + last 60 messages every turn
Token instrumentation:         Per-call usage + cost estimation, not persisted
Retry behaviour:               None
Recovery behaviour:             Turn-level checkpoint (700ms), no workflow recovery
Tests:                         2 files (~740 lines), vitest, no Electron/renderer tests
Packaging:                     macOS dir target, self-signed dev cert
```
