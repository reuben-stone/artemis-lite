# Artemis Lite - Claude Code Project Context

## Mission
Artemis Lite is a deliberately small Electron prototype for reliable, observable agent workflows. It exists to explore how much agentic behaviour is actually necessary after lessons learned from the larger Artemis system.

## Core principle
Use deterministic software for workflow integrity. Use LLM reasoning only where judgement is useful.

## Non-negotiable architecture
- Electron + React + TypeScript.
- Renderer has no direct Node access.
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- Narrow typed preload API only.
- Validate all IPC inputs with Zod.
- Explicit persisted workflow state machine.
- Model provider is behind an adapter.
- Model outputs that affect application behaviour are schema-validated.
- Tools are registered, typed and policy-controlled.
- Side-effecting tools are idempotent where possible.
- Consequential writes require approval.
- Memory, workflow state, conversation history and retrieved knowledge are separate concepts.
- Context is assembled per step; do not pass all history by default.
- Trace observable events, not hidden chain-of-thought.
- Record provider token usage from day one.
- Failure/retry/recovery paths are first-class.
- Keep the number of agents minimal (one, unless eval justifies more).

## Scope discipline
- Build the smallest vertical slice that proves the architecture.
- Retries are execution metadata, not workflow lifecycle states.
- Defer semantic embeddings until basic selective retrieval exists as an eval baseline.
- Token/context/cost instrumentation is core, not polish.
- Every abstraction must have a concrete test or eval justifying its existence.
- Do not add: auth, billing, teams, cloud infra, Kubernetes, arbitrary shell, plugin marketplace, additional agents — unless explicitly requested.

## Commands
```
npm run dev          # electron-vite dev
npm run build        # electron-vite build
npm run typecheck    # tsc --noEmit (both tsconfigs)
npm test             # vitest run
npm run test:watch   # vitest (watch mode)
```

## Documentation authority
1. Current implementation for what exists
2. CLAUDE.md for non-negotiable rules
3. docs/ARCHITECTURE.md and docs/DECISIONS.md for design intent
4. docs/ARTEMIS-LITE-TECHNICAL-BRIEF.md for full specification

## Security
- Treat renderer and retrieved content as untrusted.
- Never expose secrets or raw Electron privileged APIs.
- Never allow model output alone to bypass tool policy.

## Quality
- Prefer boring, explicit code over framework magic.
- Avoid premature abstractions.
- Do not introduce a dependency if a small local implementation is clearer.
- Do not optimise benchmark numbers at the expense of task success.

## Git
- Make focused commits.
- Do not rewrite unrelated code.
- Do not commit secrets, credentials, or local absolute paths.
