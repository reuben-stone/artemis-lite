# Artemis → Artemis Lite

## Case Study Page: Product, Content, Visual and Claude Code Build Brief

**Document purpose:** This is the canonical brief for building the
public engineering case study that explains the evolution from Artemis
to Artemis Lite.

**Audience:** ActAI interviewers, senior engineers, engineering
managers, technical founders, recruiters, and future collaborators.

**Primary objective:** Demonstrate engineering judgement. The page must
show that Artemis was a genuine attempt to solve a difficult problem,
that real use exposed measurable architectural costs, and that Artemis
Lite is a deliberate redesign around simplicity, reliability, context
efficiency, observability and recoverability.

**Secondary objective:** Demonstrate desktop engineering competence
through Electron without turning the page into an Electron tutorial.

**Critical rule:** Never invent measurements, features, implementation
details, performance claims or failures. Anything not yet verified from
the repositories must remain a labelled placeholder until measured.

------------------------------------------------------------------------

# 1. Core Story

The case study is not:

> I built one AI app and then built a better AI app.

It is:

> I built a multi-agent Electron system for coordinating development
> work across multiple repositories. Using it exposed an important
> problem: agentic systems can become expensive, opaque and over-complex
> surprisingly quickly. Artemis Lite is a deliberate rebuild that asks
> how much of that autonomy is actually necessary.

The central engineering question is:

# How much agentic architecture do you actually need?

The case study should establish four things:

1.  Artemis was ambitious and useful enough to expose real engineering
    problems.
2.  The problems were observed rather than invented for a portfolio
    piece.
3.  Artemis Lite is a hypothesis-driven response to those observations.
4.  The redesign is evaluated with measurements rather than subjective
    claims.

------------------------------------------------------------------------

# 2. Positioning

## Primary positioning statement

**Building reliable AI agents on the desktop**

What I learned building a multi-agent Electron application, and why I
rebuilt its architecture around simplicity, context efficiency and
recoverability.

## Alternative shorter title

**From multi-agent complexity to reliable workflows**

## Supporting line

Artemis began as a multi-agent development system capable of
coordinating work across multiple repositories. Artemis Lite asks a
simpler question: which parts genuinely need an LLM, and which are
better handled by software?

## Tone

The page must feel:

-   technical
-   reflective
-   restrained
-   precise
-   senior
-   curious
-   evidence-led
-   editorial rather than promotional

It must not feel:

-   like a SaaS landing page
-   like a job application microsite
-   like AI hype
-   like a tutorial
-   defensive about Artemis
-   dismissive of multi-agent systems
-   over-designed
-   full of invented benchmark numbers

Avoid language such as:

-   revolutionary
-   cutting-edge
-   game-changing
-   next-generation
-   seamless
-   supercharge
-   unlock
-   harness the power of
-   autonomous AI workforce

------------------------------------------------------------------------

# 3. Intended Reader Journey

The reader should understand the page in three depths.

## 30-second scan

They should leave with:

-   Artemis is an Electron multi-agent development tool.
-   It coordinates work across multiple repositories.
-   Real use revealed excessive token/context usage and complexity.
-   Artemis Lite is a smaller architecture built around selective
    context, explicit state and fewer model calls.
-   Reuben can reason about both Electron architecture and production AI
    systems.

## 3-minute read

They should understand:

-   why Artemis existed
-   the original architectural shape
-   what became problematic
-   the design principles behind Lite
-   how memory, RAG, workflow state, tools and orchestration differ
-   how the new architecture will be measured

## Deep technical read

They should be able to inspect:

-   architecture diagrams
-   execution traces
-   context composition
-   failure/recovery examples
-   token and latency measurements
-   selected code snippets
-   Electron process boundaries
-   technical decisions and trade-offs
-   repository/demo links if public

------------------------------------------------------------------------

# 4. Page Information Architecture

Use this order.

1.  Hero
2.  Context / why Artemis existed
3.  Artemis v1
4.  Original architecture
5.  What real use exposed
6.  Evidence / traces / measurements
7.  Design hypothesis
8.  Artemis Lite
9.  New architecture
10. Key engineering decisions
11. Desktop architecture
12. Memory, RAG and context strategy
13. Reliability and recovery
14. Observability and evaluation
15. Before / after comparison
16. What changed in my thinking
17. Current status / limitations
18. Demo / source / contact
19. Technical appendix

Do not hide the problem until halfway down the page. The reader should
know the reason for the redesign within the first viewport or
immediately after it.

------------------------------------------------------------------------

# 5. Full Page Copy

The following is working copy. Claude may adjust wording for factual
accuracy after inspecting the repositories, but must preserve the
restrained tone.

------------------------------------------------------------------------

## 5.1 Hero

### Eyebrow

`ENGINEERING CASE STUDY · ELECTRON · AGENT SYSTEMS`

### H1

**Building reliable AI agents on the desktop**

### Intro

Artemis began as a multi-agent development system for coordinating work
across multiple repositories. It worked, but using it exposed a
different problem: agentic architecture can become expensive, difficult
to inspect and more complex than the task requires.

Artemis Lite is a smaller rebuild around a simple principle:

**Use model reasoning where judgement is required. Use deterministic
software everywhere else.**

### Metadata row

`Electron`\
`React + TypeScript`\
`Agent orchestration`\
`Memory + retrieval`\
`Workflow persistence`\
`Observability`

Only show technologies verified in the repository.

### Hero visual

A clean side-by-side architecture fragment:

`ARTEMIS / V1` → `ARTEMIS LITE / V2`

Do not use a generic AI illustration.

------------------------------------------------------------------------

## 5.2 Opening Context

### Heading

**The original problem**

### Copy

Development work rarely lives inside one repository. A product can span
an application, backend services, shared packages and supporting
tooling, while a single task may require changes across several of them.

I built Artemis to explore whether specialised agents could coordinate
that work as one system: understand a task, maintain context across
repositories, divide work and move it toward completion.

The goal was not to build a chatbot. It was to experiment with
longer-running software workflows where AI could act on a task rather
than simply discuss it.

### Supporting note

At this point the page may include one short factual line describing the
original motivation for Artemis, but only after verifying it from the
repository/history.

------------------------------------------------------------------------

## 5.3 Artemis v1

### Heading

**Artemis: start with autonomy**

### Copy

The first version leaned into multi-agent orchestration. Different
agents could take responsibility for parts of a task, share context and
operate across repository boundaries.

That made Artemis capable, but it also increased the amount of
information moving through the system. As workflows grew, so did the
number of model interactions, the context carried between them and the
difficulty of understanding why a particular decision had been made.

### Pull quote

> Capability was not the only thing that scaled. Context, cost and
> coordination overhead scaled with it.

### Important wording rule

Do not describe Artemis as a failure. The correct framing is:

-   Artemis proved useful ideas.
-   Artemis exposed the costs of those ideas.
-   Lite exists because V1 generated evidence.

------------------------------------------------------------------------

# 6. Original Architecture Section

## Heading

**V1 architecture**

## Required diagram

Create a real diagram from the repository after inspection.

Until verified, use a conceptual placeholder only:

``` text
User task
   |
Desktop UI
   |
Coordinator / planner
   |
+--+------------------+
|                     |
Agent A             Agent B        ...
|                     |
Tools / repo access / task context
|                     |
+---------- shared workflow --------+
                |
          persistent state
```

### Diagram caption

**Conceptual view only until verified against the Artemis repository.**

When implementing the page, replace this with the actual process/agent
relationships.

## Architecture annotation topics

Use numbered callouts around the diagram to explain:

1.  Electron renderer responsibilities
2.  Electron main-process responsibilities
3.  orchestration boundary
4.  how agents are represented
5.  how repositories are accessed
6.  where task state lives
7.  how context is assembled
8.  where model calls occur
9.  how tool execution occurs
10. how progress returns to the renderer

Only include items that exist.

------------------------------------------------------------------------

# 7. What Real Use Exposed

## Heading

**What became expensive**

### Intro copy

The interesting part of Artemis was not discovering that agents could
coordinate. It was discovering where that coordination became wasteful.

### Issue cards

Use four restrained text blocks, not colourful marketing cards.

#### 01. Context growth

As more agents and steps participated in a task, more previous output
could become candidate context for later decisions.

**Question raised:** What does the model actually need to know at this
step?

#### 02. Token consumption

Large prompts and repeated context can make a capable workflow
disproportionately expensive.

**Question raised:** Can the same outcome be achieved with fewer model
calls and smaller contexts?

#### 03. Coordination overhead

Additional agents create additional hand-offs, decisions and failure
points.

**Question raised:** Does this responsibility need another agent, or can
deterministic orchestration handle it?

#### 04. Observability

When behaviour emerges across several model calls, understanding why a
workflow succeeded or failed becomes harder.

**Question raised:** Can every important step be represented as explicit
state and an inspectable trace?

### Optional fifth issue

#### 05. Recovery

If the current Artemis implementation does not resume safely after
interruption, document this after verification.

**Question raised:** Can a workflow restart from a durable checkpoint
instead of replaying the entire task?

------------------------------------------------------------------------

# 8. Evidence Section

## Heading

**Measure before redesigning**

### Copy

Before treating any of these observations as architectural conclusions,
Artemis and Artemis Lite should be instrumented against the same
representative workflows.

The comparison should focus on task completion, not simply token
reduction. A cheaper system that completes fewer tasks is not an
improvement.

## Required metrics

Capture where technically possible:

-   total model calls
-   input tokens
-   output tokens
-   cached tokens if exposed by provider
-   estimated model cost
-   total workflow duration
-   time to first visible progress
-   number of tool calls
-   number of retries
-   number of agent hand-offs
-   peak context size
-   workflow completion status
-   human intervention required
-   failure category
-   recovery outcome

## Benchmark presentation

Do not publish placeholder numbers.

Final format:

  Metric                     Artemis   Artemis Lite     Change
  ----------------------- ---------- -------------- ----------
  Model calls               measured       measured   measured
  Input tokens              measured       measured   measured
  Output tokens             measured       measured   measured
  Duration                  measured       measured   measured
  Tool calls                measured       measured   measured
  Retries                   measured       measured   measured
  Successful completion     measured       measured   measured

Under the table:

> Same task, same acceptance criteria, same model class where practical.
> Results are local development measurements, not a production
> benchmark.

If conditions differ, state exactly how.

------------------------------------------------------------------------

# 9. The Hypothesis

## Heading

**The rebuild starts with a constraint**

### Large statement

**The LLM should not be the application runtime.**

### Copy

Artemis Lite treats model reasoning as one capability inside a
conventional software system.

Workflow state is explicit. Tools have typed contracts. Side effects are
controlled. Context is assembled for the current decision rather than
inherited indefinitely. Model calls are used when interpretation,
planning or evaluation genuinely benefits from them.

Everything else should be ordinary software.

### Principles

1.  Prefer one capable agent before adding another.
2.  Prefer deterministic routing before model-driven routing.
3.  Retrieve context just in time.
4.  Separate memory from workflow state.
5.  Persist before consequential side effects.
6.  Make tool calls idempotent where possible.
7.  Make failure visible.
8.  Make recovery a first-class path.
9.  Measure tokens, latency and success together.
10. Require human approval for consequential actions.

------------------------------------------------------------------------

# 10. Artemis Lite Section

## Heading

**Artemis Lite: start with control**

### Copy

Artemis Lite is intentionally smaller. The objective is not to reproduce
every Artemis feature. It is to build the minimum architecture needed to
demonstrate reliable, inspectable, persistent agent workflows inside an
Electron application.

The system should be easy enough to explain on a whiteboard and complete
enough to survive real failure.

### Status label

Use one of:

-   `Prototype`
-   `Working prototype`
-   `Evaluation build`

Never call it production-ready unless that is demonstrably true.

------------------------------------------------------------------------

# 11. Lite Architecture Diagram

Create a polished diagram based on this conceptual structure:

``` text
┌──────────────────────────────────────────────────────┐
│ Electron Desktop App                                 │
│                                                      │
│  React Renderer                                      │
│  Task UI · Trace UI · Approval UI · Metrics          │
│            │                                         │
│       typed IPC boundary                             │
│            │                                         │
│  Electron Main                                       │
│            │                                         │
│      Workflow Orchestrator                           │
│       │       │        │                             │
│       │       │        └── Checkpoint / Recovery     │
│       │       └────────── Context Builder            │
│       └────────────────── Tool Registry              │
│                       │                              │
│             ┌─────────┼─────────┐                    │
│             │         │         │                    │
│          Memory     RAG      Local tools             │
│             │         │         │                    │
│             └──── Model Provider ─┘                  │
│                                                      │
│      SQLite/Postgres + vector retrieval              │
└──────────────────────────────────────────────────────┘
```

The exact persistence choice must match the technical implementation.

### Visual treatment

-   thin 1px borders
-   monochrome
-   no gradients
-   no glowing AI nodes
-   use accent colour only for the path currently being discussed
-   labels in small monospace
-   allow horizontal scrolling on mobile rather than shrinking to
    illegibility

------------------------------------------------------------------------

# 12. Key Engineering Decisions

This should be the densest section.

## Decision 1: deterministic orchestration first

### Copy

A workflow engine should know what state a task is in without asking a
language model.

The orchestrator owns transitions such as:

`queued → planning → executing → awaiting_approval → verifying → completed`

and failure states such as:

`executing → failed → retrying → executing`

The model may propose a plan or choose among permitted tools, but it
should not be responsible for preserving the integrity of the workflow
state machine.

### Screenshot

Show the state transition trace in the developer panel.

------------------------------------------------------------------------

## Decision 2: state is not memory

### Copy

Artemis Lite separates information by responsibility.

**Workflow state** answers: what has happened in this task and what must
happen next?

**Working context** answers: what information does the model need for
this decision?

**Conversation history** answers: what has the user recently said?

**Long-term memory** answers: what durable information is useful across
future tasks?

**Retrieved knowledge** answers: what external/project information is
relevant right now?

These categories should not be collapsed into one ever-growing prompt.

### Visual

Five labelled boxes feeding a `Context Builder`, with only selected
fragments continuing to the model.

------------------------------------------------------------------------

## Decision 3: retrieval is selective

### Copy

Retrieval should reduce context, not become another way to fill it.

Use metadata filters and semantic search to retrieve a small number of
relevant chunks. Record which chunks were used. Keep source references
so a decision can be inspected later.

Where direct identifiers are available, prefer loading exact information
just in time over embedding everything.

------------------------------------------------------------------------

## Decision 4: tools are contracts

### Copy

A tool is a boundary between nondeterministic model behaviour and
deterministic application behaviour.

Each tool should define:

-   stable name
-   purpose
-   typed input schema
-   typed output schema
-   permission level
-   timeout
-   retry policy
-   side-effect classification
-   idempotency strategy
-   concise result shape

Tool results should return enough context to make the next decision, not
dump entire files or API responses into the model context.

------------------------------------------------------------------------

## Decision 5: side effects require control

Actions such as modifying files, deleting data, sending messages or
changing external state should be represented separately from read-only
operations.

For the prototype, destructive or externally consequential actions
should require explicit user approval.

------------------------------------------------------------------------

## Decision 6: provider abstraction

The orchestration layer should not depend directly on one provider SDK.

Conceptually:

``` ts
interface ModelProvider {
  generateStructured<T>(request: ModelRequest<T>): Promise<ModelResult<T>>
  stream(request: StreamRequest): AsyncIterable<ModelEvent>
  embed?(input: string[]): Promise<number[][]>
}
```

Adapters may implement Anthropic and/or OpenAI.

Do not over-generalise the abstraction before two providers are actually
needed.

------------------------------------------------------------------------

# 13. Electron / Desktop Engineering Section

## Heading

**Why desktop changes the architecture**

### Copy

Artemis is not simply a web UI packaged in Electron. A development agent
needs controlled access to capabilities that a normal browser
application does not have: local repositories, files, processes and
potentially credentials.

That makes the Electron boundary part of the security model.

### Required topics

Explain and demonstrate:

-   renderer is treated as untrusted relative to privileged APIs
-   `contextIsolation: true`
-   renderer has no direct Node access
-   narrow preload bridge
-   typed IPC channels
-   IPC sender validation where relevant
-   input validation at IPC boundary
-   allowlisted filesystem/repository operations
-   no arbitrary shell execution from renderer
-   Content Security Policy
-   safe external URL handling
-   secrets kept out of renderer state
-   clear cancellation when the desktop app closes or a workflow is
    stopped

### Example bridge

``` ts
window.artemis.tasks.start(input)
window.artemis.tasks.cancel(taskId)
window.artemis.tasks.subscribe(taskId, callback)
window.artemis.approvals.resolve(approvalId, decision)
```

Do not expose raw `ipcRenderer`.

### Screenshot recommendation

A three-column visual:

`Renderer` \| `Preload / IPC` \| `Main / Agent Runtime`

Use a single highlighted request to show how a user action crosses the
security boundary.

------------------------------------------------------------------------

# 14. Reliability and Recovery

## Heading

**Failure is part of the workflow**

### Copy

A long-running AI workflow should assume that models, tools, networks
and processes will fail.

The prototype should make failure deliberately testable rather than
treating it as an exceptional demo-breaking condition.

### Failure lab

Include development toggles for:

-   model timeout
-   malformed structured response
-   tool timeout
-   tool error
-   transient database error
-   duplicate tool execution
-   provider unavailable
-   workflow interruption
-   retrieval returns no useful context
-   invalid plan
-   user rejects approval

### Expected behaviours

For each failure define:

-   retryable?
-   maximum retries
-   backoff
-   fallback
-   checkpoint
-   user-visible message
-   trace event
-   terminal vs recoverable status

### Screenshot

Show one intentionally failed execution:

``` text
09:41:03  tool.createTask        started
09:41:05  tool.createTask        timeout
09:41:05  workflow.retry         scheduled 1/2
09:41:06  tool.createTask        started
09:41:06  tool.createTask        completed
09:41:06  workflow.checkpoint    saved
```

This is much more valuable than a screenshot where everything succeeds.

------------------------------------------------------------------------

# 15. Observability Section

## Heading

**Make the invisible visible**

### Copy

The developer view should answer four questions without reading logs:

1.  What is the workflow doing?
2.  Why did it do it?
3.  How much did it cost?
4.  Can it recover?

### Trace UI

Each event should capture, where available:

-   timestamp
-   workflow ID
-   step ID
-   event type
-   model/provider
-   input token count
-   output token count
-   latency
-   tool
-   retry number
-   status
-   compact error code
-   retrieved memory/document IDs
-   checkpoint ID

Do not store raw chain-of-thought. Store observable inputs, outputs,
structured decisions and tool traces.

### Metrics card

Show:

-   total duration
-   LLM calls
-   input tokens
-   output tokens
-   tool calls
-   retries
-   retrieved chunks
-   approximate cost
-   completion status

------------------------------------------------------------------------

# 16. Evaluation Section

## Heading

**Cheaper is only better if it still works**

### Copy

Token reduction is not the objective by itself. Artemis Lite should be
evaluated against a small suite of representative tasks with explicit
acceptance criteria.

### Evaluation dimensions

-   task success
-   correct tool selection
-   correct tool arguments
-   no duplicate side effects
-   recovery from injected failures
-   relevant retrieval
-   unnecessary model calls
-   total token use
-   latency
-   user approval behaviour

### Initial eval suite

Create 10--20 deterministic scenarios.

Examples:

1.  simple task completed with one tool
2.  task requiring retrieval before execution
3.  task requiring two sequential tools
4.  task requiring user approval
5.  first tool times out once then succeeds
6.  model returns invalid structured output
7.  no relevant memory exists
8.  duplicate retry must not duplicate side effect
9.  workflow is stopped and resumed
10. ambiguous request must ask user rather than guess

Each eval should have machine-checkable assertions where possible.

------------------------------------------------------------------------

# 17. Before / After Section

## Heading

**What changed**

Final table should only include verified statements.

Suggested structure:

  Artemis                          Artemis Lite
  -------------------------------- ---------------------------------
  Multi-agent by default           Minimum agents required
  Broad/shared context             Step-specific context
  Context accumulates              Context is assembled
  Agent-led coordination           Explicit workflow orchestration
  State mixed with agent context   Durable workflow state
  Difficult to attribute cost      Per-step token/cost trace
  Coarse failure path              Retry/checkpoint/resume
  Capability-first                 Reliability-first

Delete any row that is not true.

------------------------------------------------------------------------

# 18. Reflection Copy

## Heading

**What changed in my thinking**

### Copy

Building Artemis made me more interested in the engineering around
models than the model call itself.

The difficult questions are not usually how to send a prompt. They are
where state belongs, what context is necessary, which actions can be
trusted to a model, how side effects are controlled, what happens
halfway through a failed workflow, and how you know whether an
architectural change actually improved the system.

Artemis Lite is deliberately less ambitious in surface area. That is the
point.

The goal is a system whose behaviour is easier to reason about, measure
and recover.

### Optional final line

**The most useful agent architecture may be the one that knows when not
to use an agent.**

Use this only once. Do not over-emphasise it.

------------------------------------------------------------------------

# 19. Current Limitations

Include this section. It increases credibility.

Potential items, only if true:

-   prototype uses local/mock tools rather than production integrations
-   evaluation suite is intentionally small
-   cost estimates use provider-reported token counts and current
    pricing
-   vector retrieval is local and not tuned for large-scale corpora
-   workflow execution is local rather than distributed
-   no Kubernetes deployment
-   no multi-user auth
-   no claim of production scale

Heading:

**What this prototype does not prove**

Copy:

This is an engineering prototype, not a production claim. It is designed
to make architectural decisions inspectable and testable. Scaling the
same design across many users, untrusted third-party integrations and
distributed workers would introduce additional concerns around tenancy,
queues, credentials, rate limiting, distributed locks and operational
monitoring.

------------------------------------------------------------------------

# 20. CTA / Footer

Avoid a commercial CTA.

Use:

**Want the deeper version?**

I can walk through the architecture, failure model and the decisions
behind the rebuild.

Buttons:

-   `View source` if public
-   `Open demo` if stable
-   `Architecture notes`
-   `reubenstone.co.uk`

If the repository cannot be public, use `Architecture notes` only.

------------------------------------------------------------------------

# 21. Visual Design System

## Overall direction

Editorial engineering journal.

References in spirit:

-   technical research notes
-   well-typeset architecture documentation
-   understated developer tooling
-   printed systems diagrams

Do not imitate any named site directly.

## Colour

Use a warm neutral base.

Suggested tokens:

``` css
--bg: #f4f1ea;
--surface: #ebe7de;
--surface-strong: #dfdad0;
--ink: #171918;
--muted: #686b66;
--line: #c9c5bc;
--accent: #44584c;
--code-bg: #202321;
--code-ink: #e9e7df;
```

Claude may adjust for WCAG contrast.

Avoid bright purple/blue AI gradients.

## Typography

Preferred pairing:

-   editorial serif for large titles: `Source Serif 4`, `Newsreader`, or
    system serif fallback
-   neutral sans for body/UI: `Inter`, `Geist`, or system sans
-   monospace: `IBM Plex Mono`, `Geist Mono`, or system monospace

Do not ship unnecessary webfont weight.

Suggested scale:

``` css
--text-xs: 0.75rem;
--text-sm: 0.875rem;
--text-base: 1rem;
--text-lg: clamp(1.1rem, 1.4vw, 1.25rem);
--title-md: clamp(2rem, 5vw, 4rem);
--title-xl: clamp(3rem, 8vw, 7.5rem);
```

Body max width: `68ch`.

## Grid

Desktop:

-   max page width 1440px
-   content gutter 32--56px
-   12-column grid
-   reading column approximately 7 columns
-   diagrams may break into 10--12 columns
-   generous vertical rhythm: 96--160px between major sections

Mobile:

-   20px gutter
-   no forced multi-column reading
-   diagrams horizontally scroll if necessary
-   comparison table can become stacked rows

## Borders

1px solid lines. Avoid rounded-card-heavy UI.

Border radius:

-   0--4px for editorial blocks
-   6px max for screenshots
-   do not use 16--24px SaaS cards

## Motion

Minimal.

Allowed:

-   subtle opacity/translate entrance once
-   trace rows appearing sequentially
-   architecture path highlight on hover
-   no parallax
-   no cursor gimmicks
-   respect `prefers-reduced-motion`

------------------------------------------------------------------------

# 22. Screenshot Plan

Screenshots are evidence, not decoration.

## Screenshot 1: Artemis overview

Show the actual Electron window.

Must demonstrate:

-   desktop nature
-   real task/repository UI
-   enough data to feel genuine
-   no secrets, client data, tokens or personal paths

Crop: - 16:10 or 3:2 - include native window frame only if visually
useful - use 2x capture where possible

Caption:

**Artemis v1 running a multi-repository task.**

## Screenshot 2: Multi-agent / task view

Show agents/tasks/repositories if the UI exposes them.

Caption should explain exactly what the reader is seeing.

## Screenshot 3: Token/problem evidence

Ideal: - provider usage - trace showing repeated model calls - context
size - logs/metrics

If Artemis currently lacks metrics, instrument it rather than fabricate
a screenshot.

## Screenshot 4: Artemis Lite workflow

Show a task in progress with streaming status.

## Screenshot 5: Trace panel

This is the most important Lite screenshot.

Show: - model calls - tool calls - timings - tokens - retries -
checkpoints

## Screenshot 6: Failure and recovery

Inject a tool timeout and capture the recovery.

## Screenshot 7: Approval

Show a consequential action paused for approval.

## Screenshot 8: Context inspector

Optional but strong.

Show:

`Goal`\
`Workflow state`\
`Retrieved memories`\
`Retrieved docs`\
`Tool result`\
`Estimated context tokens`

This makes context engineering visible.

------------------------------------------------------------------------

# 23. Screenshot Styling Rules

-   no fake browser chrome around Electron screenshots
-   no perspective transforms
-   no giant shadows
-   no floating device mockups
-   use a thin border against the page background
-   captions below, left aligned
-   annotate sparingly with numbered markers
-   blur/redact secrets rather than crop so tightly that context
    disappears
-   maintain a consistent capture size
-   use actual app states, not Figma replicas
-   include failure states, not just polished success states

------------------------------------------------------------------------

# 24. Diagram Recommendations

Build diagrams as semantic HTML/SVG, not raster images, where practical.

Required diagrams:

1.  Artemis architecture
2.  Artemis Lite architecture
3.  Electron security/process boundary
4.  Context builder
5.  Workflow state machine
6.  failure/recovery sequence
7.  optional request lifecycle

Diagrams should be accessible: - text remains real text - SVG has
title/description - colour is not the only signal - mobile fallback is
readable

------------------------------------------------------------------------

# 25. Implementation Recommendation

Preferred case-study stack:

-   Next.js or Vite/React, whichever integrates best with Reuben's
    portfolio
-   TypeScript
-   CSS modules/Tailwind/plain CSS based on existing portfolio
    conventions
-   no component library unless already present
-   static content first
-   diagrams as SVG/React components
-   screenshots in local assets
-   Lighthouse/accessibility pass before publishing

This page does not need a CMS.

------------------------------------------------------------------------

# 26. SEO / Metadata

Title:

`Artemis to Artemis Lite - Engineering reliable AI agent workflows | Reuben Stone`

Description:

`An engineering case study on rebuilding a multi-agent Electron system around selective context, explicit workflow state, failure recovery and measurable AI workflows.`

Open Graph: - custom 1200×630 architecture image - no portrait
required - title + simplified V1 → V2 diagram

------------------------------------------------------------------------

# 27. Accessibility Requirements

-   semantic heading order
-   keyboard-accessible controls
-   visible focus
-   contrast meeting WCAG AA
-   no meaning conveyed only by colour
-   code blocks scroll on mobile
-   diagrams have text alternatives
-   screenshots have useful alt text
-   reduced motion support
-   no autoplay video
-   44px minimum interactive targets where applicable

------------------------------------------------------------------------

# 28. What Claude Code Must Verify Before Writing Final Copy

Claude Code must inspect the Artemis repository and replace assumptions
with facts.

Create a verification note containing:

``` md
## Verified from Artemis
- Electron version / build stack:
- renderer framework:
- main process structure:
- preload structure:
- IPC channels:
- agent model:
- task model:
- repository model:
- persistence:
- LLM provider(s):
- orchestration:
- tool execution:
- context strategy:
- token instrumentation:
- retry behaviour:
- recovery behaviour:
- tests:
- packaging:
```

Anything not verified remains omitted or labelled conceptual.

------------------------------------------------------------------------

# 29. CLAUDE CODE INSTRUCTIONS - CASE STUDY

Place the following in the case-study repository as project guidance or
provide it to Claude Code before implementation.

## Mission

You are building a technical engineering case study, not a marketing
landing page.

The page documents the evolution from Artemis, an existing Electron
multi-agent development system, to Artemis Lite, a deliberately smaller
architecture focused on reliability, context efficiency, observability
and recovery.

Your job is to make the implementation technically credible, visually
restrained and factually accurate.

## Source-of-truth order

When information conflicts, use:

1.  current Artemis repository implementation for claims about Artemis
2.  current Artemis Lite repository implementation for claims about Lite
3.  measured benchmark/evaluation output
4.  this brief for intended narrative and design
5.  old notes only as historical context

Never change code or copy merely to make the story cleaner.

## Non-negotiable rules

-   Never invent benchmark numbers.
-   Never claim a feature exists without locating its implementation.
-   Never claim production readiness.
-   Never describe Artemis as a failure.
-   Never add generic AI marketing language.
-   Never add decorative gradients, glowing nodes or stock AI imagery.
-   Never use em dashes in public copy. Use normal punctuation or
    hyphens.
-   Keep screenshots factual and captioned.
-   Prefer real diagrams generated from verified architecture.
-   Keep page performance high.
-   Build accessibly.
-   Do not expose API keys, local usernames, private repository names,
    client data or filesystem paths in screenshots or code.
-   Do not rewrite Artemis or Artemis Lite while building the case study
    unless explicitly asked.

## First task - repository reconnaissance

Before writing components:

1.  Inspect the entire project structure.
2.  Locate any existing design system.
3.  Inspect Artemis architecture if the repo is available.
4.  Inspect Artemis Lite architecture if available.
5.  Create `docs/CASE-STUDY-FACTS.md`.
6.  Record only verified facts.
7.  Create `docs/CASE-STUDY-GAPS.md` listing claims in this brief that
    cannot yet be supported.
8.  Present the findings before making large architectural changes.

## Build order

1.  semantic page skeleton
2.  typography/grid/tokens
3.  hero and narrative sections
4.  verified architecture diagrams
5.  screenshot slots
6.  metrics/evaluation components
7.  responsive behaviour
8.  accessibility
9.  performance
10. final factual audit

## Content components

Prefer reusable components such as:

``` text
CaseStudySection
Eyebrow
PullQuote
ArchitectureDiagram
DecisionBlock
MetricTable
TraceExample
ScreenshotFigure
Callout
CodeExcerpt
ComparisonTable
StatusBadge
```

Do not turn every paragraph into a card.

## Final QA

Before calling the page complete:

-   run typecheck
-   run lint
-   run tests
-   run production build
-   test at 1440px, 1024px, 768px, 390px
-   keyboard navigate entire page
-   test reduced motion
-   verify heading hierarchy
-   verify screenshot alt text
-   verify all external links
-   search copy for unsupported claims
-   search copy for placeholder metrics
-   search for secrets/local paths
-   confirm no horizontal page overflow
-   capture final screenshots

------------------------------------------------------------------------

# 30. Suggested Claude Code Kickoff Prompt

``` text
Read CASE-STUDY-BRIEF.md in full before changing code.

First perform repository reconnaissance. Do not start by redesigning or scaffolding blindly.

I want you to:
1. inspect the existing project structure and current styling conventions;
2. inspect any Artemis/Artemis Lite source available to you;
3. create docs/CASE-STUDY-FACTS.md containing only facts you can verify from code;
4. create docs/CASE-STUDY-GAPS.md containing every important case-study claim that is not yet evidenced;
5. propose the smallest implementation plan for the case-study page;
6. identify any copy in CASE-STUDY-BRIEF.md that must remain provisional;
7. stop and show me the plan before implementing the page.

Do not invent metrics or architecture.
Do not use generic AI visuals.
Do not add features to Artemis or Artemis Lite.
Do not optimise for visual spectacle. Optimise for clarity, credibility and engineering depth.
```

------------------------------------------------------------------------

# 31. Interview Use

The page should support, not replace, conversation.

Recommended live flow:

1.  explain Artemis in 30 seconds
2.  show V1 architecture
3.  show one real pain point
4.  explain the redesign principle
5.  show Lite architecture
6.  run one normal workflow
7.  inject one failure
8.  show recovery and trace
9.  discuss metrics
10. stop and let the interviewer choose the next depth

Do not perform a 15-minute unsolicited product demo.

------------------------------------------------------------------------

# 32. Final Publishing Gate

Do not publish until:

-   Artemis facts are verified
-   Lite prototype actually runs
-   at least one failure/recovery path works
-   metrics are real
-   screenshots are captured from real builds
-   sensitive information is removed
-   copy distinguishes observation from hypothesis
-   benchmark methodology is stated
-   page works without JavaScript for core reading content where
    practical
-   accessibility and responsive checks pass

------------------------------------------------------------------------

# 33. Reference Principles Used for This Brief

The technical direction deliberately follows current industry guidance:

-   Anthropic recommends starting with the simplest solution and
    increasing agentic complexity only when it provides value.
-   Anthropic distinguishes code-orchestrated workflows from agents that
    dynamically direct their own tool use.
-   Anthropic's context-engineering guidance emphasises selective and
    just-in-time context rather than indiscriminately loading
    everything.
-   Anthropic's tool guidance emphasises clear tool boundaries, useful
    tool results and token-efficient tool responses.
-   Electron recommends context isolation, renderer sandboxing, narrow
    IPC surfaces, sender validation and avoiding direct exposure of
    privileged APIs.
-   Modern agent platforms emphasise tracing, guardrails and observable
    execution.

Official references: -
https://www.anthropic.com/engineering/building-effective-agents -
https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents -
https://www.anthropic.com/engineering/writing-tools-for-agents -
https://www.electronjs.org/docs/latest/tutorial/security -
https://www.electronjs.org/docs/latest/tutorial/context-isolation -
https://www.electronjs.org/docs/latest/tutorial/ipc -
https://openai.com/index/new-tools-for-building-agents/
