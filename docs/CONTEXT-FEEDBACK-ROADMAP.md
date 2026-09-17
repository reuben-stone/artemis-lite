# Artemis Lite Roadmap: Context Definition & Feedback

## Purpose

Build on the existing Context Builder and Context Inspector by moving from **context observability** to **context evaluation**.

The current system can answer:

> **What did the model actually see?**

The next stage should answer:

> **Did the model see the right things?**

This should not become a vague "self-learning context" feature. The goal is to connect context-selection decisions to real workflow outcomes, then use that evidence to deliberately improve retrieval policy.

## Core principle

**Instrument usefulness before adding retrieval complexity.**

Do not add embeddings, semantic retrieval or automatic policy adaptation simply because they are available. First collect evidence from real workflows and understand where the existing deterministic selection strategy succeeds or fails.

The long-term feedback loop is:

**Select → Execute → Verify → Evaluate Context → Improve Selection Policy**

Initially, "improve" means giving the engineer evidence to change and compare retrieval strategies. It does not mean allowing the model to silently rewrite its own retrieval rules.

## 1. Record the context decision

For each reasoning or execution step, retain enough metadata to reconstruct the selection decision:

- evidence available at selection time
- evidence selected initially
- selection reason for each item
- evidence excluded and why
- truncation
- context budget
- estimated tokens
- actual provider input tokens
- workflow stage
- project
- capability/tool being used

Build this on the existing ContextPacket and persistence rather than creating a parallel context system.

## 2. Record what happened afterwards

Capture outcome signals that help determine whether the initial selection was sufficient.

Potential signals:

- `selected_initially`
- `discovered_later`
- `used_by_worker`
- `used_during_verification`
- `apparently_unused`
- `context_expansion_required`
- `missing_context`
- `misleading_context`
- `verification_success`
- `verification_failure`

Treat these as observable signals rather than absolute claims where attribution is uncertain. For example, `apparently_unused` is safer than claiming a context item had no influence on model reasoning.

## 3. Detect context expansion

One of the most useful signals is evidence that was not selected initially but became important during execution.

Example:

```text
Initial context

✓ scanner.ts             useful
✓ package.json           useful
○ routes.ts              apparently unused

Discovered during work

+ scanner-worker.ts      important, missing initially

Outcome

Verification             passed
Context expansion        required
Initial coverage         incomplete
```

If related workflows repeatedly discover similar files only after execution begins, that is concrete evidence of a weakness in the initial retrieval strategy.

## 4. Connect context to workflow outcomes

Associate context decisions with outcomes such as:

- verification passed or failed
- corrective execution required
- additional repository search required
- context expansion required
- workflow completed or failed
- human intervention required

Do not assume successful verification proves that every selected context item was useful. The aim is to accumulate evidence across real workflows.

## 5. Add a context usefulness view

Extend the Context Inspector, or add a post-workflow view, around two questions.

### What did the model see?

The existing view should continue to show:

- selected evidence
- selection reasons
- exclusions
- token estimates
- context budget
- provider input usage

### Did it see the right things?

The post-workflow view could show:

- initially selected evidence
- evidence subsequently used
- evidence discovered later
- apparently unused evidence
- missing evidence
- whether context expansion was required
- verification outcome
- context cost

Prefer recorded workflow evidence over generated retrospective prose.

## 6. Retrieval strategy experiments

Once enough real workflow data exists, compare strategies deliberately.

### Current deterministic scoring

Keep the existing path/filename keyword scoring and explicit workflow evidence as the baseline.

### Content-based lexical retrieval

Search file contents for terms related to the goal, issue, stack trace or current step.

Evaluate this before semantic retrieval because it is relatively simple, deterministic and inspectable.

### Workflow-stage-aware retrieval

Different stages should be allowed to receive different evidence.

For example:

- planning: issue + architecture + likely implementation files
- execution: specific implementation context
- verification: diff + checks + original acceptance criteria

Avoid automatically carrying all previous evidence into every later step.

### Project-specific relevance

Allow repeated real workflows to provide project-level relevance signals where justified.

### Historical workflow evidence

Previous successful investigations may become one signal for future retrieval.

For example, if a previous scanner timeout investigation required `scanner-worker.ts`, a later scanner-related workflow can consider that history.

Do not blindly inject previous workflow content into prompts.

### Semantic retrieval

Only evaluate embeddings/semantic search once lexical and historical approaches show measurable limitations.

Ask:

> Does semantic retrieval improve task-relevant evidence selection enough to justify its complexity, latency and maintenance cost?

### Hybrid retrieval

If measurements justify it, combine deterministic metadata, lexical matching, historical signals and semantic similarity.

Do not assume hybrid retrieval is automatically superior.

## 7. Metrics

### Coverage

How often did execution require important evidence missing from the initial context?

### Expansion rate

How often did a workflow need additional retrieval after its initial ContextPacket?

### Precision proxy

How much initially selected evidence appears to have contributed to execution or verification?

Treat this as a proxy, not proof of causal influence.

### Verification outcome

Did the workflow pass verification without corrective execution?

### Context cost

Record estimated context tokens, actual provider input tokens, latency and estimated model cost.

### Retrieval overhead

Measure the cost of producing the context itself, especially if semantic or hybrid retrieval is introduced.

### Strategy comparison

Compare strategies across several dimensions. Fewer tokens with worse task outcomes is not an improvement.

## 8. Define "good context"

A useful working definition:

> **Good context gives the model enough relevant evidence to complete the current reasoning step reliably, while avoiding unnecessary information that increases cost, noise or ambiguity.**

This should be stage-specific. There may be no single ideal ContextPacket for an entire workflow.

Planning, implementation, verification and recovery can each require different evidence.

## 9. Keep context separate from memory and state

Maintain the existing conceptual boundaries:

**Workflow state**  
What has happened in this workflow.

**Context**  
What evidence the model receives for this reasoning step.

**Memory**  
Information retained because it may be useful across future workflows.

**Context feedback**  
Evidence about whether a context-selection decision was useful.

Context feedback may eventually inform memory or retrieval policy, but these should remain separate concepts and storage concerns.

## 10. Portfolio, Sentry and Morning Review

This becomes more important once Artemis consumes operational signals.

Example:

```text
Sentry issue
    ↓
Map to project
    ↓
Select issue + deployment + repository evidence
    ↓
Investigate
    ↓
Discover missing implementation evidence
    ↓
Execute bounded worker
    ↓
Verify
    ↓
Record Result
    ↓
Evaluate context selection
```

Morning Review should consume the structured workflow Result. It should not require the entire investigation context or reconstruct the outcome from raw traces.

## 11. Guardrails

Do not allow Context Definition to become uncontrolled self-modification.

Initial rules:

- retrieval policy changes remain explicit code/configuration changes
- the model cannot silently alter retrieval weights
- historical context signals remain inspectable
- context feedback is persisted
- strategy versions are identifiable
- evaluations compare known strategies
- retrieval decisions remain traceable
- changes can be reproduced

Adaptive retrieval, if explored later, should be a separate decision backed by real evidence.

## 12. Suggested phases

### Phase A: Outcome instrumentation

Link ContextPackets to workflow steps, execution results, verification results, subsequent retrieval and provider usage.

Do not change retrieval behaviour yet.

### Phase B: Context usefulness UI

Add the post-workflow:

> **Did it see the right things?**

view.

Surface initial selection, later discoveries, context expansion, outcome and cost.

### Phase C: Establish baseline

Dogfood the existing deterministic strategy across real Artemis workflows.

Do not tune individual test cases before recording baseline behaviour.

### Phase D: Lexical retrieval experiment

Add content-based lexical retrieval as a separately identifiable strategy and compare it against the baseline.

### Phase E: Historical signals

Explore whether previous successful workflow evidence improves future selection for related tasks. Keep this project-scoped and inspectable.

### Phase F: Semantic/hybrid experiment

Only introduce embeddings or hybrid retrieval if measurements demonstrate a meaningful retrieval problem they could plausibly solve.

### Phase G: Policy recommendations

Allow Artemis to surface evidence such as:

> Scanner-related workflows required files under `src/scanner/` in 8 of the last 10 investigations, but the initial selector included them in only 3.

Use this to inform deliberate retrieval-policy changes. Automatic adaptation remains a separate later decision.

## Success criteria

Artemis should eventually answer both:

> **What did the model see?**

and:

> **Was that the right evidence for this task?**

An engineer should be able to determine:

1. what context was available
2. what was selected
3. why it was selected
4. what was excluded
5. what important evidence was discovered later
6. whether context had to be expanded
7. how the workflow performed
8. what the context cost
9. whether another retrieval strategy is worth testing

The objective is not minimum tokens.

**The objective is useful evidence, measurable selection and reliable outcomes.**

## Case study opportunity

This can eventually extend the existing Context section without replacing it.

### Current: What did the model actually see?

Shows the instrumentation layer: selection, exclusions, reasons, budget and provider usage.

### Future: Did it see the right things?

Shows the feedback layer: useful selected evidence, missing evidence discovered during work, context expansion, verification outcome, cost and retrieval-strategy comparison.

This creates a stronger engineering progression than simply demonstrating token reduction.

It also connects naturally to the future Evaluation section:

> The question is not whether Lite uses fewer tokens. The question is whether Artemis selects the evidence the task actually needs, and whether we can demonstrate that from real workflow outcomes.
