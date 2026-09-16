# Artemis Lite - UI Implementation Brief for Claude Code

## 0. Purpose of this document

This document is the implementation specification for the Artemis Lite desktop UI.

Read this alongside:

- `docs/ARTEMIS-LITE-TECHNICAL-BRIEF.md`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/ARTEMIS-OBSERVATIONS.md`
- `docs/ARTEMIS-CASE-STUDY-PAGE-BRIEF.md`

Those documents remain authoritative for system architecture. This document defines how that architecture should become visible and understandable in the Electron product.

The UI is not decorative polish added after the agent architecture. It is part of the experiment.

**The core UI objective is to make an AI workflow inspectable.**

A person should be able to look at Artemis Lite and answer:

1. What goal is the system trying to achieve?
2. What stage is it currently in?
3. What has already happened?
4. Which operations were deterministic and which involved an LLM?
5. What context was supplied to each model call?
6. Which tools were called and with what result?
7. What side effects require human approval?
8. What failed, if anything?
9. How did the system recover?
10. How many model calls, tokens, retries, tool calls, milliseconds and estimated cost did the workflow consume?
11. Can the workflow survive interruption and resume without duplicating side effects?

If the interface cannot make these questions easy to answer, it is not finished.

---

# 1. Product thesis

Original Artemis is an AI desktop workspace. Its interface places Artemis itself at the centre of the experience and exposes capabilities around that assistant.

Artemis Lite should intentionally invert that relationship.

**The workflow is the protagonist, not the AI persona.**

Artemis Lite is a small desktop application for executing and inspecting reliable AI-assisted workflows. It should feel closer to a workflow debugger, execution trace, or developer tool than a conversational assistant.

The central architectural principle is:

> **Deterministic shell, probabilistic core.**

The interface must visually reinforce that principle.

The application owns workflow state, persistence, tool execution, validation, approvals, retries, recovery, tracing and context budgets. Models are invoked only for bounded reasoning tasks.

Do not make the UI imply that a mysterious autonomous intelligence is controlling the entire application.

---

# 2. Non-goals

Do **not** turn Artemis Lite into another large productivity platform.

Do not build unless a later requirement explicitly justifies it:

- authentication
- accounts
- teams
- billing
- onboarding tours
- integrations marketplace
- generic chat product
- social features
- large settings area
- dashboard full of vanity metrics
- elaborate AI avatar
- animated 3D orb
- voice interface
- mobile layout
- command terminal
- unrestricted shell access
- arbitrary file browser
- plugin marketplace
- multiple autonomous agent personalities
- decorative landing-page-style UI inside the desktop app

The application should have one excellent primary workspace.

---

# 3. Design character

## 3.1 Overall feeling

Artemis Lite should feel:

- quiet
- technical
- precise
- inspectable
- desktop-native
- restrained
- information-dense without becoming cramped
- intentionally engineered rather than generically "AI"

References in spirit, not for direct imitation:

- Linear's restraint and hierarchy
- VS Code / browser devtools inspection mentality
- GitHub Actions execution history
- database/admin tooling
- observability products such as tracing interfaces
- native macOS desktop utility density

Do not copy another product's visual system.

## 3.2 Relationship to original Artemis

There should be visible lineage, but not visual duplication.

Original Artemis can remain the more atmospheric, personality-led system. Lite should be the architectural counterpoint.

Retain only subtle lineage such as:

- the Artemis name
- a restrained violet/purple accent
- perhaps a simplified mark if one already exists and is legally/technically available in the repository

Do not reproduce the large central Artemis orb/object.

## 3.3 Anti-patterns

Avoid common AI-generated SaaS aesthetics:

- giant gradient headlines
- glowing cards everywhere
- purple-to-blue gradients
- excessive pill-shaped controls
- glassmorphism
- random sparkles
- unnecessary shadows
- huge border radii
- emoji status indicators
- generic robot icons
- oversized empty hero areas
- marketing slogans occupying valuable application space

This is an engineering application.

---

# 4. Desktop window and layout

## 4.1 Target environment

Primary target is Electron desktop on macOS-sized laptop/desktop screens.

Design first for approximately:

- 1440 x 900
- 1512 x 982
- 1728 x 1117

The application should remain usable down to roughly 1180 x 720 without horizontal page scrolling.

Do not spend Phase 1 time building mobile responsiveness.

## 4.2 Primary shell

Use a three-column application shell:

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ ARTEMIS / LITE         Workspace / Model                usage      status   │
├──────────────────┬──────────────────────────────────────┬────────────────────┤
│                  │                                      │                    │
│ WORKFLOWS        │ ACTIVE WORKFLOW                      │ INSPECTOR          │
│                  │                                      │                    │
│ workflow list    │ goal                                 │ Trace              │
│                  │ workflow stages                      │ Context            │
│                  │                                      │ State              │
│                  │ active operation                     │ Usage              │
│                  │                                      │                    │
│                  │ approval / recovery / result         │ selected detail    │
│                  │                                      │                    │
│ + New workflow   │                                      │                    │
├──────────────────┴──────────────────────────────────────┴────────────────────┤
│ latest system event / checkpoint / recovery message                         │
└──────────────────────────────────────────────────────────────────────────────┘
```

Suggested initial widths:

- left rail: 220-250px
- centre: flexible, minimum 560px
- inspector: 330-390px
- top bar: approximately 48px
- bottom event/status strip: approximately 28-32px

The inspector may be collapsible at narrower desktop widths. The workflow rail can become compact before the centre is compromised.

Do not use a traditional website header.

---

# 5. Visual design tokens

Use the project's existing styling system if one is already established. Do not introduce a second styling framework without a reason.

If starting from scratch, CSS variables/tokens should be defined centrally.

## 5.1 Colour

Use neutral near-black/charcoal surfaces rather than pure black.

Suggested semantic token structure, not mandatory literal values:

```css
--bg-app
--bg-panel
--bg-panel-raised
--bg-hover
--bg-selected
--border-subtle
--border-strong
--text-primary
--text-secondary
--text-muted
--accent
--accent-subtle
--status-success
--status-warning
--status-danger
--status-info
```

A restrained violet may be used as `--accent` to retain Artemis lineage.

Status colours must carry meaning only:

- success: completed/verified
- warning: approval/retry/degraded
- danger: failure/error
- accent: active/current/selected

Never rely on colour alone for state.

## 5.2 Typography

Use a modern neutral sans-serif for application UI and a monospace face for technical values.

Preferred strategy:

- UI: system font stack or an existing project font
- technical values/code/IDs/token counts: system monospace stack

Avoid importing several web fonts just for aesthetics.

Suggested hierarchy:

- application title: 12-13px, medium/semibold, tracking slightly increased
- section labels: 10-11px uppercase or small caps treatment, muted
- workflow title: 18-22px
- primary body: 13-14px
- secondary metadata: 11-12px
- technical trace: 11-12px monospace

Do not make the interface tiny simply to appear technical.

## 5.3 Spacing

Use a disciplined 4px base spacing system.

Common values:

- 4
- 8
- 12
- 16
- 20
- 24
- 32

## 5.4 Radius and shadows

Keep radius restrained, roughly 4-8px depending on component.

Prefer borders and surface contrast over large drop shadows.

Use shadows only when communicating actual elevation such as a modal or floating menu.

---

# 6. Top application bar

The top bar should orient the user without becoming a toolbar full of controls.

Suggested structure:

```text
ARTEMIS / LITE      local-workspace     Claude Sonnet 4.5       $0.014 · 8.4k tok · 12.4s      ● Running
```

Exact provider/model should come from runtime state, not hard-coded mock copy.

## 6.1 Left

Display:

**ARTEMIS / LITE**

Optional tiny descriptor beneath/adjacent only if it fits naturally:

> Workflow Inspector

Do not use a marketing tagline in the main application chrome.

## 6.2 Centre

Display current workspace/project context if the architecture supports one.

If workspace selection is not yet implemented, omit it rather than fake it.

## 6.3 Right

When a workflow is selected, display compact live summary metrics:

- estimated cost
- total tokens
- elapsed duration
- workflow status

Example:

```text
$0.014   8,421 tok   12.4s   ● Running
```

Values should update from actual telemetry.

If no workflow exists, show no fake metrics.

---

# 7. Left rail - Workflows

The left rail represents persisted workflow instances, not chat conversations.

Header:

**WORKFLOWS**

Each row should communicate:

- title/goal summary
- state
- relative or compact timestamp
- optionally a tiny failure/approval marker

Example:

```text
● Prepare release notes
  Running · 10:42

✓ Review project notes
  Completed · 09:18

! Update task list
  Awaiting approval · Yesterday
```

Use icons plus text/tooltips where appropriate. Do not rely on coloured dots alone.

## 7.1 New workflow action

Bottom of rail:

`+ New workflow`

This opens a small modal/sheet, not a separate onboarding flow.

## 7.2 Selection behaviour

Selecting a workflow should populate:

- centre workflow view
- inspector
- usage summary
- trace
- persisted state

Historical completed/failed workflows should remain inspectable.

## 7.3 Empty state

When no workflows exist:

> **No workflows yet**
>
> Create a goal to inspect how Artemis Lite plans, executes and verifies it.

Button:

`New workflow`

Keep this modest. No illustration required.

---

# 8. New Workflow modal

This is the primary input surface.

Do not make chat the default interaction model.

Title:

**New workflow**

Primary field label:

**Goal**

Placeholder example:

> Prepare release notes from the project notes and create a follow-up task for anything unresolved.

Optional fields should only appear if the architecture genuinely supports them, for example workspace/document scope.

Primary action:

`Start workflow`

Secondary:

`Cancel`

Below the field, a small note may explain:

> Artemis Lite will create a bounded plan, execute permitted tools, request approval before side effects, and verify the result.

Do not promise behaviour not implemented.

Keyboard behaviour:

- Escape closes
- Cmd/Ctrl + Enter can submit if accessible and documented
- focus trapped correctly
- initial focus on goal field

---

# 9. Centre panel - Active Workflow

This is the most important surface in the application.

## 9.1 Header

Small label:

**ACTIVE WORKFLOW**

Large title should be the user goal or a concise generated title.

Example:

> Prepare release notes

Under it, show useful workflow metadata without clutter:

```text
Running · started 10:42:18 · workflow_01J...
```

Long IDs can be copyable and truncated visually.

## 9.2 Stage pipeline

The workflow lifecycle should be visible at all times.

Baseline stages:

1. Goal received / queued
2. Planning
3. Executing
4. Awaiting approval when required
5. Verifying
6. Completed / Failed / Cancelled

Do not present `retrying` as a top-level persisted workflow lifecycle state. Retry is execution metadata attached to a step/operation and represented in the trace.

Possible visual treatment:

```text
✓ Goal received
│
✓ Plan
│
● Execute
│   ├─ ✓ Read project notes
│   ├─ ✓ Draft release notes
│   └─ ● Create follow-up task
│
○ Verify
│
○ Complete
```

This can be a vertical execution timeline rather than a horizontal wizard. Vertical is preferred because individual steps and tool calls need room.

## 9.3 State semantics

Every stage/step needs an explicit textual state:

- queued
- active
- completed
- awaiting approval
- failed
- cancelled
- skipped if legitimately supported

Active operations can use a subtle animation, but respect `prefers-reduced-motion`.

Avoid endless spinner-only states. Display what is happening.

Example:

> Retrieving relevant project context...

rather than:

> Thinking...

---

# 10. Execution nodes

Each meaningful workflow event should be represented by a compact row/card in the execution timeline.

Types may include:

- deterministic application operation
- model call
- retrieval
- tool call
- approval
- validation
- verification
- checkpoint
- recovery
- error

Use clear type labels.

Example:

```text
MODEL CALL                                      1.8s
Generate structured plan
2,842 input · 491 output · $0.006
```

```text
TOOL                                            14ms
read_file_excerpt
64 lines returned
```

```text
DETERMINISTIC                                   3ms
Validate PlanSchema
Passed
```

This distinction is central to the project thesis.

Do not visually label every operation as an "agent action".

Clicking an execution node should select it and update the right-hand inspector to the most relevant detail tab.

---

# 11. Approval UI

Human approval before consequential/write side effects is a showcase capability.

When approval is required, the centre panel should display a prominent but restrained approval card at the exact point in the workflow.

Example:

```text
┌────────────────────────────────────────────────────┐
│ APPROVAL REQUIRED                                  │
│                                                    │
│ Create task                                        │
│                                                    │
│ Title                                              │
│ Resolve unresolved release-note items              │
│                                                    │
│ This operation changes persisted task data.        │
│                                                    │
│ [Reject]                              [Approve]     │
└────────────────────────────────────────────────────┘
```

Requirements:

- describe the actual side effect
- show meaningful arguments
- never hide consequential arguments behind generic copy
- approving must execute exactly the approved operation
- rejecting must produce an explicit workflow event
- double-clicking or repeated approval must not duplicate the side effect
- keyboard accessible
- clear disabled/loading state after click

The trace should record request, decision and execution separately.

---

# 12. Completion UI

When a workflow completes, show a concise result rather than confetti or celebration graphics.

Example:

> **Workflow completed**
>
> Release notes were generated and verified. One follow-up task was created after approval.

Then a small metrics summary:

```text
3 model calls · 4 tool calls · 1 approval · 8,421 tokens · 12.4s · $0.014
```

Actions may include:

- `Inspect trace`
- `View output`
- `Run again` only if safe and properly implemented

Do not implement Run again if it risks duplicated side effects before idempotency semantics are correct.

---

# 13. Failure and recovery UI

Failures are not embarrassing states to hide. They are a central demonstration of the architecture.

Example execution timeline:

```text
● Execute tool: create_task
│
× Attempt 1 - timeout after 5.0s
│
↻ Retry scheduled - 500ms backoff
│
✓ Attempt 2 - completed
```

The centre panel should explain the current consequence:

> Tool execution timed out. Artemis Lite will retry once using the same idempotency key.

Do not expose stack traces as primary user-facing copy. Stack traces can appear in inspector/debug detail.

## 13.1 Interrupted workflow recovery

On application relaunch, if an unfinished persisted workflow is recovered, show a small but clear recovery banner/event:

> **Workflow recovered from checkpoint**
>
> Resuming after `read_project_context`. Previously completed side effects will not be repeated.

Only make the second sentence if the implementation genuinely guarantees it.

The recovery should also appear in the trace.

---

# 14. Right panel - Inspector

The inspector is the second most important surface after the workflow timeline.

Tabs:

1. **Trace**
2. **Context**
3. **State**
4. **Usage**

Optional later:

5. **Failure Lab** in development/demo mode

Do not add more tabs unless justified.

The inspector must display real system data, not duplicated decorative summaries.

---

# 15. Inspector - Trace

Trace is the chronological source of truth for observable execution.

Suggested event structure:

```text
10:42:18.120  workflow.created
10:42:18.136  workflow.planning.started
10:42:18.141  model.request.started
10:42:19.912  model.request.completed
10:42:19.918  plan.validation.passed
10:42:19.924  checkpoint.saved
10:42:19.931  workflow.executing.started
10:42:19.940  tool.started
...
```

Each trace event should expose, where relevant:

- timestamp
- event type
- workflow ID
- step ID
- attempt
- duration
- status
- provider/model
- token counts
- tool name
- error category
- checkpoint ID
- idempotency key

Do not cram all metadata into the collapsed row. Clicking expands/selects detail.

Useful controls:

- filter by event type
- copy selected event JSON
- perhaps search later if genuinely useful

For the prototype, filtering can be very small/simple.

---

# 16. Inspector - Context

This is a flagship feature.

The Context inspector should make visible **what was sent to the model**, at a useful level of abstraction, without exposing hidden chain-of-thought.

Never attempt to display private chain-of-thought/reasoning tokens.

For a selected model call, show context composition such as:

```text
CONTEXT COMPOSITION

System instructions          482 tok
Current goal                 126 tok
Workflow state               318 tok
Recent interaction           601 tok
Long-term memory             284 tok
Retrieved documents        1,204 tok
Tool evidence                463 tok
────────────────────────────────────
Total                      3,478 tok
Budget                     6,000 tok
Remaining                  2,522 tok
```

Add a small proportional bar if useful, but do not turn it into a colourful analytics chart.

Below, allow inspection of safe/appropriate context sections:

- goal
- workflow state summary
- retrieved chunk metadata/excerpts
- tool evidence
- memory items
- system instruction metadata or safe prompt content where appropriate

Sensitive values/secrets must never appear.

If the architecture stores hashes/references rather than full prompts, reflect that truthfully.

## 16.1 Context budget warning

If context approaches budget, show a meaningful warning:

> 86% of context budget used

And expose what contributed to it.

This is much more valuable than a generic token counter.

---

# 17. Inspector - State

State should expose persisted deterministic workflow state.

Present a readable structured view first, with optional raw JSON expansion.

Example:

```text
WORKFLOW STATE

Status             executing
Current step       create_follow_up_task
Checkpoint         cp_004
Plan version       1
Pending approval   true
Attempts           1
Updated            10:42:24.812
```

Then:

**Plan**

1. Read project notes - complete
2. Generate release notes - complete
3. Create follow-up task - awaiting approval
4. Verify outputs - queued

Then optional:

`View raw state`

The purpose is to visibly distinguish durable workflow state from conversational/model context.

---

# 18. Inspector - Usage

Usage is a first-class feature, not later polish.

For the selected workflow show:

```text
USAGE

Model calls                  3
Input tokens             6,842
Output tokens            1,184
Retrieved context        2,041
Tool calls                   4
Deterministic operations    11
Retries                      1
Duration                  8.4s
Estimated cost          $0.014
```

If provider cache/read/write token categories exist and are meaningful, show them in expanded detail rather than cluttering the top summary.

Below, show usage by model call:

```text
#1 Plan       2,842 in   491 out   1.8s   $0.006
#2 Draft      2,104 in   502 out   2.1s   $0.005
#3 Verify     1,896 in   191 out   1.4s   $0.003
```

Every number must come from real telemetry where available.

If estimated cost cannot be calculated reliably for a provider/model, display `Unavailable` rather than inventing a value.

---

# 19. Failure Lab

Failure Lab is a development/demo capability and should not complicate the production architecture.

Expose it behind a developer/demo toggle, environment flag, or clearly marked inspector tab.

Suggested controls:

```text
FAILURE LAB

Mode
(●) Normal

MODEL
[ ] Timeout next request
[ ] Invalid structured output
[ ] Provider unavailable

TOOLS
[ ] Timeout next tool call
[ ] Return malformed result
[ ] Fail next write

APPLICATION
[ ] Interrupt after next checkpoint
[ ] Simulate persistence error
```

Implementation rules:

- failure injection must be deterministic enough for demos/tests
- one-shot failures should clearly reset after firing
- UI must show whether an injection is armed
- injected failures must be distinguishable from real unexpected failures in traces
- never implement dangerous OS-level failure behaviour merely for spectacle
- avoid arbitrary process killing if a safer simulated interruption exercises the same recovery path

A useful trace event might be:

```text
failure_injection.triggered
kind: tool_timeout
source: demo
```

---

# 20. Bottom event strip

Use the bottom strip for the latest meaningful system event, not a constant stream of logs.

Examples:

```text
Checkpoint cp_004 saved                                              10:42:24
```

```text
Workflow recovered from checkpoint cp_004                            10:53:02
```

```text
Retry 2/2 succeeded: create_task                                     10:44:11
```

It can also contain a subtle connection/provider status if genuinely useful.

Do not create a fake terminal.

---

# 21. Loading, empty and error states

Every major surface must have designed states.

## No workflow selected

Centre:

> **Select a workflow**
>
> Inspect its execution, context, state and usage.

## New workflow planning

> **Creating bounded plan**
>
> Validating model output against the workflow schema.

## Tool running

> **Reading project notes**
>
> `read_file_excerpt`

## Provider unavailable

> **Model provider unavailable**
>
> The request failed before a valid response was received.

Then show recovery behaviour, e.g. retry/fallback, only if implemented.

## Failed workflow

> **Workflow failed**
>
> Verification could not confirm the expected output after 2 attempts.

Actions:

- `Inspect failure`
- `Retry step` only if architecture safely supports it

Never use vague "Something went wrong" as the only explanation when structured error information exists.

---

# 22. Interaction model

The UI should feel immediate and deterministic even though LLM operations are asynchronous.

Requirements:

- selection should be instant
- persisted state should render before remote model work
- stream/update observable workflow events as they occur
- never freeze the renderer during model/tool operations
- cancellation, if implemented, should be explicit
- prevent accidental duplicate action submissions
- disable approval buttons after a decision is submitted
- preserve selection where sensible as trace events update

Use SSE/IPC/event transport according to the architecture already selected. Do not change architecture simply to fit a UI library.

---

# 23. Motion

Motion should explain state change, not entertain.

Permitted:

- subtle active-state pulse
- short row insertion/fade
- progress indicator on an active bounded operation
- inspector tab transitions if nearly instantaneous

Avoid:

- large spring animations
- animated backgrounds
- floating particles
- continuously rotating AI glyphs
- typing simulations

Respect `prefers-reduced-motion`.

---

# 24. Accessibility

Artemis Lite should be implemented accessibly from the start.

At minimum:

- semantic HTML in renderer where applicable
- correct buttons, labels and headings
- visible focus states
- full keyboard access for primary workflow
- no colour-only status communication
- sufficient contrast
- accessible modal focus management
- appropriate ARIA only where native semantics are insufficient
- reduced motion support
- meaningful accessible names for icon-only controls
- error/approval state announcements where appropriate
- inspector tabs implemented using correct tab semantics or an equally accessible pattern

Do not treat accessibility as a final audit task.

---

# 25. Electron-specific UI/security constraints

The renderer must not gain broad system access for UI convenience.

Follow existing architecture/ADRs for Electron boundaries.

UI implementation must preserve:

- narrow preload API
- context isolation
- no Node APIs exposed directly to renderer
- validated IPC inputs
- workspace/path containment
- protocol allowlisting for external links
- secrets confined to main process/service boundary
- no arbitrary shell execution

The renderer should request domain operations such as:

```ts
window.artemis.workflows.create(...)
window.artemis.workflows.get(...)
window.artemis.workflows.approve(...)
window.artemis.traces.subscribe(...)
```

not generic dangerous primitives such as:

```ts
window.electron.exec(command)
window.fs.read(path)
window.ipc.sendAnything(channel, payload)
```

Exact APIs must follow the real architecture and should not be invented solely from these examples.

---

# 26. Component architecture recommendation

Adapt names to existing repository conventions.

Possible renderer structure:

```text
src/renderer/
  app/
    AppShell.tsx
  components/
    chrome/
      TopBar.tsx
      BottomEventStrip.tsx
    workflows/
      WorkflowRail.tsx
      WorkflowListItem.tsx
      NewWorkflowDialog.tsx
      WorkflowHeader.tsx
      WorkflowTimeline.tsx
      WorkflowStage.tsx
      ExecutionNode.tsx
      ApprovalCard.tsx
      RecoveryNotice.tsx
      WorkflowResult.tsx
    inspector/
      Inspector.tsx
      TracePanel.tsx
      TraceEventRow.tsx
      ContextPanel.tsx
      ContextComposition.tsx
      StatePanel.tsx
      UsagePanel.tsx
      FailureLab.tsx
    ui/
      Button.tsx
      Dialog.tsx
      Tabs.tsx
      Badge.tsx
      Tooltip.tsx
      CopyButton.tsx
  hooks/
  state/
  styles/
```

Do not create abstractions simply because this document lists them. Consolidate tiny components when that improves readability.

Avoid a generic component framework architecture larger than the actual application.

---

# 27. Data/view-model rules

Do not let React components reconstruct domain truth from loosely related events when the domain layer can provide a stable view model.

Prefer typed domain/view objects.

Example conceptual shapes:

```ts
type WorkflowSummary = {
  id: string;
  title: string;
  status: WorkflowStatus;
  createdAt: string;
  updatedAt: string;
};

type WorkflowMetrics = {
  modelCalls: number;
  inputTokens: number;
  outputTokens: number;
  retrievedTokens: number;
  toolCalls: number;
  deterministicOperations: number;
  retries: number;
  durationMs: number;
  estimatedCostUsd: number | null;
};
```

These are illustrative. Reuse actual domain types where appropriate.

Provider-specific SDK types should not leak through the renderer.

---

# 28. Structured output display

Model outputs shown in the UI should be validated, structured outputs where the architecture expects them.

Example plan display:

```text
PLAN

1  Read project notes
   Tool: read_project_notes

2  Draft release notes
   Reasoning stage

3  Create follow-up task
   Tool: create_task · approval required

4  Verify outputs
   Verification stage
```

If structured validation fails, the UI should show the failure as an event rather than attempting to render malformed content as a valid plan.

---

# 29. No chain-of-thought UI

Do not build a "Reasoning" panel that exposes hidden chain-of-thought.

The UI may display:

- explicit plan
- structured model output
- model call metadata
- context supplied
- tool calls
- validation results
- concise model-generated user-facing explanations
- verification outcomes

It should not display or attempt to solicit private hidden reasoning traces.

If a design label currently says `Reasoning`, use a more accurate label such as `Model call`, `Plan`, `Decision`, `Verification`, or `Output` depending on the actual artifact.

---

# 30. Prototype canonical demo

The UI must be optimised around one canonical end-to-end demo before supporting many workflow types.

A good workflow shape is:

> Read a small set of project notes, prepare a bounded output, identify one unresolved item, request approval to create a follow-up task, then verify the resulting state.

The exact canonical task should be aligned with the technical brief and available tools.

The demo must visibly exercise:

1. goal creation
2. persisted workflow
3. structured planning
4. selective context/retrieval
5. model call
6. deterministic validation
7. read tool
8. write tool requiring approval
9. idempotent side effect
10. verification
11. usage accounting
12. trace inspection
13. context inspection
14. checkpoint persistence
15. at least one failure/retry/recovery scenario

Do not add additional workflows until this one is excellent.

---

# 31. Screenshot-ready states

The application should naturally produce strong case-study screenshots without fake data.

Prepare the UI so the following real states can be captured later.

## Screenshot A - Main running workflow

Show:

- workflow list
- active workflow timeline
- selected model/tool operation
- inspector open
- live usage summary

Purpose: establish Artemis Lite as an inspectable Electron workflow system.

## Screenshot B - Context inspector

Show:

- selected model call
- context composition/token budget
- retrieved sources/evidence

Purpose: demonstrate selective context rather than full-history injection.

## Screenshot C - Human approval

Show:

- write operation awaiting approval
- exact proposed side effect
- trace showing prior stages

Purpose: demonstrate bounded autonomy.

## Screenshot D - Failure and recovery

Show:

- failed first attempt
- retry event
- successful second attempt or checkpoint recovery

Purpose: demonstrate reliability as product behaviour.

## Screenshot E - Usage

Show:

- model calls
- input/output/retrieval tokens
- cost
- duration
- tool calls
- retries

Purpose: demonstrate measurable efficiency.

## Screenshot F - State

Show:

- durable workflow state
- current step
- checkpoint
- plan progress

Purpose: explain state vs context/memory.

Do not hard-code screenshot data. Capture real successful runs once implementation exists.

---

# 32. Visual comparison with Artemis for the case study

Do not force a side-by-side comparison into the Lite desktop application itself.

The case-study page will handle that narrative.

However, the Lite UI should make the architectural contrast obvious when screenshots are placed next to original Artemis:

**Artemis**

- assistant/personality central
- broad workspace
- conversational surface
- many capabilities surrounding the assistant

**Artemis Lite**

- workflow central
- execution visible
- context inspectable
- state explicit
- usage measurable
- failures/recovery observable
- side effects bounded by approval

Do not disparage Artemis in copy. It is the system that exposed the engineering questions Lite explores.

---

# 33. Copy system

Use terse, literal engineering copy.

Prefer:

- `Planning workflow`
- `Validating plan`
- `Reading project notes`
- `Approval required`
- `Retry scheduled`
- `Checkpoint saved`
- `Verifying output`
- `Workflow completed`

Avoid:

- `Artemis is thinking...`
- `Magic is happening...`
- `AI is working its magic`
- `Supercharging your workflow`
- `Intelligent autonomous execution`
- `Unlock the power of AI`

Error copy should state what failed and what happens next.

---

# 34. Testing requirements for UI

At minimum, cover critical behaviours rather than chasing arbitrary component coverage.

Tests should verify where feasible:

- workflow list renders persisted workflows
- selection changes active workflow
- new workflow form validates goal
- workflow stages reflect state correctly
- approval action can only be submitted once from UI
- rejected approval is represented correctly
- trace events render in chronological order
- inspector switches correctly
- usage displays null/unavailable cost safely
- failure/retry state is distinguishable
- recovered workflow state renders correctly
- keyboard focus works in dialog
- reduced motion does not depend on animations for state

Prefer domain/integration tests for important workflow behaviour and focused renderer tests for UI contracts.

Do not snapshot-test the entire interface as the primary testing strategy.

---

# 35. Implementation phases

## UI Phase 0 - Reconnaissance

Before writing UI code:

1. Read all project docs listed at the top of this file.
2. Inspect current repository structure and dependencies.
3. Identify existing renderer framework, styling approach and state management.
4. Identify actual workflow/domain types and IPC/preload interfaces.
5. Do not invent APIs that contradict the architecture.
6. Record any conflicts between this UI brief and current implementation.

If a conflict is architectural, stop and document it before silently working around it.

## UI Phase 1 - Static shell using real domain shapes

Build:

- Electron application shell
- top bar
- workflow rail
- active workflow panel
- inspector shell/tabs
- bottom event strip
- new workflow dialog

Use typed fixtures only if backend/domain functionality is not yet available. Fixtures must live in an obvious dev fixture location and must not masquerade as real telemetry.

Do not polish animations.

## UI Phase 2 - Workflow state integration

Connect:

- persisted workflow list
- selection
- workflow state
- stage timeline
- current operation
- completion/failure states

## UI Phase 3 - Trace and telemetry

Connect real:

- trace events
- model usage
- tool usage
- duration
- retries
- cost where calculable

## UI Phase 4 - Context and state inspection

Implement:

- context composition
- context budget
- retrieved evidence metadata
- durable state view
- raw JSON where useful

## UI Phase 5 - Approval and recovery

Implement and polish:

- approval card
- reject/approve semantics
- duplicate-action prevention
- checkpoint recovery banner/event
- retry display

## UI Phase 6 - Failure Lab

Add only after real failure/recovery paths exist.

Failure Lab must exercise real recovery code paths, not a visual-only simulation.

## UI Phase 7 - Accessibility and screenshot polish

Audit:

- keyboard
- focus
- contrast
- reduced motion
- semantic structure
- empty/loading/error states
- 1180px desktop width
- screenshot-ready canonical workflow

---

# 36. Definition of done

The UI is not done because it looks polished.

It is done when a reviewer can run one workflow and visually understand:

- the goal
- the plan
- current workflow state
- each model call
- each deterministic operation
- each tool call
- context composition
- token budget
- approval boundary
- checkpoint/recovery behaviour
- retry behaviour
- verification
- final outcome
- usage/cost/latency

And when the interface accurately represents the underlying architecture rather than creating a fictional simplified story.

---

# 37. Claude Code implementation rules

These rules are mandatory for work based on this brief.

1. **Read before coding.** Read the architecture, ADRs, observations and technical brief first.
2. **Do not rewrite the architecture from the renderer.** UI adapts to domain boundaries, not vice versa, unless a genuine architectural deficiency is identified and documented.
3. **Use real types and telemetry.** Never hard-code fake production metrics.
4. **Keep the renderer unprivileged.** No broad Node/fs/shell APIs for convenience.
5. **No feature creep.** The primary workflow screen is the product.
6. **No generic chat unless explicitly required later.** Goals and workflows are the primary interaction model.
7. **No multiple-agent theatre.** Show actual model calls and workflow stages.
8. **No chain-of-thought display.** Show structured outputs, evidence, context and observable actions only.
9. **Accessibility is part of implementation.** Do not defer it.
10. **Instrument before decorating.** Trace/context/usage are more important than animation.
11. **Every status must be truthful.** Do not show `Verified`, `Recovered`, `Idempotent`, `Cost`, etc. unless the underlying system supports that claim.
12. **Prefer boring UI code.** Clear React components and typed domain data over clever abstraction.
13. **Do not add dependencies casually.** Explain why a new UI dependency is necessary before adding it.
14. **Preserve testability.** Failure injection, workflow fixtures and UI states should be reproducible.
15. **Document meaningful UI architecture decisions.** Add/update ADRs when a decision affects architecture, security, persistence, or long-term boundaries. Do not create ADRs for trivial styling choices.

---

# 38. First Claude Code prompt

Use this after placing this document in `docs/`:

```text
Read the following documents in full before changing code:

- docs/ARTEMIS-LITE-UI-IMPLEMENTATION-BRIEF.md
- docs/ARTEMIS-LITE-TECHNICAL-BRIEF.md
- docs/ARCHITECTURE.md
- docs/DECISIONS.md
- docs/ARTEMIS-OBSERVATIONS.md
- docs/ARTEMIS-CASE-STUDY-PAGE-BRIEF.md

Then inspect the current repository implementation.

Do not begin by redesigning the architecture or installing UI libraries.

First report:

1. the current Electron/renderer structure,
2. the styling/component approach already present,
3. the actual workflow/domain types available to the UI,
4. the preload/IPC surface relevant to the UI,
5. which parts of the UI brief can be implemented immediately with real data,
6. which parts currently require typed development fixtures,
7. any conflicts between the UI brief and the current architecture,
8. your proposed file/component plan for UI Phase 1,
9. any new dependency you believe is necessary and why.

The central product rule is: the workflow is the protagonist, not the AI persona.

The central engineering rule is: deterministic shell, probabilistic core.

The UI must make workflow state, model calls, tools, context, approvals, recovery and usage inspectable without exposing hidden chain-of-thought.

Wait for approval after the reconnaissance report before implementing UI Phase 1.
```

---

# 39. Prompt for UI Phase 1 after reconnaissance approval

```text
Proceed with UI Phase 1 from docs/ARTEMIS-LITE-UI-IMPLEMENTATION-BRIEF.md.

Build only the smallest high-quality desktop shell required for the eventual canonical workflow:

- top application bar
- workflow rail
- active workflow centre panel
- vertical workflow timeline shell
- inspector with Trace / Context / State / Usage tabs
- bottom event strip
- New Workflow dialog

Use real domain data wherever it already exists. Where functionality does not yet exist, use explicit typed development fixtures rather than inventing backend behaviour.

Do not implement Failure Lab yet.
Do not add chat.
Do not add settings/account/onboarding screens.
Do not add animations beyond minimal state feedback.
Do not add new dependencies without explaining why.
Do not weaken Electron security boundaries to simplify renderer work.

Prioritise hierarchy, density, keyboard behaviour, accessible semantics and a clean component structure.

At the end:

1. run the relevant tests/typecheck/lint/build,
2. report files changed,
3. report any fixture data still in use,
4. report any architectural assumptions,
5. include screenshots if the development environment permits them,
6. stop before UI Phase 2.
```

---

# 40. Final design test

Before considering any UI decision complete, ask:

> Does this make the system easier to inspect, understand, measure or control?

If the answer is no, it probably does not belong in Artemis Lite.

The final application should make a strong engineering statement without needing a paragraph of explanation:

**AI reasoning is only one component of the system. Reliability comes from everything around it.**
