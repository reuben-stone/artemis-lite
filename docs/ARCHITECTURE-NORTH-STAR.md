# Artemis Lite: Persistent Portfolio Operations Architecture

**Status:** North-star architecture and feature direction  
**Date:** 17 September 2026  
**Audience:** Claude Code / Artemis Lite implementation work

## 1. Executive summary

Artemis Lite is evolving toward a **persistent engineering operations layer for a portfolio of software repositories**.

The long-term product should observe multiple projects continuously, collect operational and product signals, identify meaningful changes, create durable engineering workflows, delegate bounded investigation and implementation work, verify results, and present the operator with a concise Morning Review and a queue of work ready for human review.

Representative end state:

> **Morning Reuben.**
>
> Sentry detected six new errors overnight across three repositories. Artemis investigated four automatically. Two were reproducible and worker agents prepared fixes in isolated worktrees.
>
> **Lumi** - scanner timeout after navigation. Fix prepared, tests passed, PR ready for review.
>
> **Dōshi** - lesson progress persistence error. Fix prepared, tests passed, PR ready for review.
>
> **LumiLens** - two related errors require attention.
>
> Yesterday's product activity and repository changes are summarised below.

This is not a generic AI chat client or another autonomous coding agent. Claude Code or Codex may eventually be bounded execution engines. Artemis owns the **operational control plane** around them:

**observation → context → planning → capability selection → delegated work → approvals → durable state → recovery → verification → results → human review**

Core principles:

> **Deterministic shell, probabilistic core.**

> **Result is the product. Execution is the evidence.**

> **Use the minimum amount of agentic behaviour required to reliably complete the task.**

This document describes the destination. It is **not permission to implement every feature now**.

---

## 2. Product thesis

Original Artemis asked:

> **Can I build an AI system that tends my repositories?**

Artemis Lite asks:

> **What architecture is required to make that system observable, recoverable, selective about context, and safe enough to run persistently?**

The eventual system asks:

> **How do you safely operate a persistent AI engineering system across an entire software ecosystem?**

The engineering problem is not merely giving a model tools. It is controlling the system around those capabilities: project scope, context, state, recovery, side effects, external events, worker isolation, verification, cost, latency, observability and human control.

---

## 3. Product definition

Artemis Lite should ultimately be a **desktop control surface backed by a persistent engineering operations service**.

It supervises a portfolio rather than living inside one repository.

It should eventually know about:

- registered repositories and repository state;
- GitHub issues, pull requests, commits and checks;
- Sentry operational events;
- Google Analytics product signals;
- durable workflows and delegated worker runs;
- verification evidence;
- approvals;
- workflow results and artifacts;
- scheduled reviews;
- usage, cost, latency, failures and recovery.

It should not replace GitHub, Sentry, Google Analytics, an IDE, Claude Code/Codex, CI or deployment platforms. Artemis sits **above** them and composes them into durable operational workflows.

---

## 4. Destination architecture

```text
                         HUMAN OPERATOR
                               │
                        Electron client
                               │
                  typed command/event boundary
                               │
                     ARTEMIS CONTROL PLANE
                               │
       ┌───────────────────────┼────────────────────────┐
       │                       │                        │
 Workflow service       Portfolio service       Policy / approvals
       │                       │                        │
 State machine          Project registry         Side-effect policy
 Persistence            Signal aggregation       Human gates
 Recovery               Morning Review           Autonomy levels
 Results                Scheduling
       │                       │
       ├──────────────┬────────┼───────────┬─────────────┐
       │              │        │           │             │
 Context          Capability  GitHub     Sentry     Analytics
 Builder           Registry   adapter    adapter      adapter
       │              │
 Retrieval       Execution adapters
       │              │
       │        ┌─────┴──────────┐
       │        │                │
       │    Claude Code        Codex
       │    / worker          / worker
       │        │                │
       └────────┴──────┬─────────┘
                       │
                isolated worktrees
                       │
                 verification
                       │
                workflow results
                       │
                 review / publish
```

Initially these services can remain inside Electron main. Domain services should not depend on renderer lifecycle.

Later:

```text
Electron client
      │
 API / WebSocket
      │
Persistent Artemis host
      │
repositories / workers / integrations / scheduler / SQLite
```

Closing Electron should eventually **not terminate Artemis operations**. Do not perform this extraction prematurely. Preserve boundaries now so it becomes possible later.

---

## 5. Portfolio model

Maintain a registry of projects. A project eventually references:

- project ID and display name;
- repository path;
- Git remote/default branch;
- GitHub repository identity;
- enabled integrations;
- monitoring policy;
- execution/autonomy policy;
- optional analytics property;
- optional Sentry project.

Individual engineering workflows should normally remain **project-scoped**.

Cross-project workflows such as Morning Review should aggregate structured summaries/signals, not concatenate source context from every repository.

---

## 6. External signal architecture

### GitHub

GitHub represents engineering coordination and repository state.

Read capabilities can include repository metadata, issues/comments, pull requests, commits, branches and check status. Later writes can include PR creation, comments and issue updates.

External GitHub writes are consequential side effects and should initially remain approval-gated.

### Sentry

Sentry represents **operational evidence**.

It is not simply another tool to expose indiscriminately to a model.

Useful structured evidence includes:

- new/regressed issue;
- frequency;
- affected environment/users;
- stack trace;
- release/deployment;
- first/last seen;
- suspect commit/release information where available.

Initial integration should be read-only.

```text
Sentry issue
    ↓
normalise event
    ↓
map to project
    ↓
deduplicate / correlate
    ↓
severity + policy evaluation
    ↓
create investigation workflow if warranted
    ↓
gather repository evidence
    ↓
attempt reproduction
    ↓
delegate bounded implementation if justified
    ↓
verify
    ↓
produce result
    ↓
human review
```

Repeated occurrences must not spawn duplicate workers. Deduplication belongs to deterministic application logic.

### Google Analytics

Analytics represents **product/usage context**, not primarily an action source.

Collect deterministic metrics first: users, sessions, views and meaningful period deltas. Do not stream arbitrary analytics into every model call. Give models only relevant summaries where narrative interpretation adds value.

Analytics can contextualise operational events but must not be used to claim causation without evidence.

---

## 7. Signal normalisation

Avoid coupling workflow logic directly to provider payloads.

When integration work begins, introduce a narrow application-level signal boundary, conceptually:

```ts
type OperationalSignal =
  | RepositorySignal
  | ErrorSignal
  | AnalyticsSignal
  | DeploymentSignal
```

Signals need source, project, external ID, observed time, category, summary, locator, structured metadata and deduplication identity.

Do not build a giant universal event schema prematurely. Raw provider payloads should not become workflow state.

---

## 8. Event-to-workflow policy

Not every event invokes a model. Not every event creates a workflow.

```text
incoming event
      │
known duplicate? ───── yes → update occurrence metadata
      │ no
mapped project?
      │
relevant environment?
      │
new/regression/material severity?
      │
policy permits investigation?
      │
create workflow
```

Per-project policy should eventually support levels such as:

- Observe only
- Investigate automatically
- Investigate + prepare fix
- Publish PR after approval

Do not jump directly to autonomous publication/deployment.

---

## 9. Durable workflows and Results

Every meaningful autonomous activity should be persisted as a workflow: Sentry investigation, GitHub issue investigation, bug fix, visual verification, PR preparation or Morning Review.

The lifecycle describes **what the engine is doing**.

The WorkflowResult describes **what the workflow produced and whether the goal was achieved**.

These must remain distinct. A workflow may terminate cleanly while producing `result.status = failed`.

Morning Review should aggregate persisted Results rather than reconstructing work from raw traces or conversations.

Conceptually:

```ts
WorkflowResult {
  workflowId
  status: succeeded | failed | partial
  summary
  artifacts[]
}
```

Future artifact families may include:

```text
IssueArtifact
InvestigationArtifact
DiffArtifact
TestReportArtifact
ScreenshotArtifact
PullRequestArtifact
MorningReviewArtifact
FileArtifact
TextArtifact
```

Only implement artifact types when a real workflow needs them.

---

## 10. Context engineering at portfolio scale

Never build:

```text
20 repositories + all issues + all Sentry + all analytics
+ all memory + every tool → one prompt
```

Instead:

```text
event / goal
    ↓
identify project
    ↓
identify workflow stage
    ↓
select capabilities
    ↓
retrieve relevant repository/external evidence
    ↓
bounded ContextPacket
    ↓
model
```

Context remains inspectable: selected, excluded, truncated, estimated tokens, selection reason, source and workflow stage.

---

## 11. Capability selection

Expose capabilities according to workflow stage.

Example:

```text
Triage:
read_sentry_issue
read_recent_commits
read_file_excerpt
search_repository

Reproduce:
read_file_excerpt
search_repository
bounded execution

Implement:
delegated_worker

Verify:
run_tests
inspect_diff
visual_check where relevant

Publish:
create_pull_request [approval required]
```

This enables a useful evaluation: **all-tools baseline vs selective capability exposure**, measuring tool-definition tokens, planning quality, invalid attempts, latency and cost.

---

## 12. Delegated workers

Artemis should not become a second coding IDE.

Claude Code or Codex can eventually act as bounded execution engines. Artemis owns task definition, selected context, project, worktree, permissions, timeout, state, recovery policy, evidence, verification, Result and approval.

Workers own bounded code investigation and implementation.

Workers operate in isolated worktrees/branches and never directly merge or modify protected branches.

---

## 13. Verification

Worker self-report is insufficient.

Prefer deterministic evidence:

- tests;
- typecheck;
- lint/build;
- expected file changes;
- diff inspection;
- repository state;
- screenshots/visual checks;
- original reproduction no longer occurring.

Model evaluation can supplement but should not replace deterministic checks.

---

## 14. Human control

Initial policy:

**Automatic:** repository/GitHub/Sentry/analytics reads, portfolio collection, internal workflows, isolated worktrees, worktree modifications, tests/builds, screenshots, analysis and prepared results.

**Human review:** publish PR, external comments, merge, deploy, production-data changes, destructive repository actions.

Later autonomy is explicitly granted per project/action. Do not model autonomy as one global boolean.

---

## 15. Persistent host

Eventually Artemis runs independently of the user's laptop:

```text
/artemis
  /state/artemis.db
  /projects/<repo>
  /worktrees/<workflow-id>
  /artifacts/<workflow-id>
```

The host owns scheduler, event ingestion, workflows, workers, repositories, persistence, credentials, traces and artifacts. Electron becomes a remote control surface.

Keep SQLite until actual concurrency demonstrates a reason to change.

---

## 16. Scheduling and Morning Review

Morning Review becomes a scheduled portfolio workflow.

Conceptually:

```text
overnight
collect repository changes
collect Sentry changes
collect analytics summaries
inspect outstanding workflows
run policy-approved investigations

morning
finalise MorningReviewArtifact

user opens Artemis
→ report is already waiting
```

Use provider-supported events/webhooks where practical, with scheduled reconciliation as a safety net.

Morning Review should use structured data first and concise narrative second.

```text
GOOD MORNING, REUBEN
17 SEPTEMBER 2026

5 repositories checked
6 new operational issues
4 automatically investigated
2 fixes prepared
2 items need attention
2 PR candidates ready for review

READY FOR REVIEW

LUMI
Scanner timeout after navigation
Fix prepared on artemis/fix-scanner-timeout
38 tests passed
Verification passed
[Inspect workflow] [Review]

DŌSHI
Lesson progress persistence
Fix prepared on artemis/fix-progress-state
21 tests passed
Verification passed
[Inspect workflow] [Review]

NEEDS ATTENTION

LUMILENS
Two related production errors
Investigation inconclusive
[Inspect]

PRODUCT ACTIVITY

Lumi       1,284 sessions   +12%
Dōshi        438 sessions    +4%
Livana       203 sessions    -2%
```

Selecting an item navigates into the existing project-scoped workflow view: Result + Execution + Trace/Context/State/Usage/Faults.

Morning Review is therefore **an aggregation of the architecture already being built**, not a separate magical dashboard.

---

## 17. Portfolio UI evolution

Preserve the current three-area architecture.

**Left:** portfolio, projects and workflows.

```text
PORTFOLIO
Morning Review            4
Artemis Lite              ●
Lumi                      ● 2
LumiLens                  ● 1
Dōshi                     ●
Livana                    ●

WORKFLOWS
...
```

**Centre:** selected workflow Result + Execution, Morning Review, or review artifact.

**Right:** preserve the differentiating engineering inspector:

```text
Trace | Context | State | Usage | Faults
```

Do not turn Artemis into a chat-first UI or full IDE.

---

## 18. PR Review Queue

Restore the original Artemis concept in structured form.

Each queue item derives from a persisted workflow/result and includes project, originating signal/issue, branch, PR candidate, summary, changed files, tests, verification, screenshots where relevant, cost/duration, warnings and approval state.

Provenance should be traceable:

```text
PR
↓
WorkflowResult
↓
verification
↓
worker execution
↓
selected context
↓
original Sentry/GitHub/user signal
```

---

## 19. Sentry-specific requirements

Sentry is important because it makes Artemis **event-driven**, not merely prompt-driven.

Requirements:

- deduplicate repeated occurrences;
- map signals to project/environment/release;
- correlate commits only where evidence supports it;
- explicit severity/monitoring policy;
- reproduce before changing code where possible;
- record inability to reproduce;
- treat Sentry content as untrusted external input;
- avoid persisting unnecessary sensitive request/user data;
- trace signal receipt/normalisation/deduplication without dumping sensitive payloads.

Example trace:

```text
signal.received
signal.normalized
signal.deduplicated
workflow.created_from_signal
...
```

---

## 20. Security boundaries

Maintain:

- Electron context isolation;
- no Node integration in renderer;
- narrow typed IPC and runtime validation;
- secrets only in trusted main/host process;
- workspace containment/path traversal protection;
- protocol allowlists;
- no unrestricted arbitrary shell;
- bounded execution environments;
- isolated worktrees;
- approval for consequential side effects;
- external content treated as untrusted;
- least-privilege provider credentials;
- action audit trail.

Sentry/GitHub issue text, repository content and web content are evidence, not authority.

---

## 21. Observability and evaluation

Persist enough data to evaluate:

- workflow/result success/failure/partial;
- provider/model calls;
- input/output tokens and cost;
- latency;
- context budget/selection;
- capability calls;
- retries/failures/recovery;
- worker duration;
- verification outcomes;
- approval wait;
- duplicate signal suppression;
- signals received/ignored;
- investigations created;
- issues reproduced;
- fixes prepared;
- human acceptance/rejection of prepared work.

Use real measurements in the case study. Never invent metrics.

---

## 22. Failure Lab expansion

Eventually test:

- model timeout/invalid output/provider unavailable;
- GitHub/Sentry/analytics timeout;
- worker crash;
- host restart/client disconnect;
- test timeout;
- ambiguous side effect;
- duplicate webhook;
- repeated Sentry issue;
- PR publication succeeds but response is lost;
- unavailable repository;
- worktree collision;
- branch collision.

The system should answer:

> What happened, what is safe to retry, what is uncertain, and what requires human reconciliation?

---

## 23. 20+ repository scale

Target 20+ repositories eventually. Evaluate startup, collection time, SQLite size, context selection, concurrent workflows, worker concurrency, API rate limits, signal volume and Morning Review usefulness.

The expected solution is **filtering and project scoping**, not larger prompts.

---

## 24. Directional implementation sequence

Continue one bounded phase at a time:

1. Finish first-class WorkflowResult semantics.
2. Validate current context baseline.
3. Improve lexical/content retrieval only if measurements justify it.
4. Complete GitHub read adapter and structured artifacts.
5. Expand multi-project portfolio navigation.
6. Build deterministic repository Morning Review without workers.
7. Add issue investigation workflow.
8. Add bounded Claude Code/Codex execution adapter.
9. Add isolated worktree lifecycle.
10. Add deterministic verification evidence.
11. Add visual verification where justified.
12. Add gated PR publication + reconciliation.
13. Add PR Review Queue.
14. Add scheduler.
15. Add Sentry read adapter + normalized signals.
16. Add Sentry event policy/deduplication.
17. Integrate Sentry-derived results into Morning Review.
18. Add Google Analytics deterministic collection/summaries.
19. Add analytics to Morning Review.
20. Evaluate semantic/hybrid retrieval only if justified.
21. Add long-term memory only if evaluation demonstrates need.
22. Extract persistent host/runtime.
23. Convert Electron to remote control surface.
24. Validate 20+ repo scale.
25. Review persistence/concurrency requirements.
26. Add explicit per-project autonomy policies.
27. Build portfolio tending/child workflows.
28. Run evaluation suite and capture real metrics.
29. Capture final screenshots/demo.
30. Finalise case study.

Before each phase, inspect the current repository and choose the smallest coherent boundary.

---

## 25. Do not build yet

Do not let the north star cause Lite to become original Artemis again.

Avoid premature generic integration marketplaces, arbitrary agents, dozens of tools, universal event-bus abstractions, distributed infrastructure, vector databases without evidence, elaborate memory, autonomous merges/deploys, chat-first UI, full IDE behaviour, hypothetical multi-user SaaS architecture.

Build concrete workflows first.

---

# Case Study Update

## 26. Why Sentry changes the story

Sentry should not be presented as merely "another integration."

Without operational events, Artemis is mostly request-driven:

```text
human asks → Artemis works → result
```

With Sentry and scheduling it becomes event-driven and persistent:

```text
software emits evidence
→ Artemis evaluates it
→ policy decides whether work is warranted
→ durable workflow
→ bounded investigation
→ delegated implementation
→ verification
→ human review
```

This creates a strong case-study question:

> **What would have to be true before I trusted an AI engineering system to notice a production problem at 2am, investigate it while I slept, modify code in isolation, and have a verified fix waiting for review in the morning?**

The answer is not a better prompt. It is explicit state, selective context, constrained capabilities, event deduplication, durable workflows, isolated execution, retries, idempotency/reconciliation, verification, observability, Results, human approval and measurable behaviour.

---

## 27. Revised case-study narrative

### 01 - The idea
Build an AI system above a software ecosystem rather than inside one repository.

### 02 - Artemis
Original A.R.T.E.M.I.S. proves capability: multi-repo oversight, briefings, persistent memory, application-owned tools, isolated worker worktrees and gated PR review.

### 03 - It worked
The system is real, not a mock-up.

### 04 - What using it exposed
Context growth, broad tool exposure, implicit workflow state, incomplete recovery, ambiguous side effects, limited observability, difficult cost attribution and blurred app/agent responsibilities.

### 05 - The hypothesis
**Giving a model tools is relatively easy. Engineering a reliable system around those tools is the harder problem.**

### 06 - Artemis Lite
Reconstruct around deterministic workflow state, typed capabilities, selective context, durable persistence, structured Results, recovery, approval boundaries, tracing, usage measurement and failure injection.

### 07 - From prompt-driven to event-driven
Once workflow architecture is explicit, ask whether the same system can respond safely to **real operational evidence** rather than waiting for a human prompt.

Sentry is the first important test.

A production error is not an instruction. It is evidence.

Artemis deterministically decides whether the event is new, which project it belongs to, whether it warrants investigation and what policy permits. Only then does model reasoning or delegated engineering begin.

> **External events provide evidence. Artemis owns the decision process around that evidence.**

### 08 - The overnight workflow

```text
Sentry detects regression
→ map to repository
→ suppress duplicates
→ persist investigation workflow
→ select relevant context
→ reproduce issue
→ bounded worker prepares fix
→ tests and verification
→ persist Result
→ gate consequential publication
→ surface in Morning Review
```

### 09 - Morning Review
Morning Review is the human-facing expression of the architecture: what changed, what Artemis investigated, what it ignored and why, what it fixed, what verification passed, what remains uncertain and what requires approval.

Google Analytics contributes product context. GitHub contributes engineering state. Sentry contributes operational evidence. Artemis composes them into durable workflows and Results.

### 10 - Failure testing
Deliberately demonstrate provider timeout, worker crash, duplicate Sentry event, interrupted workflow, ambiguous side effect, failed verification and host restart.

### 11 - Evaluation
Use real measurements: context tokens, cost, latency, capabilities exposed, recovery, duplicate side effects prevented, signal deduplication, goal success, human acceptance/rejection and signal-to-verified-result time.

### 12 - What I learned
Potential closing direction, only after the system exists:

> Artemis started as an experiment in giving a model enough capability to operate across my software projects. Artemis Lite became an experiment in limiting, structuring and observing that capability.
>
> Adding persistent operational signals made the distinction clearer. The interesting question was no longer whether an agent could fix a bug. It was whether the surrounding system could decide when that work was warranted, give it only the context and permissions it needed, survive failure, verify the outcome and leave the consequential decision with a human.

Do not finalise public copy until the corresponding implementation and measurements exist.

---

## 28. Case-study visuals

When real, capture:

**Signal → Result architecture:** Sentry → Signal policy → Workflow → Context → Worker → Verification → Result → Morning/PR Review.

**Morning Review screenshot:** real repositories checked, operational events, investigations, fixes, PR queue and analytics.

**One overnight incident trace:** `signal.received → signal.normalized → workflow.created → context.built → model.plan → worker.started → tests.completed → verification.passed → result.finalized → approval.requested`.

The machinery itself should be visible. Avoid marketing-style fake autonomy visuals.

---

## 29. Portfolio copy implication

Do not promise Sentry-driven autonomous repair publicly until it exists.

Once implemented, Artemis homepage copy could evolve toward:

> **Artemis**
>
> A persistent engineering operations system for supervising a portfolio of software repositories. Artemis combines operational signals, selective context, durable workflows, delegated engineering, verification and human approval around consequential actions.

Until then, keep current conservative copy.

---

## 30. Instructions to Claude Code

Treat this document as a **north-star architecture and feature roadmap**, not a request to implement all features.

Before every phase:

1. Inspect the current repository.
2. Identify only the relevant parts of this document.
3. Compare them with current architecture.
4. Choose the smallest coherent implementation boundary.
5. Preserve tested invariants.
6. Add tests for new behaviour.
7. Run the full suite.
8. Report changes and deliberate deferrals.
9. Stop.

Do not use future requirements to justify premature abstractions.

Prefer concrete adapters and workflows before generic frameworks.

If current code shows a proposal here is wrong, explain the conflict and choose the smaller/better architecture.

**The destination is ambitious. The implementation must remain incremental.**
