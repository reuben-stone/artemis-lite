/**
 * Workflow orchestrator with recovery, fault injection and retry.
 *
 * SQLite is the source of truth. The in-memory approval resolver map is
 * an optimisation for a currently-running process, not the authority.
 * On restart, persisted state is sufficient to resume.
 */
import {
  createWorkflow, updateWorkflow, getWorkflow, listNonTerminalWorkflows,
  createStep, updateStep, listSteps,
  appendTrace, createApproval, resolveApproval, getApprovalForStep,
  checkIdempotency, markIdempotencyPending, markIdempotencyComplete,
  idempotencyKey, appendUsage, getWorkflowUsage, listPendingApprovals,
  appendContextPacket, updateContextPacketProviderTokens,
  createWorkflowResult
} from './store'
import type { WorkflowRow, StepRow, ApprovalRow, WorkflowArtifact } from './store'
import type { ModelProvider, PlanOutput } from './model/types'
import { executeTool, getToolDefinitions, type ToolRegistry, type ToolContext } from './tools/registry'
import { buildContext } from './context/builder'
import { toPersistedItem } from './context/types'
import type { ContextPacket } from './context/types'
import type { WorkflowStatus, RendererEvent } from '../shared/ipc'
import { validateTransition } from './workflow/transitions'
import {
  type FaultInjector, noOpInjector,
  InjectedInterruptError, InjectedTimeoutError,
  InjectedInvalidOutputError, InjectedProviderError, InjectedToolFailureError
} from './fault-injector'

export { validateTransition }

// ── Retry policy ───────────────────────────────────────────────────

const RETRY_CONFIG = {
  maxAttempts: 2,
  backoffMs: [500, 1000]
}

function isTransientError(err: unknown): boolean {
  if (err instanceof InjectedTimeoutError) return true
  if (err instanceof InjectedProviderError) return true
  if (err instanceof Error) {
    const msg = err.message.toLowerCase()
    return msg.includes('timeout') || msg.includes('429') || msg.includes('5xx') ||
           msg.includes('econnreset') || msg.includes('econnrefused') ||
           msg.includes('provider unavailable') || msg.includes('service unavailable')
  }
  return false
}

function isInterruptError(err: unknown): boolean {
  return err instanceof InjectedInterruptError
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ── Types ──────────────────────────────────────────────────────────

type Emit = (event: RendererEvent) => void

export interface OrchestratorDeps {
  model: ModelProvider
  tools: ToolRegistry
  workspacePath: string
  toolContext?: Partial<ToolContext>  // Extra context (e.g. GitHub client) merged into tool calls
  emit: Emit
  faultInjector?: FaultInjector
}

// ── State machine ──────────────────────────────────────────────────

function transition(wf: WorkflowRow, to: WorkflowStatus): void {
  if (!validateTransition(wf.status as WorkflowStatus, to)) {
    throw new Error(`Invalid transition: ${wf.status} → ${to}`)
  }
  updateWorkflow(wf.id, { status: to })
  wf.status = to
}

// ── Tracing helper ─────────────────────────────────────────────────

function trace(workflowId: string, type: string, extra: Partial<Parameters<typeof appendTrace>[0]> = {}) {
  return appendTrace({
    workflowId,
    stepId: extra.stepId ?? null,
    timestamp: new Date().toISOString(),
    type,
    status: extra.status ?? null,
    durationMs: extra.durationMs ?? null,
    model: extra.model ?? null,
    inputTokens: extra.inputTokens ?? null,
    outputTokens: extra.outputTokens ?? null,
    toolName: extra.toolName ?? null,
    retry: extra.retry ?? null,
    errorCode: extra.errorCode ?? null,
    metadata: extra.metadata ?? null
  })
}

function getFaultInjector(deps: OrchestratorDeps): FaultInjector {
  return deps.faultInjector ?? noOpInjector
}

// ── Result summary builder ────────────────────────────────────────

function buildResultSummary(
  goal: string,
  artifacts: WorkflowArtifact[],
  verification: { pass: boolean; reason: string }
): string {
  if (!verification.pass) {
    return `Verification failed: ${verification.reason}`
  }

  const parts: string[] = []

  for (const a of artifacts) {
    const d = a.data as Record<string, unknown>
    if (d.files && Array.isArray(d.files)) {
      const files = d.files as { path: string; type?: string }[]
      const dirs = files.filter(f => f.type === 'directory')
      const regular = files.filter(f => f.type !== 'directory')
      if (dirs.length > 0 || regular.length > 0) {
        const items = [...dirs.map(f => `${f.path}/`), ...regular.map(f => f.path)]
        parts.push(`${a.objective}: ${items.join(', ')}`)
      }
    } else if (d.issues && Array.isArray(d.issues)) {
      const issues = d.issues as { number: number; title: string; state: string }[]
      if (issues.length === 0) {
        parts.push('No open issues found.')
      } else {
        parts.push(`${issues.length} issue(s): ${issues.map(i => `#${i.number} ${i.title}`).join('; ')}`)
      }
    } else if (d.pullRequests && Array.isArray(d.pullRequests)) {
      const prs = d.pullRequests as { number: number; title: string }[]
      if (prs.length === 0) {
        parts.push('No open pull requests.')
      } else {
        parts.push(`${prs.length} PR(s): ${prs.map(p => `#${p.number} ${p.title}`).join('; ')}`)
      }
    } else if (d.issue && typeof d.issue === 'object') {
      const issue = d.issue as { number: number; title: string; body?: string }
      parts.push(`Issue #${issue.number}: ${issue.title}`)
    } else if (d.matches && Array.isArray(d.matches)) {
      parts.push(`Found ${(d as any).totalMatches} match(es) across ${(d as any).filesSearched} files`)
    } else if (d.content !== undefined && d.path) {
      parts.push(`Read ${d.path} (${d.lines} lines)`)
    } else if (d.passed !== undefined) {
      parts.push(`${a.toolName}: ${d.passed ? 'passed' : 'failed'}`)
    } else if (d.diff !== undefined) {
      parts.push(`${(d.changedFiles as string[])?.length ?? 0} file(s) changed`)
    } else if (d.commitHash) {
      parts.push(`Committed: ${d.commitHash} - ${d.message}`)
    } else if (d.branchName) {
      parts.push(`Branch created: ${d.branchName}`)
    } else if (d.url) {
      parts.push(`PR created: ${d.url}`)
    } else if (d.written) {
      parts.push(`Wrote ${d.path}`)
    }
  }

  if (parts.length === 0) {
    return `Goal achieved: ${goal}`
  }

  return parts.join('\n')
}

// ── Context helper ─────────────────────────────────────────────────

async function buildAndPersistContext(
  wf: WorkflowRow,
  stepId: string | null,
  phase: 'plan' | 'verify',
  deps: OrchestratorDeps,
  extra: {
    currentStep?: { type: string; objective: string }
    completedSteps?: string[]
    toolEvidence?: Record<string, unknown>
  } = {}
): Promise<ContextPacket> {
  const packet = await buildContext({
    workflowId: wf.id,
    stepId,
    phase,
    goal: wf.goal,
    currentStep: extra.currentStep,
    workflowState: {
      status: wf.status,
      completedSteps: extra.completedSteps ?? []
    },
    tools: phase === 'plan' ? getToolDefinitions(deps.tools) : undefined,
    workspacePath: deps.workspacePath,
    toolEvidence: extra.toolEvidence
  })

  // Persist compact representation
  const composition = {
    items: packet.items.map(toPersistedItem),
    excluded: packet.excluded,
    budget: packet.budget
  }

  const row = appendContextPacket({
    workflowId: wf.id,
    stepId,
    phase,
    composition: JSON.stringify(composition),
    estimatedTokens: packet.estimatedTokens,
    providerInputTokens: null,
    createdAt: new Date().toISOString()
  })

  trace(wf.id, 'context.built', {
    stepId,
    status: 'success',
    metadata: JSON.stringify({
      phase,
      estimatedTokens: packet.estimatedTokens,
      itemCount: packet.items.length,
      excludedCount: packet.excluded.length,
      budgetUsed: packet.budget.used,
      budgetLimit: packet.budget.limit,
      contextPacketId: row.id
    })
  })

  // Attach the row ID so we can update provider tokens later
  ;(packet as any)._persistedId = row.id

  return packet
}

// ── Approval management ────────────────────────────────────────────

const pendingApprovalResolvers = new Map<string, {
  resolve: (decision: 'approved' | 'rejected') => void
  approvalId: string
}>()

export function resolveWorkflowApproval(approvalId: string, decision: 'approved' | 'rejected'): void {
  resolveApproval(approvalId, decision)
  for (const [wfId, entry] of pendingApprovalResolvers) {
    if (entry.approvalId === approvalId) {
      entry.resolve(decision)
      pendingApprovalResolvers.delete(wfId)
      return
    }
  }
}

function waitForApproval(workflowId: string, approval: ApprovalRow, emit: Emit): Promise<'approved' | 'rejected'> {
  if (approval.status === 'approved') return Promise.resolve('approved')
  if (approval.status === 'rejected') return Promise.resolve('rejected')

  emit({
    type: 'approval.requested',
    approval: {
      id: approval.id,
      workflowId,
      stepId: approval.stepId,
      action: approval.action,
      summary: approval.summary,
      risk: approval.risk as 'low' | 'medium' | 'high',
      payloadPreview: approval.payloadPreview ? JSON.parse(approval.payloadPreview) : null,
      status: 'pending'
    }
  })

  return new Promise<'approved' | 'rejected'>((resolve) => {
    pendingApprovalResolvers.set(workflowId, { resolve, approvalId: approval.id })
  })
}

// ── Model call with retry ──────────────────────────────────────────

async function callModelWithRetry<T>(
  wf: WorkflowRow,
  phase: 'plan' | 'verify',
  callFn: () => Promise<T>,
  fi: FaultInjector
): Promise<T> {
  for (let attempt = 0; attempt <= RETRY_CONFIG.maxAttempts; attempt++) {
    try {
      await fi.beforeModelCall(phase)
      return await callFn()
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      const isInjected = 'injected' in (err as any)

      trace(wf.id, `model.${isTransientError(err) ? 'timeout' : 'failed'}`, {
        status: 'failure',
        errorCode: errMsg,
        retry: attempt,
        metadata: isInjected ? JSON.stringify({ source: 'fault_injection' }) : null
      })

      if (isInjected) {
        trace(wf.id, 'fault.triggered', {
          metadata: JSON.stringify({ kind: (err as Error).message, phase })
        })
      }

      if (isInterruptError(err)) throw err

      if (isTransientError(err) && attempt < RETRY_CONFIG.maxAttempts) {
        trace(wf.id, 'model.retry', {
          retry: attempt + 1,
          metadata: JSON.stringify({ backoffMs: RETRY_CONFIG.backoffMs[attempt] })
        })
        await sleep(RETRY_CONFIG.backoffMs[attempt])
        continue
      }

      throw err
    }
  }
  throw new Error('Unreachable')
}

// ── Tool execution with retry and fault injection ──────────────────

async function executeToolStep(
  wf: WorkflowRow,
  step: StepRow,
  toolName: string,
  toolArgs: Record<string, unknown>,
  objective: string,
  deps: OrchestratorDeps
): Promise<unknown> {
  const { tools, workspacePath, emit } = deps
  const fi = getFaultInjector(deps)

  const toolDef = tools.get(toolName)
  if (!toolDef) {
    updateStep(step.id, { status: 'failed', completedAt: new Date().toISOString() })
    trace(wf.id, 'tool.failed', { stepId: step.id, toolName, status: 'failure', errorCode: 'unknown_tool' })
    return undefined
  }

  // Approval gate for write tools
  if (toolDef.approval === 'write' || toolDef.approval === 'always') {
    let approval = getApprovalForStep(wf.id, step.id)
    if (!approval) {
      if (wf.status !== 'awaiting_approval') {
        transition(wf, 'awaiting_approval')
        emit({ type: 'workflow.status', workflowId: wf.id, status: 'awaiting_approval' })
      }
      approval = createApproval({
        workflowId: wf.id, stepId: step.id,
        action: toolName, summary: objective,
        risk: toolDef.approval === 'always' ? 'high' : 'medium',
        payloadPreview: Object.keys(toolArgs).length > 0 ? JSON.stringify(toolArgs) : null
      })
      trace(wf.id, 'approval.requested', { stepId: step.id, status: 'start' })
    } else if (approval.status === 'pending' && wf.status !== 'awaiting_approval') {
      transition(wf, 'awaiting_approval')
      emit({ type: 'workflow.status', workflowId: wf.id, status: 'awaiting_approval' })
    }

    const decision = await waitForApproval(wf.id, approval, emit)
    trace(wf.id, `approval.${decision}`, { stepId: step.id, status: decision === 'approved' ? 'success' : 'failure' })

    if (decision === 'rejected') {
      updateStep(step.id, { status: 'failed', completedAt: new Date().toISOString() })
      throw new ApprovalRejectedError()
    }

    if (wf.status === 'awaiting_approval') {
      transition(wf, 'executing')
      emit({ type: 'workflow.status', workflowId: wf.id, status: 'executing' })
    }
  }

  // Idempotency check
  const idemKey = idempotencyKey(wf.id, step.id, toolName)
  const existing = checkIdempotency(idemKey)

  if (existing?.status === 'completed') {
    const result = JSON.parse(existing.result!)
    trace(wf.id, 'tool.idempotent_hit', { stepId: step.id, toolName, status: 'success' })
    return result
  }

  // Reconciliation: if ledger says 'pending', the side effect may have occurred
  // before the process died. For create_work_item, check if the artifact exists.
  if (existing?.status === 'pending' && toolDef.mode === 'write') {
    trace(wf.id, 'tool.reconciliation_check', {
      stepId: step.id, toolName, status: 'start',
      metadata: JSON.stringify({ reason: 'pending_ledger_entry_after_restart' })
    })
    // Try to reconcile — execute returns existing artifact if found
  }

  // Execute with retry.
  // Retry is only safe BEFORE a side effect has occurred.
  // After executeTool() returns, the side effect is done — any subsequent
  // failure is an ambiguous-completion case, not a reason to re-execute.
  if (!existing) {
    markIdempotencyPending(idemKey)
  }

  for (let attempt = 0; attempt <= RETRY_CONFIG.maxAttempts; attempt++) {
    try {
      emit({ type: 'tool.started', workflowId: wf.id, stepId: step.id, toolName })

      const toolStart = Date.now()
      const toolResult = await executeTool(tools, toolName, toolArgs, { workspacePath, ...deps.toolContext })
      const toolDuration = Date.now() - toolStart

      // Side effect has now occurred. From this point, failures are
      // ambiguous-completion — we must NOT retry the tool call.
      try {
        await fi.afterToolSideEffect(step.id, toolName)
      } catch (postErr) {
        // The side effect succeeded but something failed after it.
        // For write tools: complete the idempotency record with the
        // successful result, then propagate the error. On recovery,
        // the completed ledger entry prevents re-execution.
        if (toolDef.mode === 'write') {
          markIdempotencyComplete(idemKey, toolResult)
          trace(wf.id, 'tool.completed_before_fault', {
            stepId: step.id, toolName, status: 'success',
            durationMs: toolDuration,
            metadata: JSON.stringify({ note: 'side_effect_completed_fault_occurred_after' })
          })
        }
        // For read tools: no side effect to protect, safe to propagate
        throw postErr
      }

      markIdempotencyComplete(idemKey, toolResult)
      trace(wf.id, 'tool.completed', {
        stepId: step.id, toolName, status: 'success',
        durationMs: toolDuration, retry: attempt > 0 ? attempt : null
      })
      emit({ type: 'tool.completed', workflowId: wf.id, stepId: step.id, toolName, durationMs: toolDuration })

      return toolResult
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      const isInjected = 'injected' in (err as any)

      if (isInjected) {
        trace(wf.id, 'fault.triggered', {
          stepId: step.id,
          metadata: JSON.stringify({ kind: errMsg, toolName })
        })
      }

      if (isInterruptError(err)) throw err

      // Only retry if the error occurred BEFORE the side effect.
      // If the idempotency ledger is already 'completed', we recorded
      // the result above — do not retry.
      const ledgerNow = checkIdempotency(idemKey)
      if (ledgerNow?.status === 'completed') {
        // Side effect happened and was recorded. Return stored result.
        trace(wf.id, 'tool.ambiguous_resolved', {
          stepId: step.id, toolName, status: 'success',
          metadata: JSON.stringify({ resolution: 'ledger_completed_after_post_fault' })
        })
        return JSON.parse(ledgerNow.result!)
      }

      // Retry is safe for read tools (no side effect) or if the tool
      // has not yet executed (transient pre-execution failure).
      const canRetry = isTransientError(err) && attempt < RETRY_CONFIG.maxAttempts
        && toolDef.mode === 'read'

      trace(wf.id, canRetry ? 'tool.retry' : 'tool.failed', {
        stepId: step.id, toolName, status: 'failure',
        errorCode: errMsg, retry: attempt,
        metadata: isInjected ? JSON.stringify({ source: 'fault_injection' }) : null
      })

      if (canRetry) {
        await sleep(RETRY_CONFIG.backoffMs[attempt])
        continue
      }

      throw err
    }
  }
  throw new Error('Unreachable')
}

class ApprovalRejectedError extends Error {
  constructor() { super('Approval rejected by user') }
}

// ── Execute plan steps (shared) ────────────────────────────────────

async function executePlanSteps(
  wf: WorkflowRow,
  plan: PlanOutput,
  existingSteps: StepRow[],
  deps: OrchestratorDeps
): Promise<Record<string, unknown>> {
  const { emit } = deps
  const fi = getFaultInjector(deps)
  // Key by plan step ID, not toolName — same tool may be called multiple times with different args
  const stepResults: Record<string, unknown> = {}

  // Map existing completed steps by their inputData.planStepId (set during creation)
  for (const s of existingSteps) {
    if (s.status === 'completed' && s.outputData && s.inputData) {
      try {
        const input = JSON.parse(s.inputData)
        if (input.planStepId) {
          stepResults[input.planStepId] = JSON.parse(s.outputData)
        }
      } catch { /* ok */ }
    }
  }

  for (const planItem of plan.steps) {
    if (planItem.preferredAction !== 'use_tool' || !planItem.toolName) continue

    // Match by planStepId stored in inputData, not by toolName
    let step = existingSteps.find(s => {
      if (s.type !== 'tool') return false
      try {
        const input = JSON.parse(s.inputData ?? '{}')
        return input.planStepId === planItem.id
      } catch { return false }
    })

    if (step?.status === 'completed') {
      if (step.outputData) stepResults[planItem.id] = JSON.parse(step.outputData)
      trace(wf.id, 'step.skipped_completed', { stepId: step.id, toolName: planItem.toolName, status: 'success' })
      continue
    }

    if (!step) {
      step = createStep(wf.id, 'tool', planItem.toolName, {
        planStepId: planItem.id,
        objective: planItem.objective,
        toolArgs: planItem.toolArgs
      })
    }

    updateWorkflow(wf.id, { currentStepId: step.id })
    if (step.status !== 'running') {
      updateStep(step.id, { status: 'running', startedAt: step.startedAt ?? new Date().toISOString() })
    }

    emit({ type: 'step.started', workflowId: wf.id, step: stepToSummary(step) })
    trace(wf.id, 'tool.started', { stepId: step.id, toolName: planItem.toolName, status: 'start' })

    try {
      const result = await executeToolStep(wf, step, planItem.toolName, planItem.toolArgs ?? {}, planItem.objective, deps)
      if (result !== undefined) {
        stepResults[planItem.id] = result
        updateStep(step.id, {
          status: 'completed',
          outputData: JSON.stringify(result),
          completedAt: new Date().toISOString()
        })
        emit({ type: 'step.completed', workflowId: wf.id, step: stepToSummary(step) })

        // Fault injection: after step completion
        await fi.afterStepCompletion(step.id)
      }
    } catch (err) {
      if (err instanceof ApprovalRejectedError) throw err
      if (isInterruptError(err)) throw err
      const errMsg = err instanceof Error ? err.message : String(err)
      trace(wf.id, 'tool.failed', { stepId: step.id, toolName: planItem.toolName, status: 'failure', errorCode: errMsg })
      updateStep(step.id, { status: 'failed', completedAt: new Date().toISOString() })
    }
  }

  return stepResults
}

// ── Run verification (shared) ──────────────────────────────────────

async function runVerification(
  wf: WorkflowRow,
  plan: PlanOutput,
  stepResults: Record<string, unknown>,
  existingSteps: StepRow[],
  deps: OrchestratorDeps
): Promise<{ pass: boolean; reason: string }> {
  const { model, emit } = deps
  const fi = getFaultInjector(deps)

  const existingVerify = existingSteps.find(s => s.type === 'verify' && s.status === 'completed')
  if (existingVerify) {
    trace(wf.id, 'step.skipped_completed', { stepId: existingVerify.id, status: 'success' })
    try {
      return JSON.parse(existingVerify.outputData!)
    } catch {
      return { pass: true, reason: 'Previously verified' }
    }
  }

  // Fault injection: before verification
  await fi.beforeVerification()

  if (wf.status !== 'verifying') {
    transition(wf, 'verifying')
    trace(wf.id, 'workflow.verifying', { status: 'start' })
    emit({ type: 'workflow.status', workflowId: wf.id, status: 'verifying' })
  }

  const verifyStep = existingSteps.find(s => s.type === 'verify') ?? createStep(wf.id, 'verify')
  updateStep(verifyStep.id, { status: 'running', startedAt: verifyStep.startedAt ?? new Date().toISOString() })

  const verifyStart = Date.now()
  const verifyResult = await callModelWithRetry(wf, 'verify', () =>
    (async () => {
      const ctx = await buildAndPersistContext(wf, verifyStep.id, 'verify', deps, {
        currentStep: { type: 'verify', objective: 'Verify workflow outcome' },
        completedSteps: existingSteps.filter(s => s.status === 'completed').map(s => s.toolName ?? s.type),
        toolEvidence: stepResults
      })
      const result = await model.generateVerification({
        goal: wf.goal, stepResults, plan,
        context: ctx
      })
      if ((ctx as any)._persistedId) {
        updateContextPacketProviderTokens((ctx as any)._persistedId, result.usage.inputTokens)
      }
      return result
    })(),
    fi
  )
  const verifyDuration = Date.now() - verifyStart

  appendUsage({
    workflowId: wf.id, stepId: verifyStep.id,
    provider: verifyResult.provider, model: verifyResult.model,
    inputTokens: verifyResult.usage.inputTokens, outputTokens: verifyResult.usage.outputTokens,
    estimatedCost: verifyResult.usage.estimatedCost ?? null,
    timestamp: new Date().toISOString()
  })

  trace(wf.id, 'model.verify', {
    stepId: verifyStep.id,
    status: verifyResult.data.pass ? 'success' : 'failure',
    durationMs: verifyDuration,
    model: verifyResult.model,
    inputTokens: verifyResult.usage.inputTokens,
    outputTokens: verifyResult.usage.outputTokens
  })

  updateStep(verifyStep.id, {
    status: 'completed',
    outputData: JSON.stringify(verifyResult.data),
    completedAt: new Date().toISOString()
  })

  return verifyResult.data
}

// ── Run (new workflow) ─────────────────────────────────────────────

export async function runWorkflow(goal: string, deps: OrchestratorDeps, projectId?: string | null): Promise<WorkflowRow> {
  const { model, tools, emit } = deps
  const fi = getFaultInjector(deps)

  const wf = createWorkflow(goal, projectId)
  trace(wf.id, 'workflow.created', { status: 'start' })
  emit({ type: 'workflow.status', workflowId: wf.id, status: 'queued' })

  try {
    // Planning
    transition(wf, 'planning')
    trace(wf.id, 'workflow.planning', { status: 'start' })
    emit({ type: 'workflow.status', workflowId: wf.id, status: 'planning' })

    const planStep = createStep(wf.id, 'reason')
    updateStep(planStep.id, { status: 'running', startedAt: new Date().toISOString() })

    const planStart = Date.now()
    const planResult = await callModelWithRetry(wf, 'plan', () =>
      (async () => {
        const ctx = await buildAndPersistContext(wf, planStep.id, 'plan', deps, {
          currentStep: { type: 'reason', objective: 'Create execution plan' }
        })
        const result = await model.generatePlan({
          goal, workspacePath: deps.workspacePath,
          tools: getToolDefinitions(tools),
          context: ctx
        })
        // Update persisted packet with actual provider tokens
        if ((ctx as any)._persistedId) {
          updateContextPacketProviderTokens((ctx as any)._persistedId, result.usage.inputTokens)
        }
        return result
      })(),
      fi
    )
    const planDuration = Date.now() - planStart

    appendUsage({
      workflowId: wf.id, stepId: planStep.id,
      provider: planResult.provider, model: planResult.model,
      inputTokens: planResult.usage.inputTokens, outputTokens: planResult.usage.outputTokens,
      estimatedCost: planResult.usage.estimatedCost ?? null,
      timestamp: new Date().toISOString()
    })

    trace(wf.id, 'model.plan', {
      stepId: planStep.id, status: 'success', durationMs: planDuration,
      model: planResult.model, inputTokens: planResult.usage.inputTokens, outputTokens: planResult.usage.outputTokens
    })

    const plan = planResult.data
    updateWorkflow(wf.id, { plan: JSON.stringify(plan) })
    updateStep(planStep.id, { status: 'completed', outputData: JSON.stringify(plan), completedAt: new Date().toISOString() })

    trace(wf.id, 'plan.validated', { status: 'success' })
    emit({ type: 'step.completed', workflowId: wf.id, step: stepToSummary(planStep) })
    emit({ type: 'model.text', workflowId: wf.id, text: plan.summary })

    // Executing
    transition(wf, 'executing')
    trace(wf.id, 'workflow.executing', { status: 'start' })
    emit({ type: 'workflow.status', workflowId: wf.id, status: 'executing' })

    const stepResults = await executePlanSteps(wf, plan, [], deps)

    // Verifying
    const verification = await runVerification(wf, plan, stepResults, listSteps(wf.id), deps)

    // Complete
    transition(wf, 'completed')
    const usage = getWorkflowUsage(wf.id)

    // Build WorkflowResult from actual execution output
    const allSteps = listSteps(wf.id)
    const failedSteps = allSteps.filter(s => s.status === 'failed')
    const resultStatus = !verification.pass ? 'failed' : failedSteps.length > 0 ? 'partial' : 'succeeded'

    const artifacts: WorkflowArtifact[] = plan.steps
      .filter(s => s.toolName && stepResults[s.id] !== undefined)
      .map(s => ({
        toolName: s.toolName!,
        objective: s.objective,
        data: stepResults[s.id]
      }))

    const summary = buildResultSummary(goal, artifacts, verification)
    createWorkflowResult(wf.id, resultStatus, summary, verification.reason, artifacts)

    trace(wf.id, 'workflow.completed', { status: 'success' })
    emit({ type: 'workflow.completed', workflowId: wf.id, usage })
    emit({ type: 'workflow.status', workflowId: wf.id, status: 'completed' })

    return getWorkflow(wf.id)!
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    // Interrupt errors leave workflow in current state for recovery
    if (isInterruptError(err)) {
      trace(wf.id, 'workflow.interrupted', {
        status: 'failure',
        errorCode: errMsg,
        metadata: JSON.stringify({ source: 'fault_injection', status: wf.status })
      })
      emit({ type: 'workflow.failed', workflowId: wf.id, error: `Interrupted: ${errMsg}` })
      return getWorkflow(wf.id)!
    }
    try { transition(wf, 'failed') } catch { /* already terminal */ }
    createWorkflowResult(wf.id, 'failed', errMsg, errMsg)
    trace(wf.id, 'workflow.failed', { status: 'failure', errorCode: errMsg })
    emit({ type: 'workflow.failed', workflowId: wf.id, error: errMsg })
    return getWorkflow(wf.id)!
  }
}

// ── Resume (recovery after restart) ────────────────────────────────

export function discoverInterruptedWorkflows(): WorkflowRow[] {
  return listNonTerminalWorkflows()
}

export async function resumeWorkflow(workflowId: string, deps: OrchestratorDeps): Promise<WorkflowRow> {
  const { model, emit } = deps
  const fi = getFaultInjector(deps)
  const wf = getWorkflow(workflowId)
  if (!wf) throw new Error(`Workflow ${workflowId} not found`)

  const terminalStatuses: WorkflowStatus[] = ['completed', 'failed', 'cancelled']
  if (terminalStatuses.includes(wf.status)) {
    throw new Error(`Cannot resume terminal workflow (status: ${wf.status})`)
  }

  trace(wf.id, 'workflow.interrupted', {
    status: 'failure',
    metadata: JSON.stringify({ interruptedAt: wf.updatedAt, recoveredStatus: wf.status })
  })
  trace(wf.id, 'workflow.recovered', { status: 'start' })
  emit({ type: 'workflow.status', workflowId: wf.id, status: wf.status })

  const steps = listSteps(wf.id)

  try {
    let plan: PlanOutput | null = null
    if (wf.plan) {
      try { plan = JSON.parse(wf.plan) }
      catch { throw new Error('Corrupt plan data — cannot recover') }
    }

    let resumeVerification: { pass: boolean; reason: string } | null = null
    let resumeStepResults: Record<string, unknown> = {}

    switch (wf.status) {
      case 'queued':
      case 'planning': {
        trace(wf.id, 'workflow.resumed', { status: 'start', metadata: JSON.stringify({ from: wf.status }) })

        for (const s of steps.filter(s => s.type === 'reason' && s.status === 'running')) {
          updateStep(s.id, { status: 'failed', completedAt: new Date().toISOString() })
        }

        if (wf.status === 'queued') {
          transition(wf, 'planning')
          emit({ type: 'workflow.status', workflowId: wf.id, status: 'planning' })
        }

        const planStep = createStep(wf.id, 'reason')
        updateStep(planStep.id, { status: 'running', startedAt: new Date().toISOString() })

        const planStart = Date.now()
        const planResult = await callModelWithRetry(wf, 'plan', () =>
          (async () => {
            const ctx = await buildAndPersistContext(wf, planStep.id, 'plan', deps, {
              currentStep: { type: 'reason', objective: 'Create execution plan' }
            })
            const result = await model.generatePlan({
              goal: wf.goal, workspacePath: deps.workspacePath,
              tools: getToolDefinitions(deps.tools),
              context: ctx
            })
            if ((ctx as any)._persistedId) {
              updateContextPacketProviderTokens((ctx as any)._persistedId, result.usage.inputTokens)
            }
            return result
          })(),
          fi
        )
        const planDuration = Date.now() - planStart

        appendUsage({
          workflowId: wf.id, stepId: planStep.id,
          provider: planResult.provider, model: planResult.model,
          inputTokens: planResult.usage.inputTokens, outputTokens: planResult.usage.outputTokens,
          estimatedCost: planResult.usage.estimatedCost ?? null,
          timestamp: new Date().toISOString()
        })

        trace(wf.id, 'model.plan', {
          stepId: planStep.id, status: 'success', durationMs: planDuration,
          model: planResult.model, inputTokens: planResult.usage.inputTokens, outputTokens: planResult.usage.outputTokens
        })

        plan = planResult.data
        updateWorkflow(wf.id, { plan: JSON.stringify(plan) })
        updateStep(planStep.id, { status: 'completed', outputData: JSON.stringify(plan), completedAt: new Date().toISOString() })
        emit({ type: 'model.text', workflowId: wf.id, text: plan.summary })

        transition(wf, 'executing')
        emit({ type: 'workflow.status', workflowId: wf.id, status: 'executing' })
        const stepResults = await executePlanSteps(wf, plan, listSteps(wf.id), deps)
        resumeVerification = await runVerification(wf, plan, stepResults, listSteps(wf.id), deps)
        resumeStepResults = stepResults
        break
      }

      case 'executing':
      case 'awaiting_approval': {
        if (!plan) throw new Error('Cannot resume executing workflow without a plan')

        trace(wf.id, 'workflow.resumed', {
          status: 'start',
          metadata: JSON.stringify({ from: wf.status, completedSteps: steps.filter(s => s.status === 'completed').length })
        })

        for (const s of steps.filter(s => s.type === 'tool' && s.status === 'running')) {
          updateStep(s.id, { status: 'pending' })
        }

        if (wf.status !== 'awaiting_approval') {
          emit({ type: 'workflow.status', workflowId: wf.id, status: 'executing' })
        }

        const stepResults = await executePlanSteps(wf, plan, listSteps(wf.id), deps)
        resumeVerification = await runVerification(wf, plan, stepResults, listSteps(wf.id), deps)
        resumeStepResults = stepResults
        break
      }

      case 'verifying': {
        if (!plan) throw new Error('Cannot resume verifying workflow without a plan')
        trace(wf.id, 'workflow.resumed', { status: 'start', metadata: JSON.stringify({ from: 'verifying' }) })

        const stepResults: Record<string, unknown> = {}
        for (const s of steps) {
          if (s.status === 'completed' && s.outputData && s.inputData) {
            try {
              const input = JSON.parse(s.inputData)
              if (input.planStepId) {
                stepResults[input.planStepId] = JSON.parse(s.outputData)
              }
            } catch { /* ok */ }
          }
        }

        resumeVerification = await runVerification(wf, plan, stepResults, listSteps(wf.id), deps)
        resumeStepResults = stepResults
        break
      }

      default:
        throw new Error(`Unexpected workflow status for recovery: ${wf.status}`)
    }

    transition(wf, 'completed')
    const usage = getWorkflowUsage(wf.id)

    // Build WorkflowResult from actual execution output
    if (plan && resumeVerification) {
      const allSteps = listSteps(wf.id)
      const failedSteps = allSteps.filter(s => s.status === 'failed')
      const resultStatus = !resumeVerification.pass ? 'failed' : failedSteps.length > 0 ? 'partial' : 'succeeded'
      const artifacts: WorkflowArtifact[] = plan.steps
        .filter(s => s.toolName && resumeStepResults[s.id] !== undefined)
        .map(s => ({ toolName: s.toolName!, objective: s.objective, data: resumeStepResults[s.id] }))
      const summary = buildResultSummary(goal, artifacts, resumeVerification)
      createWorkflowResult(wf.id, resultStatus, summary, resumeVerification.reason, artifacts)
    }

    trace(wf.id, 'workflow.completed', { status: 'success' })
    emit({ type: 'workflow.completed', workflowId: wf.id, usage })
    emit({ type: 'workflow.status', workflowId: wf.id, status: 'completed' })

    return getWorkflow(wf.id)!
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    if (isInterruptError(err)) {
      trace(wf.id, 'workflow.interrupted', {
        status: 'failure', errorCode: errMsg,
        metadata: JSON.stringify({ source: 'fault_injection', status: wf.status })
      })
      emit({ type: 'workflow.failed', workflowId: wf.id, error: `Interrupted: ${errMsg}` })
      return getWorkflow(wf.id)!
    }
    try { transition(wf, 'failed') } catch { /* already terminal */ }
    trace(wf.id, 'workflow.failed', { status: 'failure', errorCode: errMsg })
    emit({ type: 'workflow.failed', workflowId: wf.id, error: errMsg })
    return getWorkflow(wf.id)!
  }
}

// ── Helpers ────────────────────────────────────────────────────────

function stepToSummary(step: StepRow) {
  return {
    id: step.id,
    workflowId: step.workflowId,
    type: step.type as any,
    status: step.status as any,
    attempt: step.attempt,
    startedAt: step.startedAt ?? undefined,
    completedAt: step.completedAt ?? undefined
  }
}
