/**
 * Workflow orchestrator with recovery.
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
  idempotencyKey, appendUsage, getWorkflowUsage, listPendingApprovals
} from './store'
import type { WorkflowRow, StepRow, ApprovalRow } from './store'
import type { ModelProvider, PlanOutput } from './model/types'
import { executeTool, getToolDefinitions, type ToolRegistry } from './tools/registry'
import type { WorkflowStatus, RendererEvent } from '../shared/ipc'
import { validateTransition } from './workflow/transitions'

export { validateTransition }

// ── Types ──────────────────────────────────────────────────────────

type Emit = (event: RendererEvent) => void

export interface OrchestratorDeps {
  model: ModelProvider
  tools: ToolRegistry
  workspacePath: string
  emit: Emit
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

// ── Approval management ────────────────────────────────────────────
// In-memory map for the current process. NOT the authority — persisted
// approval records are. This map is recreated on resume.

const pendingApprovalResolvers = new Map<string, {
  resolve: (decision: 'approved' | 'rejected') => void
  approvalId: string
}>()

export function resolveWorkflowApproval(approvalId: string, decision: 'approved' | 'rejected'): void {
  // Persist first — this is the source of truth
  resolveApproval(approvalId, decision)
  // Then unblock the in-memory promise if it exists
  for (const [wfId, entry] of pendingApprovalResolvers) {
    if (entry.approvalId === approvalId) {
      entry.resolve(decision)
      pendingApprovalResolvers.delete(wfId)
      return
    }
  }
}

/**
 * Wait for an approval decision. Checks persisted state first (handles
 * the case where approval was resolved before this process existed),
 * then creates an in-memory promise for live waiting.
 */
function waitForApproval(workflowId: string, approval: ApprovalRow, emit: Emit): Promise<'approved' | 'rejected'> {
  // Check if already resolved in persistence (recovery case)
  if (approval.status === 'approved') return Promise.resolve('approved')
  if (approval.status === 'rejected') return Promise.resolve('rejected')

  // Emit approval request to renderer
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

// ── Step execution (shared between run and resume) ─────────────────

async function executeToolStep(
  wf: WorkflowRow,
  step: StepRow,
  toolName: string,
  toolArgs: Record<string, unknown>,
  objective: string,
  deps: OrchestratorDeps
): Promise<unknown> {
  const { tools, workspacePath, emit } = deps
  const toolDef = tools.get(toolName)
  if (!toolDef) {
    updateStep(step.id, { status: 'failed', completedAt: new Date().toISOString() })
    trace(wf.id, 'tool.failed', { stepId: step.id, toolName, status: 'failure', errorCode: 'unknown_tool' })
    return undefined
  }

  // Approval gate for write tools
  if (toolDef.approval === 'write' || toolDef.approval === 'always') {
    // Check for existing approval (recovery or first time)
    let approval = getApprovalForStep(wf.id, step.id)
    if (!approval) {
      // First time: create approval and transition
      if (wf.status !== 'awaiting_approval') {
        transition(wf, 'awaiting_approval')
        emit({ type: 'workflow.status', workflowId: wf.id, status: 'awaiting_approval' })
      }

      approval = createApproval({
        workflowId: wf.id,
        stepId: step.id,
        action: toolName,
        summary: objective,
        risk: toolDef.approval === 'always' ? 'high' : 'medium',
        payloadPreview: Object.keys(toolArgs).length > 0 ? JSON.stringify(toolArgs) : null
      })
      trace(wf.id, 'approval.requested', { stepId: step.id, status: 'start' })
    } else if (approval.status === 'pending' && wf.status !== 'awaiting_approval') {
      // Recovery: approval exists but workflow status wasn't updated
      transition(wf, 'awaiting_approval')
      emit({ type: 'workflow.status', workflowId: wf.id, status: 'awaiting_approval' })
    }

    const decision = await waitForApproval(wf.id, approval, emit)
    trace(wf.id, `approval.${decision}`, { stepId: step.id, status: decision === 'approved' ? 'success' : 'failure' })

    if (decision === 'rejected') {
      updateStep(step.id, { status: 'failed', completedAt: new Date().toISOString() })
      throw new ApprovalRejectedError()
    }

    // Resume executing after approval
    if (wf.status === 'awaiting_approval') {
      transition(wf, 'executing')
      emit({ type: 'workflow.status', workflowId: wf.id, status: 'executing' })
    }
  }

  // Idempotency check — key identifies the logical side effect, not the attempt
  const idemKey = idempotencyKey(wf.id, step.id, toolName)
  const existing = checkIdempotency(idemKey)

  if (existing?.status === 'completed') {
    const result = JSON.parse(existing.result!)
    trace(wf.id, 'tool.idempotent_hit', { stepId: step.id, toolName, status: 'success' })
    return result
  }

  // Execute
  markIdempotencyPending(idemKey)
  emit({ type: 'tool.started', workflowId: wf.id, stepId: step.id, toolName })

  const toolStart = Date.now()
  const toolResult = await executeTool(tools, toolName, toolArgs, { workspacePath })
  const toolDuration = Date.now() - toolStart

  markIdempotencyComplete(idemKey, toolResult)
  trace(wf.id, 'tool.completed', { stepId: step.id, toolName, status: 'success', durationMs: toolDuration })
  emit({ type: 'tool.completed', workflowId: wf.id, stepId: step.id, toolName, durationMs: toolDuration })

  return toolResult
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
  const stepResults: Record<string, unknown> = {}

  // Collect results from already-completed steps
  for (const s of existingSteps) {
    if (s.status === 'completed' && s.toolName && s.outputData) {
      stepResults[s.toolName] = JSON.parse(s.outputData)
    }
  }

  for (const planItem of plan.steps) {
    if (planItem.preferredAction !== 'use_tool' || !planItem.toolName) continue

    // Check if a step already exists for this plan item
    let step = existingSteps.find(s => s.toolName === planItem.toolName && s.type === 'tool')

    if (step?.status === 'completed') {
      // Already done — skip, use persisted result
      if (step.outputData) {
        stepResults[planItem.toolName] = JSON.parse(step.outputData)
      }
      trace(wf.id, 'step.skipped_completed', { stepId: step.id, toolName: planItem.toolName, status: 'success' })
      continue
    }

    if (!step) {
      step = createStep(wf.id, 'tool', planItem.toolName, { objective: planItem.objective })
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
        stepResults[planItem.toolName] = result
        updateStep(step.id, {
          status: 'completed',
          outputData: JSON.stringify(result),
          completedAt: new Date().toISOString()
        })
        emit({ type: 'step.completed', workflowId: wf.id, step: stepToSummary(step) })
      }
    } catch (err) {
      if (err instanceof ApprovalRejectedError) throw err
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
): Promise<void> {
  const { model, emit } = deps

  // Check for existing completed verify step (recovery)
  const existingVerify = existingSteps.find(s => s.type === 'verify' && s.status === 'completed')
  if (existingVerify) {
    trace(wf.id, 'step.skipped_completed', { stepId: existingVerify.id, status: 'success' })
    return
  }

  if (wf.status !== 'verifying') {
    transition(wf, 'verifying')
    trace(wf.id, 'workflow.verifying', { status: 'start' })
    emit({ type: 'workflow.status', workflowId: wf.id, status: 'verifying' })
  }

  const verifyStep = existingSteps.find(s => s.type === 'verify') ?? createStep(wf.id, 'verify')
  updateStep(verifyStep.id, { status: 'running', startedAt: verifyStep.startedAt ?? new Date().toISOString() })

  const verifyStart = Date.now()
  const verifyResult = await model.generateVerification({ goal: wf.goal, stepResults, plan })
  const verifyDuration = Date.now() - verifyStart

  appendUsage({
    workflowId: wf.id,
    stepId: verifyStep.id,
    provider: verifyResult.provider,
    model: verifyResult.model,
    inputTokens: verifyResult.usage.inputTokens,
    outputTokens: verifyResult.usage.outputTokens,
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
}

// ── Run (new workflow) ─────────────────────────────────────────────

export async function runWorkflow(goal: string, deps: OrchestratorDeps): Promise<WorkflowRow> {
  const { model, tools, workspacePath, emit } = deps

  const wf = createWorkflow(goal)
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
    const planResult = await model.generatePlan({ goal, workspacePath, tools: getToolDefinitions(tools) })
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
    await runVerification(wf, plan, stepResults, listSteps(wf.id), deps)

    // Complete
    transition(wf, 'completed')
    const usage = getWorkflowUsage(wf.id)
    trace(wf.id, 'workflow.completed', { status: 'success' })
    emit({ type: 'workflow.completed', workflowId: wf.id, usage })
    emit({ type: 'workflow.status', workflowId: wf.id, status: 'completed' })

    return getWorkflow(wf.id)!
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    try { transition(wf, 'failed') } catch { /* already terminal */ }
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
  const wf = getWorkflow(workflowId)
  if (!wf) throw new Error(`Workflow ${workflowId} not found`)

  const terminalStatuses: WorkflowStatus[] = ['completed', 'failed', 'cancelled']
  if (terminalStatuses.includes(wf.status)) {
    throw new Error(`Cannot resume terminal workflow (status: ${wf.status})`)
  }

  // Trace the recovery
  trace(wf.id, 'workflow.interrupted', {
    status: 'failure',
    metadata: JSON.stringify({ interruptedAt: wf.updatedAt, recoveredStatus: wf.status })
  })
  trace(wf.id, 'workflow.recovered', { status: 'start' })
  emit({ type: 'workflow.status', workflowId: wf.id, status: wf.status })

  const steps = listSteps(wf.id)

  try {
    // Parse the persisted plan (if it exists)
    let plan: PlanOutput | null = null
    if (wf.plan) {
      try {
        plan = JSON.parse(wf.plan)
      } catch {
        throw new Error('Corrupt plan data — cannot recover')
      }
    }

    // Resume based on persisted status
    switch (wf.status) {
      case 'queued': {
        // Restart from planning — effectively a new run but with existing workflow ID
        trace(wf.id, 'workflow.resumed', { status: 'start', metadata: JSON.stringify({ from: 'queued' }) })
        transition(wf, 'planning')
        emit({ type: 'workflow.status', workflowId: wf.id, status: 'planning' })

        const planStep = createStep(wf.id, 'reason')
        updateStep(planStep.id, { status: 'running', startedAt: new Date().toISOString() })

        const planStart = Date.now()
        const planResult = await model.generatePlan({
          goal: wf.goal,
          workspacePath: deps.workspacePath,
          tools: getToolDefinitions(deps.tools)
        })
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
        await runVerification(wf, plan, stepResults, listSteps(wf.id), deps)
        break
      }

      case 'planning': {
        // Plan was interrupted — redo it
        trace(wf.id, 'workflow.resumed', { status: 'start', metadata: JSON.stringify({ from: 'planning' }) })

        // Mark any in-progress plan steps as failed
        for (const s of steps.filter(s => s.type === 'reason' && s.status === 'running')) {
          updateStep(s.id, { status: 'failed', completedAt: new Date().toISOString() })
        }

        const planStep = createStep(wf.id, 'reason')
        updateStep(planStep.id, { status: 'running', startedAt: new Date().toISOString() })

        const planStart = Date.now()
        const planResult = await model.generatePlan({
          goal: wf.goal,
          workspacePath: deps.workspacePath,
          tools: getToolDefinitions(deps.tools)
        })
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
        await runVerification(wf, plan, stepResults, listSteps(wf.id), deps)
        break
      }

      case 'executing':
      case 'awaiting_approval': {
        if (!plan) throw new Error('Cannot resume executing workflow without a plan')

        trace(wf.id, 'workflow.resumed', {
          status: 'start',
          metadata: JSON.stringify({ from: wf.status, completedSteps: steps.filter(s => s.status === 'completed').length })
        })

        // Mark any in-progress (interrupted) tool steps back to pending
        for (const s of steps.filter(s => s.type === 'tool' && s.status === 'running')) {
          updateStep(s.id, { status: 'pending' })
        }

        // If we were awaiting_approval, the approval record is persisted.
        // executePlanSteps will find it via getApprovalForStep and re-present or use it.

        if (wf.status === 'awaiting_approval') {
          // Don't transition — executePlanSteps will handle the approval flow
        } else {
          emit({ type: 'workflow.status', workflowId: wf.id, status: 'executing' })
        }

        const stepResults = await executePlanSteps(wf, plan, listSteps(wf.id), deps)
        await runVerification(wf, plan, stepResults, listSteps(wf.id), deps)
        break
      }

      case 'verifying': {
        if (!plan) throw new Error('Cannot resume verifying workflow without a plan')
        trace(wf.id, 'workflow.resumed', { status: 'start', metadata: JSON.stringify({ from: 'verifying' }) })

        // Collect step results from completed steps
        const stepResults: Record<string, unknown> = {}
        for (const s of steps) {
          if (s.status === 'completed' && s.toolName && s.outputData) {
            stepResults[s.toolName] = JSON.parse(s.outputData)
          }
        }

        await runVerification(wf, plan, stepResults, listSteps(wf.id), deps)
        break
      }

      default:
        throw new Error(`Unexpected workflow status for recovery: ${wf.status}`)
    }

    // Complete
    transition(wf, 'completed')
    const usage = getWorkflowUsage(wf.id)
    trace(wf.id, 'workflow.completed', { status: 'success' })
    emit({ type: 'workflow.completed', workflowId: wf.id, usage })
    emit({ type: 'workflow.status', workflowId: wf.id, status: 'completed' })

    return getWorkflow(wf.id)!
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
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
