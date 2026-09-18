# Artemis Product Intent and Architecture Context
## Corrected project understanding

### Critical framing

Artemis is **not a coding agent**, and this is not a new direction discovered during Artemis Lite.

The original Artemis product was always intended to be a JARVIS-like operator over a software ecosystem: a persistent system that oversees multiple repositories and live products, monitors their state and usage, coordinates tools and agents, initiates work, maintains memory/state, and returns important outcomes and decisions to the human operator.

Do not rewrite project history as:

"Artemis started as a coding agent, then Lite discovered it should become an operator."

That is incorrect.

The correct history is:

**Artemis v1 already embodied the operator vision. Lite is an engineering reconstruction used to work out how that operator should be implemented more reliably.**

The recent investigation experiment clarified one implementation boundary inside that existing vision: substantial repository engineering should often be delegated to a specialised coding agent rather than recreated through a constrained home-grown investigation loop.

It did not change the product thesis.

---

## Protected case-study opening

The current Hero and Artemis v1 sections are considered excellent and should remain unchanged.

Do not propose copy changes to those sections unless explicitly asked.

They already establish the original intention through concrete product behaviour:
- Artemis sits above an ecosystem of repositories rather than inside one project
- multi-project oversight
- cross-repository Morning Review
- git + live analytics
- persistent memory/conversation
- application-owned tools
- delegated worker agents
- isolated worktrees
- gated PR review

These details communicate the operator model without needing an explicit disclaimer.

Do not add "Artemis was never intended to be a coding agent" to the opening. That would answer an objection the reader probably does not have and would weaken the natural chronology of the case study.

The operator/specialist boundary should become explicit later, when the real Lite dogfooding story makes it relevant.

---

## Product thesis

Useful internal description:

> **Artemis is a persistent engineering operator for a portfolio of live software products.**

Original README description remains accurate:

> **A desktop AI operations layer for your codebase ecosystem.**

JARVIS is a useful internal analogy: Artemis observes the environment, maintains awareness, coordinates capabilities and agents, and brings important decisions back to the user.

Do not overuse "JARVIS" in external copy. The product should be explained through concrete behaviour.

---

## What Artemis owns

Artemis is the persistent operator/control layer.

Responsibilities include:
- portfolio/project awareness
- repository and product identity
- product-to-Sentry / analytics mappings
- operational signal collection
- correlation and deduplication
- workflow creation
- durable workflow state
- scheduling / eventual persistent operation
- capability selection
- operational context
- permissions and policy
- idempotency / reconciliation
- retries and recovery
- budgets and usage records
- approvals
- verification
- Result construction
- PR/review queues
- Morning Review
- human escalation
- consequential external-action boundaries

Not every responsibility requires AI.

---

## Models and specialist agents

Models are capabilities inside Artemis, not Artemis itself.

Direct model reasoning is appropriate for tasks where probabilistic judgement is useful.

Specialised agents such as Claude Code or Codex are also capabilities Artemis can coordinate.

For substantial repository engineering, a specialist coding-agent harness may own:
- repository exploration
- following implementation references
- understanding source context
- root-cause investigation
- implementing a bounded change
- running repository workflows where permitted

Artemis owns the larger workflow around that execution.

This is consistent with the original Artemis vision, which already dispatched worker agents. The new execution adapter is an evolution of delegation, not a product pivot.

---

## Core architecture principle

Preserve:

> **Deterministic shell. Probabilistic core.**

The goal is not to minimise model usage for its own sake.

Move responsibilities into deterministic application code when they benefit from explicit state, policy, persistence or reliable control.

Use model reasoning where reasoning is actually useful.

A second useful principle emerging from dogfooding is:

> **Own the orchestration. Delegate the specialism.**

Treat this as a secondary architectural lesson, not a replacement for the original product thesis.

---

## Context philosophy

Do not reduce the context story to "use fewer tokens."

The real question is:

> **Did the reasoning process have the right evidence for the decision it was making?**

Useful distinction:

### Initial context
Evidence needed to start:
- workflow goal
- triggering production signal
- project/product identity
- workflow state
- available capabilities

### Acquired context
Evidence discovered as understanding changes:
- subsystem
- source files/ranges
- implementation references
- tool evidence

### Verification context
Evidence needed to determine whether a conclusion/result is supported.

Core line:

> **Context isn't only what the model receives at the start. It is also the evidence the system allows it to acquire as its understanding of the problem changes.**

Minimum sufficient context does not mean minimum tokens. A larger successful context can be better than a smaller failed one.

Do not claim token/cost improvement without measurement.

---

## Real Lumi investigation: what was learned

The real production issue:

`TypeError: Cannot convert argument to a ByteString because the character at index 25 has a value of 8211 which is greater than 255.`

### First finding: broad search was insufficient

Generic repository searches reached bounded result limits and produced weak evidence.

Artemis added:
- directory-scoped search_repository
- bounded regex
- context lines
- search-root reporting
- path traversal protection
- read_file offsets
- progressive-discovery planner guidance
- evidence acquisition tracing

A 226-file regression fixture demonstrated that scoped discovery could find a target beyond the unchanged 200-file global search bound.

Important: the global bound was not increased. The acquisition strategy improved.

### Second finding: fixed plans were insufficient for investigation

Later actions were planned before earlier evidence existed.

Repository investigation is adaptive.

This led to the bounded investigation loop.

### Third finding: bounded adaptive investigation worked architecturally but remained ineffective for the real task

The bounded loop gave Artemis control over:
- iteration count
- token budget
- wall-clock limit
- read-only capability set
- persistence
- recovery
- tracing
- verification

The model could choose its next evidence action and evolve its hypothesis.

The implementation worked mechanically and tests pass.

But the real Lumi investigation still reached its 12-iteration maximum without conclusively identifying the root cause.

### Correct interpretation

Do not keep increasing limits or prompt-engineering the loop merely to force the Lumi issue to succeed.

The experiment showed that Artemis was beginning to recreate a specialised repository-agent harness through repeated constrained model calls.

This is the architectural boundary discovered:

> **Artemis did not need to become the coding agent. It needed to know when to use one.**

This does not change Artemis's original mission. Coordinating specialist agents was always part of the operator concept.

Keep the bounded investigation loop. It can remain useful for lighter read-only reasoning/investigation tasks.

---

## Current execution-adapter direction

Immediate vertical slice:

```text
real Sentry issue
    ↓
Artemis resolves product/repository
    ↓
policy + dedupe
    ↓
durable workflow
    ↓
human approval for delegation
    ↓
specialist coding agent in isolated worktree
    ↓
agent investigates + prepares change
    ↓
Artemis observes actual repository state
    ↓
deterministic verification
    ↓
model verification where useful
    ↓
Result
    ↓
human approval
    ↓
Artemis publishes branch / creates PR
    ↓
PR Queue + Morning Review
```

This is the current priority.

Do not add unrelated features until the real vertical slice works.

---

## Operational context vs repository context

Artemis supplies operational context:
- why the task exists
- Sentry evidence
- product/project mapping
- correct repository/workspace
- workflow identity
- policy
- constraints
- timeout/budget
- allowed consequential actions

The specialist coding agent owns repository context:
- which files matter
- how the implementation works
- which references to follow
- what change is appropriate

Do not artificially preselect a tiny source-file set for the coding agent merely to reduce tokens.

---

## Independent observation

Do not treat coding-agent prose as authoritative for facts Artemis can observe.

The specialist may report:
- conclusion
- likely root cause
- explanation
- evidence
- description of its change

Artemis should independently establish:
- base revision
- worktree/branch state
- changed files
- git status
- git diff
- repository-defined verification outcomes
- process completion
- duration
- usage/cost
- PR state

Principle:

> **Verify deterministically where possible. Use model judgement where necessary.**

---

## Consequential action boundary

The specialist agent should not own publication.

Current desired sequence:

```text
specialist modifies isolated worktree
    ↓
Artemis verifies
    ↓
Artemis creates Result
    ↓
human approves publication
    ↓
Artemis commits if required
    ↓
Artemis pushes worker branch
    ↓
Artemis creates PR
```

No specialist-initiated merge, deployment, protected-branch push or uncontrolled external publication.

For the current local experiment, worktree isolation plus process restrictions are useful but are not a complete security sandbox. Do not claim stronger isolation than implemented.

---

## Workflow is not a model session

This distinction is important:

> **A workflow is not synonymous with a model session.**

Artemis owns the durable lifecycle.

A workflow can contain:
- deterministic collection
- direct model reasoning
- tool calls
- specialist delegated execution
- deterministic verification
- approvals
- external publication

The specialist process can exit while the Artemis workflow continues.

This is central to the operator model.

---

## Result philosophy

Preserve:

> **Result is the product. Execution is the evidence.**

The user should not need to inspect agent transcripts to understand what Artemis produced.

A Result should explain:
- what happened
- what was concluded
- what actually changed
- what evidence supports it
- what verification passed/failed
- what decision remains

Execution traces are forensic evidence, not the primary product output.

---

## Morning Review

Morning Review is one of the strongest expressions of the original Artemis product thesis.

Preserve:

> **The goal is not a stream of agent activity. It is a concise record of what changed, what Artemis investigated, and what actually needs my attention.**

The user should wake up to outcomes and decisions, not agent chatter.

The key product test is:

> **Can Artemis oversee my live software portfolio, notice work I would otherwise have had to discover myself, coordinate the appropriate response, verify the outcome, and bring me only the decisions that require my attention?**

Stronger practical version:

> **Can I leave Artemis running overnight and wake up to useful, trustworthy engineering outcomes that I did not have to manually discover, initiate and supervise?**

---

## Artemis v1 → Lite → future Artemis

### Artemis v1
The original product vision:
- rich Electron operator interface
- portfolio awareness
- Morning Review
- persistent chat/memory
- worker agents
- gated PRs
- voice/presence
- cross-repository operations

### Artemis Lite
Engineering reconstruction/laboratory:
- explicit workflows
- context observability
- durable state
- permissions
- recovery
- idempotency
- verification
- usage
- failure injection
- operator/specialist boundary experiments

### Future Artemis / Artemis 2.0
Potential synthesis:
- original rich operator experience
- deliberate Lite architecture underneath
- persistent operation
- multiple tools and specialist execution engines
- outcomes and human review rather than agent activity

Lite is not intended to turn the product into a generic developer dashboard or coding agent.

---

## Case-study chronology

Preserve this chronology:

1. User had the Artemis operator idea.
2. Built Artemis v1.
3. It genuinely worked.
4. Using it exposed systems problems.
5. Built Lite to investigate those problems.
6. Made workflow/state/context/recovery explicit.
7. Dogfooded against real production work.
8. Progressive discovery improved evidence acquisition.
9. Fixed upfront planning proved insufficient for adaptive investigation.
10. Bounded investigation made adaptation controlled and observable.
11. Real investigation still remained inconclusive and relatively inefficient.
12. This clarified where a specialist execution boundary should sit.
13. The original product ambition remains unchanged.
14. Current work is integrating specialist execution back into the operator architecture.

Do not rewrite steps 1-3 using lessons from steps 8-12.

---

## Guardrails for future planning

Avoid:
- treating Artemis as a coding-agent competitor
- rebuilding Claude Code inside Artemis
- making Claude Code the centre of the product
- generic multi-agent-framework work without a real use case
- provider marketplaces
- token minimisation as the goal
- dashboard/UI sprawl
- premature persistent-host redesign
- unverified autonomous external actions
- large architecture refactors that are not needed for the vertical slice

Prefer:
- one real end-to-end workflow at a time
- explicit ownership boundaries
- replaceable specialist capabilities
- durable application state
- inspectable evidence
- deterministic verification
- human control at consequential boundaries
- dogfooding against real products
- outcomes rather than transcripts

---

## Current priority

Finish:

**Sentry → Artemis → specialised coding agent → verified Result → gated PR → Morning Review.**

Then:
1. dogfood it against real projects;
2. capture genuine evidence/screenshots;
3. update the case study with what actually happened;
4. compare usefulness, reliability, cost and execution evidence;
5. decide what Artemis 2.0 needs.

Do not optimise the case-study story ahead of product evidence.
