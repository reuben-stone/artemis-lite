# Artemis Case Study Copy Update
## Protected opening, operator boundary clarification

### Critical instruction

**Do not change the Hero or Artemis v1 sections.**

The first two sections already explain the original product intention clearly and are considered protected copy. They establish Artemis as a desktop AI operations layer above an ecosystem of repositories, with portfolio awareness, monitoring, persistent memory, cross-repository review and delegated worker agents.

Do not retroactively rewrite the opening to explain lessons that were only discovered later.

The new operator/specialist distinction should emerge naturally from the engineering story from Problem/Hypothesis onward.

The narrative should remain:

**I had an idea → built Artemis → it genuinely worked → using it exposed deeper systems problems → formed a hypothesis → built Lite → dogfooded it against real production work → discovered another architectural boundary → changed the implementation boundary without changing the original product ambition.**

---

## 1. Hero

**PROTECTED. NO COPY CHANGES.**

Keep the current hero exactly as it is, including:

> **I built an AI system to tend my repositories. Then I rebuilt it.**

Do not add JARVIS language, coding-agent disclaimers, execution-engine language or retrospective architecture lessons here.

The opening should describe what was built, not pre-emptively defend what it is not.

---

## 2. Artemis v1

**PROTECTED. NO COPY CHANGES.**

Keep the current Artemis v1 section exactly as it is.

In particular, preserve the existing explanation that Artemis:

- sits above an ecosystem of repositories rather than inside one project
- maintains multiple projects
- produces cross-repository morning reviews
- combines git activity with live analytics
- has persistent conversation and memory
- gives the model application-owned tools
- dispatches worker agents into isolated worktrees
- returns gated pull requests for review

This already communicates the original operator intention.

Do not add a sentence such as "Artemis was never intended to be another coding agent" here. That distinction only becomes relevant later, when the Lite investigation experiment exposes where the implementation boundary should sit.

---

## 3. Problem

Keep the existing Problem section substantially unchanged.

Its purpose is to explain what using Artemis exposed: context growth, loosely structured tool execution, implicit workflow state, recovery, observability, token consumption and the difficulty of reasoning about long-running agentic work.

If a small transition is needed, it can introduce the responsibility question without mentioning Claude Code yet:

> As those capabilities accumulated, the harder question became less about what the model could do and more about what the surrounding application should be responsible for.

Do not over-explain. The original product intention is already established.

---

## 4. Hypothesis

Keep the preferred heading:

> **Give the model less responsibility, without making Artemis less useful.**

Keep the core principle:

> **Deterministic shell. Probabilistic core.**

The clarification here should be about responsibility boundaries, not about coding agents specifically.

Suggested supporting copy:

> The goal was not to remove model reasoning. It was to move responsibilities such as workflow state, persistence, permissions, recovery, idempotency, budgets and approvals into application code that could make them explicit and inspectable.
>
> The model could still reason. It just would not also be responsible for remembering what happened, deciding whether a side effect had already occurred, or reconstructing workflow state after a restart.

Keep this grounded in what Lite was actually designed to investigate.

---

## 5. Direction / persistent operations

Keep the existing overnight question:

> **Can I trust this system to notice a production problem while I'm asleep, investigate it, prepare and verify a fix, and leave the consequential decision waiting for me in the morning?**

This remains one of the clearest statements of the product direction.

The existing Morning Review / Target Experience material should remain until the real end-to-end workflow exists.

A useful transition remains:

> A system working unattended across several repositories cannot rely on an ever-growing prompt and a loose collection of tools. It has to know what it was doing before a restart, control what information reaches the model, recover safely from failures and keep a record of what actually happened.
>
> Those requirements became the architecture of Artemis Lite.

Do not insert a large "Artemis is an operator" explanation here unless the page genuinely needs it. The product has already been established by the first two sections.

---

## 6. Architecture

Keep the architecture focused on the responsibilities Lite makes explicit:

```text
Electron Client
      |
      v
Workflow / Control Layer
      |
      +-- durable state
      +-- context
      +-- permissions
      +-- recovery
      +-- approvals
      |
      v
Capabilities / reasoning
      |
      v
Verification
      |
      v
Result
      |
      v
Human Review
```

As specialist execution becomes real, it can appear as one capability alongside deterministic tools and direct model reasoning.

Do not redesign the whole diagram around Claude Code before the execution-adapter vertical slice is working.

The important architectural idea remains that the application owns the durable lifecycle.

---

## 7. Workflow

Keep the existing workflow explanation.

A useful addition once delegated execution is implemented:

> A workflow is not the same thing as a model session. Artemis owns the durable lifecycle while individual stages can be deterministic, model-assisted or delegated to a specialised capability.

This is a precise way to explain the operator architecture without turning the section into a manifesto.

Once the adapter is real, a workflow may continue after a specialist process exits: verification, Result construction, approval and PR publication remain application-owned.

---

## 8. Context

Keep the heading:

> **What did the model actually see?**

Do not make this section primarily about reducing tokens.

The useful framing is:

> Context became an architectural problem because long-running work needs the right evidence at the right stage, not simply a larger prompt.

Keep the distinction between:

**Initial context** - workflow goal, project, state, triggering evidence and available capabilities.

**Acquired context** - evidence discovered as understanding changes.

**Verification context** - evidence required to decide whether the conclusion is actually supported.

Keep the key line:

> **Context isn't only what the model receives at the start. It is also the evidence the system allows it to acquire as its understanding of the problem changes.**

### Real Lumi dogfooding story

This is where the new architectural lesson belongs.

Suggested copy:

> Dogfooding the context architecture against a real Lumi production issue exposed the difference between making an investigation observable and making it effective.
>
> The first workflow relied on broad repository searches. Generic searches reached bounded result limits before useful implementation evidence was found, so I added scoped search and progressive discovery rather than simply increasing the global search window.
>
> That exposed a second problem. The investigation plan was generated upfront, but repository investigation is adaptive: discovering one subsystem changes what should be inspected next.
>
> I introduced a bounded investigation loop. Artemis retained control of iteration limits, budgets, persistence, recovery, read-only capabilities and tracing, while the model could choose the next evidence-gathering action.
>
> Mechanically, the architecture worked. The real investigation still reached its iteration limit without establishing the root cause.

Then introduce the architectural boundary:

> That was useful evidence in itself. I had made repository investigation more bounded and observable, but I was also beginning to recreate the execution harness of a specialised coding agent using repeated constrained model calls.
>
> The original Artemis idea had always been to coordinate agents and tools across a software ecosystem, not to replace every specialist capability itself. The experiment made that boundary concrete.

Recommended pull quote:

> **Artemis did not need to become the coding agent. It needed to know when to use one.**

Then:

> For substantial repository engineering, the next iteration delegates the specialist work to an execution engine such as Claude Code. Artemis still owns why the work exists, which product and repository it belongs to, the durable workflow around it, its execution boundaries, the evidence returned, verification, recovery and the human decision that follows.

This should be the primary clarification. Do not repeat the same point throughout the rest of the page.

### Progressive-discovery evidence

Retain the concrete regression evidence:

- fixture contained 226 files
- global search bound remained 200 files
- broad discovery did not find the target
- scoped discovery did
- the limit was not increased

This remains valuable because it shows how a real failure changed the implementation before the later system-boundary finding.

Do not imply progressive discovery solved the real production issue. It improved evidence acquisition but the later bounded investigation still remained inconclusive.

---

## 9. Reliability

Keep:

> **The interesting test is what happens halfway through.**

Preserve the existing reliability copy around SQLite recovery, completed steps, approval restoration and uncertain side effects.

Keep:

> I am not claiming generic exactly-once execution here. Reconciliation has to be designed for the individual capability. The important part is that Artemis treats an uncertain outcome as uncertain instead of hiding it behind another retry.

Once delegated execution is implemented, a concise addition can be:

> A specialist execution process can be temporary. The workflow around it cannot be. Artemis records why it started, what environment it operated against, what state was observed afterwards and whether execution completed cleanly before deciding what happens next.

Do not claim stronger crash recovery for the execution adapter until tested.

---

## 10. Result

Keep the existing principle:

> **Result is the product. Execution is the evidence.**

This becomes even more important with specialist execution.

The specialist may report:
- conclusion
- root cause
- explanation
- evidence
- description of its change

Artemis should independently observe facts it can establish:
- base revision
- changed files
- git status/diff
- repository-defined verification results
- execution completion
- duration
- usage/cost
- PR state

Suggested copy once implemented:

> Delegating execution does not make the agent transcript the product. Artemis turns the work into a Result: what was concluded, what actually changed, what evidence supports it, what verification passed and what decision remains.

---

## 11. Morning Review

Keep:

> **What should be waiting for me when I wake up?**

Keep:

> **The goal is not a stream of agent activity. It is a concise record of what changed, what Artemis investigated, and what actually needs my attention.**

This already communicates the operator concept better than an explicit definition would.

The target end-to-end evidence remains:

```text
Sentry signal
    ↓
resolve product / repository
    ↓
policy + dedupe
    ↓
durable workflow
    ↓
delegate specialist work
    ↓
verify outcome
    ↓
Result
    ↓
human approval
    ↓
PR / Morning Review
```

Replace conceptual Target Experience with real screenshots only when this genuinely works.

---

## 12. What next?

Keep this section concise.

Recommended updated copy:

> Artemis Lite has given me a smaller environment for testing the parts of the original system that became difficult to reason about: workflow state, context, recovery, verification and human control.
>
> Dogfooding it against real production work has also helped clarify where the system boundary should sit. Artemis does not need to reproduce every specialist capability it coordinates.
>
> The next step is a concrete vertical slice: take a real production signal, resolve it to the correct product and repository, delegate repository engineering to a specialised agent, independently verify the result, and leave the consequential action waiting for review.
>
> If that works reliably, the interesting next step is to bring those lessons back into the richer product idea that started this project: the original Artemis interface, with the more deliberate system underneath it.
>
> **Lite is not the destination. It is where I am working out what Artemis 2.0 should actually be.**

Do not add a roadmap diagram.

---

## 13. Lessons

Keep:

> **The model is only one part of the system.**

Recommended refinement:

> Building Artemis changed how I think about AI product engineering. The first challenge was capability: connecting a model to repositories, tools, memory, monitoring and workers. The harder challenge appeared once those capabilities started doing real work.
>
> Once an AI system starts doing work that lasts longer than a single conversation, a lot of ordinary software engineering becomes important again. It needs to remember what happened, survive restarts, control what the model is allowed to do, recover from failures and leave enough evidence to understand why something went wrong.
>
> Lite also made another boundary clearer. Making a specialist task more bounded and observable does not necessarily mean the surrounding system should implement that specialism itself. Sometimes the better architecture is to retain control of the workflow and delegate the specialist work.
>
> **The model reasons. The application remembers what happened.**

Keep the existing final line:

> **Giving a model tools is relatively easy. Engineering a reliable system around those tools is the harder problem.**

Avoid adding several new slogans here. The existing ending is already strong.

---

## Editorial guardrails

### Protected
- Hero: no changes
- Artemis v1: no changes
- Existing original product intention: do not rewrite retrospectively

### Clarify later in the narrative
- Artemis coordinates agents/tools rather than needing to reproduce every capability
- bounded investigation revealed an implementation boundary
- specialist repository engineering can be delegated
- durable workflow, verification, recovery and human control remain Artemis responsibilities

### Avoid
- repeatedly saying "Artemis is not a coding agent"
- implying readers misunderstood the original idea
- making Claude Code the new centre of the case study
- rewriting the original vision around a lesson learned later
- claiming token savings without measurement
- claiming the bounded investigation solved the Lumi issue
- presenting the execution-adapter vertical slice as complete before it is real

### Core narrative test

The case study should read as:

> I built the product I intended to build.
>
> Using it exposed difficult engineering problems.
>
> Lite let me isolate and investigate those problems.
>
> Real production dogfooding challenged some implementation assumptions.
>
> I changed the boundary of the system without changing the original product ambition.

That is the story.
