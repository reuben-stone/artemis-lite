# Artemis Lite - Product Journey & Implementation Roadmap

## Purpose

Artemis Lite is evolving from a local Electron reliability experiment
into a **persistent AI engineering operations system for a portfolio of
software repositories**.

The long-term product should be capable of supervising 20+ repositories
from an always-on host, while the Electron application acts as the human
control surface.

The goal is **not** to rebuild Claude Code, Codex, or another coding
agent.

Those systems can become execution capabilities inside Artemis.

Artemis owns the layer around them:

> **project awareness -\> event collection -\> context selection -\>
> planning -\> workflow state -\> capability selection -\> delegated
> execution -\> approvals -\> recovery -\> verification -\> review**

The core question remains:

> **How do you safely operate a persistent AI engineering system across
> an entire software ecosystem?**

And the architectural principle remains:

> **Deterministic shell. Probabilistic core.**

The model should reason where reasoning is valuable. Conventional
software should own state, lifecycle, permissions, retries, side-effect
policy, persistence, recovery, budgets, tracing and verification
boundaries.

------------------------------------------------------------------------

# 1. End-State Product

A.R.T.E.M.I.S. remains:

**Autonomous Repository-Tending Engineering, Monitoring & Intelligence
System**

The target system is an engineering operations control plane that can:

-   Register and supervise 20+ repositories.
-   Maintain durable project and repository state.
-   Monitor GitHub activity, CI, PRs, issues and repository changes.
-   Produce cross-project Morning Reviews.
-   Surface work that appears to require attention.
-   Convert selected problems into durable project-scoped workflows.
-   Gather only the context needed for the current workflow step.
-   Delegate bounded implementation work to coding engines such as
    Claude Code or Codex.
-   Run implementation in isolated worktrees.
-   Execute tests and other verification.
-   Capture application screenshots where visual verification is
    relevant.
-   Ask for human approval before consequential external actions.
-   Create gated pull requests ready for review.
-   Survive desktop shutdowns, worker failures, provider failures and
    process interruptions.
-   Expose state, context, traces, usage, retries, failures and recovery
    to the user.
-   Eventually continue operating when the Electron application is
    closed.

The Electron app should become the **control surface**, not the process
whose lifetime determines whether Artemis is alive.

------------------------------------------------------------------------

# 2. Architectural Destination

``` text
                     ARTEMIS LITE
                   Electron Desktop
                         |
                  secure connection
                         |
                         v
              ARTEMIS CONTROL PLANE
               persistent Linux host
                         |
          +--------------+--------------+
          |              |              |
      Workflow        Scheduler      Monitoring
       Engine                         / Events
          |              |              |
          +--------------+--------------+
                         |
                  Persistent State
                         |
        +----------------+----------------+
        |                |                |
     Projects         Context         Workers
        |                |                |
     20+ repos       Retrieval       Claude Code
                                    Codex / other
        |
   Repository portfolio
```

A workflow remains **project-scoped** even when Artemis supervises many
projects.

``` text
Operations layer
      |
20+ projects
      |
recommended action
      |
new workflow
projectId = lumi
      |
context + tools + filesystem
bounded to Lumi
```

Multi-repository awareness must **not** become unrestricted
cross-repository agent access.

------------------------------------------------------------------------

# 3. Current Foundation

Completed before this roadmap:

## Phase 1 - Secure Electron Shell + UI

-   Electron main/preload/renderer separation.
-   Typed IPC direction.
-   Restrained engineering-tool UI.
-   Workflow rail and inspector.
-   Electron security improvements.

## Vertical Slice - Real Workflow Engine

-   Explicit workflow state machine.
-   Orchestrator.
-   Model provider boundary.
-   Typed tool registry.
-   Approval-gated side effects.
-   Idempotency ledger.
-   Persistent usage.
-   Append-only tracing.

## Recovery

-   Persisted workflows survive process interruption.
-   Resume from SQLite state.
-   Persisted approvals survive restart.
-   Completed steps are skipped.
-   Known completed side effects are not repeated.
-   Recovery/resume traces.

## Failure Lab

-   Deterministic fault injection.
-   Bounded retry policy.
-   Transient/permanent failure distinction.
-   Workflow interruption injection.
-   Side-effect ambiguity handling.
-   Tool-specific write reconciliation.
-   Failure/retry/recovery UI.

## Phase 2 - Project / Repository Domain

-   Persisted Project entity with stable ID.
-   Workflow belongs to project.
-   Project workspace root is filesystem security boundary.
-   Git metadata service.
-   Recovery resolves workflow back to project.
-   Schema ready for multiple projects.
-   Single active project UI for now.

## Phase 3 - Repository Context Engineering

-   Explicit ContextPacket.
-   Context budgets.
-   Repository evidence selection.
-   Included/excluded/truncated provenance.
-   Persisted context composition.
-   Provider token usage kept separate from estimates.
-   Context Inspector.
-   Initial deterministic path/metadata retrieval baseline.
-   No embeddings yet.

------------------------------------------------------------------------

# 4. Implementation Principles

These rules should guide every subsequent phase.

## 4.1 Artemis is the control plane

Do not rebuild capabilities that specialist coding engines already
perform well unless Artemis needs them for orchestration, verification,
safety or measurement.

Before adding a coding capability, ask:

> Could Artemis delegate this bounded task to Claude Code, Codex or
> another execution engine instead?

## 4.2 Workflow is the primary object

The system is not centred around an endless assistant conversation.

A workflow has:

-   goal
-   project
-   lifecycle
-   steps
-   context
-   capabilities
-   approvals
-   outputs
-   checkpoints
-   traces
-   usage
-   verification
-   final outcome

## 4.3 Project scope is a security boundary

A workflow belongs to one project unless a specific operations-layer
workflow is explicitly designed to aggregate multiple projects.

Repository tools must not silently cross project roots.

## 4.4 Context is a budgeted resource

Do not load all repositories, all memories, all tools or all
conversation history into every call.

Each model call should receive the minimum evidence necessary for its
current decision.

## 4.5 Capabilities are constrained

Prefer small typed capabilities over arbitrary shell access.

Consequential capabilities require explicit policy and, where
appropriate, human approval.

## 4.6 Persistence must support decisions

Persistence is not merely logging.

After interruption, persisted state must be sufficient to determine what
should happen next.

## 4.7 Side effects require semantics

Distinguish:

-   known not executed
-   safe to retry
-   known completed
-   ambiguous outcome requiring reconciliation
-   permanent failure

Never claim generic exactly-once execution.

## 4.8 Observability is part of the product

State, context, traces, usage, retries, failures and recovery should be
inspectable in the UI.

## 4.9 Build capability before autonomy

First prove a workflow manually.

Then make it durable.

Then make it observable.

Then make it repeatable.

Only then consider scheduling or proactive execution.

------------------------------------------------------------------------

# 5. Phase 3A - Context Baseline Evaluation

**Status:** immediate next step before expanding capability.

## Objective

Measure the current deterministic path/metadata context strategy before
improving retrieval.

## Implement / Test

Run a small fixed evaluation set against known Artemis Lite questions
and workflows.

Record:

-   files available
-   candidates considered
-   files selected
-   files excluded
-   exclusion reasons
-   estimated context tokens
-   provider input tokens
-   answer/task correctness
-   important evidence missed
-   duration
-   cost

Do not tune the algorithm between baseline runs.

## Required comparison baseline

At minimum preserve results for:

1.  path/metadata selection
2.  later path + lexical content selection
3.  later semantic/hybrid retrieval if implemented

## Exit criteria

-   Context Inspector reflects real persisted data.
-   Baseline measurements are stored or exportable.
-   Retrieval weaknesses are understood.
-   No move to embeddings merely because they are available.

------------------------------------------------------------------------

# 6. Phase 3B - Lexical Repository Retrieval

## Objective

Improve repository evidence selection based on observed baseline
failures without introducing vector infrastructure.

## Implement

-   Bounded repository text search.
-   Content keyword scoring.
-   Symbol/file-name/path weighting where useful.
-   Source provenance.
-   Deterministic ranking.
-   Search result excerpts.
-   Context budget integration.
-   Context Inspector reasons such as:
    -   path_match
    -   content_match
    -   symbol_match
    -   dependency_evidence
    -   budget_exceeded

## Evaluate

Compare against Phase 3A using the same tasks.

Measure whether added retrieval:

-   finds previously missed evidence
-   improves task success
-   increases/decreases context
-   increases latency/cost

## Exit criteria

Lexical retrieval has a measured baseline and can be defended before
semantic retrieval is considered.

------------------------------------------------------------------------

# 7. Phase 4 - GitHub Read Adapter

## Objective

Give Artemis real awareness of repository operations without allowing
external writes yet.

## Implementation

Create a narrow GitHub capability boundary.

Initial transport may use authenticated `gh` CLI if appropriate.

Read capabilities:

-   repository identity
-   open issues
-   issue details
-   issue comments
-   open pull requests
-   PR details
-   reviews
-   requested reviews
-   checks / CI status
-   recent repository activity where useful

Do not scatter `gh` commands through workflow code.

Use a GitHub service/adapter with domain types.

## Project integration

Attach GitHub identity to Project:

-   owner
-   repository
-   remote mapping
-   default branch
-   optional connection status

## Context integration

GitHub information becomes another context source with:

-   provenance
-   identifier
-   selection reason
-   estimated token contribution

## Exit criteria

Artemis can inspect the operational state of one registered GitHub
project using read-only capabilities.

------------------------------------------------------------------------

# 8. Phase 5 - Multi-Project Portfolio UI

## Objective

Expose the already multi-project-capable domain model as a real
portfolio.

## Implementation

Replace the single-project UI assumption.

Example:

``` text
PROJECTS

* artemis-lite       main
  lumi               main
  lumilens           main
  doshi              develop

+ Add repository
```

Capabilities:

-   native Electron directory picker
-   register repository
-   remove/archive repository
-   switch active project
-   show branch
-   dirty state
-   GitHub connection status
-   relevant alert count
-   workflow count/state

Keep workflow filesystem access project-scoped.

## Scale target

Design/test with:

-   5 repositories initially
-   20+ registered repositories as the explicit target

Avoid UI assumptions that every project must be visible simultaneously.

## Exit criteria

20+ projects can be registered without architectural or UI degradation,
even if only a subset has active work.

------------------------------------------------------------------------

# 9. Phase 6 - Repository Morning Review

## Objective

Reintroduce one of the defining original Artemis capabilities using the
Lite architecture.

## Workflow

``` text
Review registered projects
        |
collect deterministic state
        |
Git / GitHub / CI evidence
        |
detect changes since previous review
        |
filter unchanged/no-action projects
        |
model evaluates relevant changes
        |
Morning Review
```

## Important constraint

Do **not** send all 20 repositories to one giant model context.

Use deterministic collection and filtering first.

Example:

``` text
20 registered projects

127 open issues
18 open PRs
4 failing checks
7 review requests

       |
change detection
       v

11 meaningful changes

       |
model reasoning
       v

5 items requiring attention
```

## UI

Operations-level view above individual projects.

Example output:

``` text
MORNING REVIEW

20 repositories monitored
6 changed
3 require attention

LUMI
CI failure on main
[Investigate]

ARTEMIS LITE
New reproducible bug
[Start workflow]

DOSHI
PR ready for review
[Review]
```

## Exit criteria

A real read-only Morning Review works across multiple repositories and
can create a project-scoped workflow from a surfaced item.

------------------------------------------------------------------------

# 10. Phase 7 - Issue Investigation Workflow

## Objective

Turn GitHub issues into durable investigation workflows.

## Flagship workflow begins here

``` text
Issue selected
     |
retrieve issue + comments
     |
inspect repository evidence
     |
attempt reproduction / understand failure
     |
produce diagnosis
     |
propose implementation plan
```

Artemis should show:

-   issue evidence
-   repository evidence
-   selected context
-   model decisions
-   workflow state
-   usage
-   confidence/uncertainty where appropriate

## Exit criteria

Artemis can take a real issue from a registered project and produce a
defensible diagnosis and implementation plan.

------------------------------------------------------------------------

# 11. Phase 8 - Execution Engine Adapter

## Objective

Delegate bounded engineering implementation rather than rebuilding a
general coding agent.

## Architecture

Introduce an execution engine interface.

Potential implementations:

-   Claude Code
-   Codex
-   future local/remote worker

Conceptually:

``` text
ExecutionEngine {
  start(task, workspace, constraints)
  status(runId)
  cancel(runId)
  result(runId)
}
```

Do not couple workflow orchestration to one vendor's terminal output.

## Inputs

A delegated task should receive:

-   project/worktree
-   bounded objective
-   selected context/references
-   constraints
-   expected verification
-   allowed operations

## Outputs

Normalize:

-   status
-   changed files
-   summary
-   command/test results
-   usage if available
-   errors
-   artifacts

## Exit criteria

Artemis can delegate a bounded implementation task and persist its
execution as part of a durable workflow.

------------------------------------------------------------------------

# 12. Phase 9 - Isolated Worktrees + Worker Lifecycle

## Objective

Make implementation safe enough to run without modifying the project's
main working tree.

## Implementation

For each implementation workflow:

-   create isolated Git worktree
-   create workflow branch
-   bind worker to worktree
-   prevent protected branch writes
-   persist worktree/branch identity
-   resume worker/workflow safely
-   cleanup policy after completion/cancellation

Example host structure:

``` text
/artemis/
  state/
    artemis.db

  projects/
    lumi/
      repository/

    doshi/
      repository/

  worktrees/
    workflow-a82f/
    workflow-b119/

  artifacts/
    screenshots/
    diffs/
    reports/
```

## Exit criteria

Two workflows can operate against the same repository without sharing a
mutable working directory.

------------------------------------------------------------------------

# 13. Phase 10 - Verification Pipeline

## Objective

Separate "worker finished" from "work is correct".

## Verification capabilities

-   inspect git diff
-   run bounded test commands
-   run typecheck
-   run lint where relevant
-   inspect build result
-   inspect GitHub checks
-   compare expected changed files
-   model review of diff/evidence

Verification should be explicit workflow stages.

``` text
IMPLEMENT
   |
worker finished
   |
VERIFY
   +-- tests
   +-- diff
   +-- build
   +-- model review
   |
PASS / CORRECTIVE STEP / FAIL
```

## Exit criteria

An implementation cannot be considered completed merely because the
execution engine exited successfully.

------------------------------------------------------------------------

# 14. Phase 11 - Visual Verification

## Objective

Restore and improve the original system's ability to reason about visual
application state.

## Capabilities

-   launch bounded application preview
-   capture screenshot
-   store screenshot as workflow artifact
-   attach artifact to verification context
-   multimodal model inspection
-   persist findings

Example:

``` text
capture_application
1920x1080
      |
visual model inspection
      |
finding:
navigation overlaps at 1024px
      |
verification failed
      |
corrective implementation
```

## Use cases

-   UI regressions
-   layout bugs
-   visual issue reproduction
-   before/after verification
-   PR review

## Exit criteria

At least one real UI issue can be implemented and verified using
screenshots as evidence.

------------------------------------------------------------------------

# 15. Phase 12 - GitHub Write Capabilities + Gated PR

## Objective

Complete the Issue -\> Fix -\> PR lifecycle.

## Write capabilities

-   create branch/push workflow branch
-   create pull request
-   update pull request
-   add workflow summary
-   mark Ready for Review where appropriate

These are consequential external actions.

## Approval policy

At minimum, PR publication should be approval-gated initially.

``` text
Implementation complete
Tests pass
Visual verification pass
        |
CREATE PR?
        |
     approval
        |
publish
        |
READY FOR REVIEW
```

## Side-effect semantics

GitHub writes require:

-   idempotency identity
-   persisted intent
-   reconciliation after ambiguous failure
-   ability to detect already-created PR
-   no blind retries after uncertain external writes

## Exit criteria

Real workflow:

> Review issue -\> investigate -\> implement in worktree -\> test -\>
> verify -\> request approval -\> create PR -\> Ready for Review.

This becomes the primary product demo.

------------------------------------------------------------------------

# 16. Phase 13 - PR Review Workflow

## Objective

Make Artemis useful after implementation, not only before PR creation.

## Workflow

``` text
PR selected
   |
retrieve PR + diff + comments + checks
   |
checkout isolated branch/worktree
   |
run verification
   |
optional app launch
   |
visual inspection
   |
review findings
   |
PASS / REQUEST CORRECTION
```

Potentially delegate corrective work through the execution engine.

## Exit criteria

Artemis can inspect a real PR and return a structured, evidence-backed
review state.

------------------------------------------------------------------------

# 17. Phase 14 - Durable Scheduling

## Objective

Allow workflows to begin without the desktop UI being manually opened at
the correct moment.

Do this only after manual workflows are proven.

## Initial scheduled capabilities

-   Morning Review
-   repository status refresh
-   stale PR review
-   failed-check review
-   interrupted workflow scan

## Rules

Scheduling should create ordinary durable workflows.

Do not build a second execution model for scheduled work.

## Exit criteria

A scheduled Morning Review can run reliably using the same workflow
engine as manually created work.

------------------------------------------------------------------------

# 18. Phase 15 - Event-Driven Repository Monitoring

## Objective

Move from polling-only operations toward event-aware repository tending.

## Potential inputs

-   GitHub webhooks
-   CI failure
-   new issue
-   PR opened
-   review requested
-   PR merged
-   check completed

## Architecture

Events should enter through an adapter and become persisted domain
events.

``` text
GitHub event
     |
Event Adapter
     |
persist
     |
policy / deterministic filtering
     |
optional workflow creation
```

Do not let webhooks directly trigger unrestricted model/tool execution.

## Exit criteria

At least one event, such as CI failure, can safely create an
investigation workflow.

------------------------------------------------------------------------

# 19. Phase 16 - Semantic / Hybrid Retrieval Experiment

## Objective

Only now decide whether embeddings materially improve Artemis.

Do not add semantic retrieval merely to claim RAG.

## Compare

Using the same evaluation corpus:

1.  full-context strategy
2.  path/metadata retrieval
3.  lexical content retrieval
4.  semantic retrieval
5.  hybrid retrieval

Measure:

-   task success
-   evidence recall
-   irrelevant context
-   provider input tokens
-   latency
-   cost

## Implementation if justified

-   chunking strategy
-   local embeddings initially
-   vector index/storage
-   project isolation
-   provenance
-   retrieval score
-   context budget integration

## Exit criteria

Semantic retrieval remains only if measured results justify its
complexity.

------------------------------------------------------------------------

# 20. Phase 17 - Long-Term Memory

## Objective

Add memory only for information that should survive beyond an individual
workflow and cannot be derived cheaply from authoritative sources.

Memory is **not** workflow state.

Potential memory:

-   stable project conventions
-   user review preferences
-   architecture decisions
-   recurring repository-specific facts

Do not use memory for:

-   current workflow status
-   GitHub state
-   current branch state
-   information available from repository files
-   data that should be re-read from an authoritative source

## Requirements

-   provenance
-   project/global scope
-   update semantics
-   expiry/invalidity where relevant
-   selective retrieval
-   inspectability

## Exit criteria

Memory improves a measured workflow without causing uncontrolled prompt
growth.

------------------------------------------------------------------------

# 21. Phase 18 - Persistent Host Extraction

## Objective

Move workflow execution out of the Electron process after the local
architecture and workflows are proven.

This is the point where Artemis becomes genuinely always-on.

## Target

``` text
Electron
   |
API + event stream
   |
Artemis Service
   |
Workflow Engine
Project Service
Context Service
GitHub Adapter
Scheduler
Workers
Persistence
```

## Important migration rule

Do not rewrite domain logic.

The current separation should allow:

``` text
Electron IPC -> application services
```

to become:

``` text
HTTP/RPC/WebSocket -> application services
```

## Initial deployment

A single persistent host is sufficient.

Potential environment:

-   Linux host
-   dedicated SSD
-   repositories cloned locally
-   worker worktrees
-   persistent database
-   secrets stored server-side

## Security work

Before remote operation:

-   authentication
-   transport security
-   secret management
-   API authorization
-   project access policy
-   filesystem containment
-   worker process isolation
-   network policy
-   audit trail

## Exit criteria

Electron can close while an Artemis workflow continues running on the
persistent host.

------------------------------------------------------------------------

# 22. Phase 19 - Remote Control Surface

## Objective

Make Electron a true client of the persistent Artemis service.

## Capabilities

-   connect/disconnect host
-   project portfolio
-   workflow creation
-   live workflow events
-   approvals
-   traces
-   context inspection
-   usage
-   artifacts
-   Failure Lab/dev controls where appropriate

Use an event stream rather than aggressive polling.

## Exit criteria

The desktop application can reconnect after being offline and
reconstruct current state entirely from the service.

------------------------------------------------------------------------

# 23. Phase 20 - 20+ Repository Scale Validation

## Objective

Prove the architecture at the portfolio scale the product is intended to
support.

## Test environment

At least 20 registered repositories, using safe test/public repositories
where necessary.

Measure:

-   startup time
-   project refresh time
-   Morning Review duration
-   database growth
-   context storage growth
-   GitHub API usage
-   model calls
-   token usage
-   cost
-   concurrent workflow behaviour
-   worker filesystem usage
-   UI responsiveness

## Important design goal

Repository count should not linearly become model context size.

Most portfolio collection should be deterministic.

## Exit criteria

20+ repositories can be supervised without:

-   giant prompts
-   unrestricted cross-project access
-   UI collapse
-   uncontrolled model cost
-   fragile workflow state

------------------------------------------------------------------------

# 24. Phase 21 - Concurrency and Persistence Review

## Objective

Evaluate whether the single-host persistence architecture still fits
actual workload.

Do **not** replace SQLite pre-emptively.

Measure first.

Questions:

-   How many workflows execute concurrently?
-   How many worker processes?
-   Are writes contending?
-   Are queues required?
-   Is one host sufficient?
-   Is SQLite WAL still appropriate?
-   Do we need PostgreSQL?
-   Do we need a dedicated job queue?

Only introduce infrastructure when measured constraints justify it.

## Exit criteria

Persistence/queue architecture is explicitly justified by observed scale
rather than assumed scale.

------------------------------------------------------------------------

# 25. Phase 22 - Policy and Autonomy Layer

## Objective

Allow Artemis to perform useful proactive work without making every
capability equally autonomous.

Define policies by capability and consequence.

Example:

``` text
READ repository state       autonomous
READ GitHub issues          autonomous
RUN bounded investigation   autonomous
CREATE worktree             autonomous
RUN tests                   autonomous

MODIFY isolated worktree    policy controlled

CREATE external PR          approval required
MERGE PR                    approval required
DEPLOY                       approval required
DELETE resources            blocked / strict approval
```

Policies should be explicit data/configuration, not scattered `if`
statements.

## Exit criteria

The user can understand why Artemis acted autonomously, why it paused,
and what action requires approval.

------------------------------------------------------------------------

# 26. Phase 23 - Portfolio Tending / Child Workflows

## Objective

Only after the single-workflow lifecycle is proven, allow
operations-level workflows to spawn bounded project workflows.

Example:

``` text
Nightly Portfolio Review
        |
20 projects inspected
        |
3 eligible issues
        |
+-------+-------+
|       |       |
v       v       v
WF A    WF B    WF C
Lumi    Doshi   Artemis
```

Each child workflow:

-   has its own project scope
-   state
-   context
-   worker
-   worktree
-   usage
-   approvals
-   verification

The parent portfolio workflow aggregates status, not repository
filesystem access.

## Exit criteria

Artemis can prepare several independent pieces of work without creating
an uninspectable multi-agent swarm.

------------------------------------------------------------------------

# 27. Phase 24 - Evaluation Suite

## Objective

Turn the architecture experiment into measurable engineering evidence.

Create executable scenarios covering:

### Context

-   relevant evidence retrieval
-   irrelevant context exclusion
-   context budget pressure
-   lexical vs semantic/hybrid retrieval

### Reliability

-   provider timeout
-   provider unavailable
-   malformed model output
-   tool timeout before side effect
-   ambiguous side effect
-   process interruption
-   restart during approval
-   restart during verification

### Workflow quality

-   issue diagnosis
-   implementation
-   test verification
-   visual verification
-   PR creation/reconciliation

### Portfolio

-   Morning Review across 5/10/20+ projects
-   unchanged project filtering
-   concurrent workflows
-   GitHub event handling

Measure:

-   success/failure
-   retries
-   duration
-   provider tokens
-   context tokens
-   cost
-   tool calls
-   deterministic operations
-   human approvals
-   recovery outcome

## Exit criteria

The case study can use real measurements rather than architectural
claims.

------------------------------------------------------------------------

# 28. Phase 25 - Case Study Capture Mode

## Objective

Produce repeatable visual evidence without faking product behaviour.

Create an isolated deterministic demo/capture mode that uses real UI and
domain boundaries with controlled fixtures.

Do not build a separate fake screenshot application.

## Capture states

### Original Artemis

1.  workspace overview
2.  active assistant session
3.  repository / PR workflow
4.  context-heavy state

### Artemis Lite

1.  portfolio / Morning Review
2.  workflow planning
3.  Context Inspector
4.  delegated execution
5.  approval
6.  failure + retry
7.  recovery
8.  visual verification
9.  completed workflow + Usage
10. PR Ready for Review

## Videos

At least two short recordings:

### Workflow lifecycle

Issue -\> context -\> worker -\> tests -\> approval -\> PR

### Reliability

Execution -\> deliberate interruption/failure -\> restart/recovery -\>
completion

Fixture metrics must never be presented as empirical evaluation results.

------------------------------------------------------------------------

# 29. Phase 26 - Final Product / Case Study Review

Only after implementation, testing and evidence collection should the
narrative be finalized.

Review:

-   What did Artemis originally prove?
-   What failed or became difficult?
-   Which problems were architectural rather than model-quality
    problems?
-   What hypothesis led to Lite?
-   What does Lite actually do now?
-   Where is autonomy useful?
-   Where is deterministic software superior?
-   What does selective context measurably change?
-   Which retrieval strategy won and why?
-   What failures remain?
-   Which side effects remain fundamentally ambiguous?
-   What would a third iteration change?
-   What did we deliberately choose not to automate?

The final narrative should emerge from the finished system, not force
the implementation to fit pre-written claims.

------------------------------------------------------------------------

# 30. Flagship End-to-End Workflow

This should become the primary Artemis Lite demonstration.

> **Review the open issues for this repository. Identify the
> highest-priority reproducible bug, investigate it, implement a fix in
> an isolated worktree, run the relevant tests, visually verify the
> result where appropriate, and prepare a pull request for my review.**

Expected lifecycle:

``` text
GOAL
 |
v
RETRIEVE GITHUB STATE
 |
v
EVALUATE ISSUES
 |
v
SELECT ISSUE
 |
v
RETRIEVE PROJECT CONTEXT
 |
v
PLAN
 |
v
CREATE ISOLATED WORKTREE
 |
v
DELEGATE IMPLEMENTATION
 |
v
RUN TESTS
 |
v
INSPECT DIFF
 |
v
VISUAL VERIFY (when relevant)
 |
+---- fail ----> CORRECTIVE WORK
 |
pass
 |
v
APPROVAL: CREATE PR?
 |
v
RECONCILE / PUBLISH
 |
v
READY FOR REVIEW
```

At every stage Artemis should be able to show:

-   persisted workflow state
-   current project
-   selected context
-   excluded context
-   capabilities exposed
-   tool/worker activity
-   usage
-   retries
-   artifacts
-   approvals
-   verification result

------------------------------------------------------------------------

# 31. Portfolio End-State Workflow

The second defining experience should be portfolio supervision.

> **Review my projects.**

Example:

``` text
MORNING REVIEW

20 repositories monitored
6 changed overnight
3 require attention


LUMI

CI failure on main
Likely introduced by PR #184

[Investigate]


ARTEMIS LITE

Issue #47 appears reproducible
No linked PR

[Start workflow]


DOSHI

PR #91 ready for review
Tests passing
Visual verification passed

[Review]


17 PROJECTS

No action required
```

The user should be able to convert an operations-level finding into a
project-scoped durable workflow with one deliberate action.

------------------------------------------------------------------------

# 32. What Artemis Lite Should Not Become

Avoid:

-   another general-purpose chat UI
-   another Claude Code clone
-   an unrestricted shell agent
-   a multi-agent swarm for its own sake
-   a vector database demo
-   a generic RAG application
-   a dashboard full of synthetic metrics
-   an Electron app that must stay open for workflows to survive
-   a giant context window containing every repository
-   a system that equates "worker exited successfully" with "task
    succeeded"
-   an autonomous PR/merge/deploy bot without explicit side-effect
    policy

------------------------------------------------------------------------

# 33. Product Thesis

Original Artemis proved that a desktop AI operations layer could
coordinate meaningful engineering capabilities across a repository
ecosystem.

Artemis Lite asks a harder question:

> **How much agentic architecture is actually required to perform that
> work reliably?**

The intended answer is not "less capable".

It is:

> **smaller model contexts, clearer capability boundaries, explicit
> workflow state, durable execution, measurable behaviour and deliberate
> human control over consequential actions.**

The ambition remains large.

The architecture becomes more controlled.

------------------------------------------------------------------------

# 34. Implementation Order Summary

The recommended sequence from the current state is:

``` text
CURRENT
Phase 3 Context Engineering
        |
        v
3A Context baseline evaluation
        |
3B lexical repository retrieval
        |
4 GitHub read adapter
        |
5 multi-project portfolio UI
        |
6 Morning Review
        |
7 issue investigation
        |
8 execution engine adapter
        |
9 isolated worktrees
        |
10 verification pipeline
        |
11 visual verification
        |
12 gated GitHub PR
        |
13 PR review workflow
        |
14 durable scheduling
        |
15 event-driven monitoring
        |
16 semantic/hybrid retrieval experiment
        |
17 long-term memory if justified
        |
18 persistent host extraction
        |
19 remote Electron control surface
        |
20 20+ repository scale validation
        |
21 concurrency/persistence review
        |
22 policy/autonomy layer
        |
23 portfolio tending + child workflows
        |
24 evaluation suite
        |
25 case-study capture mode
        |
26 final case-study review
```

This ordering is intentional.

Do not jump directly to the persistent server, semantic retrieval,
multiple workers or proactive autonomy.

First prove each capability locally and measurably. Then extract the
proven domain architecture into the always-on control plane.

------------------------------------------------------------------------

# 35. Instruction to Claude

Treat this document as the **long-term product journey**, not permission
to implement every phase immediately.

For each phase:

1.  Inspect the current implementation first.
2.  Confirm the smallest architectural boundary required.
3.  Identify interactions with existing
    workflow/recovery/context/security semantics.
4.  Implement only that phase.
5.  Add deterministic tests.
6.  Run the full existing test suite.
7.  Report files changed, architecture, tests, limitations and
    deliberately deferred work.
8.  Stop before the next phase for review.

Do not collapse several roadmap phases into one implementation pass.

The point of Artemis Lite is not merely reaching the final feature set.

The engineering journey, measured tradeoffs, failures, corrections and
architectural decisions are part of the product and the case study.
