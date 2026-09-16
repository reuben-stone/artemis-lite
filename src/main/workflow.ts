/**
 * Workflow state machine and orchestrator.
 * Deterministic shell: the application owns lifecycle, persistence,
 * approvals, and tracing. The model owns only bounded reasoning.
 */
import {
  createWorkflow, updateWorkflow, getWorkflow,
  createStep, updateStep, listSteps,
  appendTrace, createApproval, resolveApproval, getApproval,
  checkIdempotency, markIdempotencyPending, markIdempotencyComplete,
  appendUsage, getWorkflowUsage
} from './store'
import type { WorkflowRow, StepRow } from './store'
import type { ModelProvider, ModelResult, PlanOutput, VerificationOutput } from './model/types'
import { executeTool, getToolDefinitions, type ToolRegistry } from './tools/registry'
import type { WorkflowStatus, RendererEvent } from '../shared/ipc'
import { validateTransition } from './workflow/transitions'

export { validateTransition }

function transition(wf: WorkflowRow, to: WorkflowStatus): void {
  if (!validateTransition(wf.status as WorkflowStatus, to)) {
    throw new Error(`Invalid transition: ${wf.status} → ${to}`)
  }
  updateWorkflow(wf.id, { status: to })
  wf.status = to
}

// ── Emit helper ────────────────────────────────────────────────────

type Emit = (event: RendererEvent) => void

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

// ── Orchestrator ───────────────────────────────────────────────────

export interface OrchestratorDeps {
  model: ModelProvider
  tools: ToolRegistry
  workspacePath: string
  emit: Emit
}

// Map of workflowId → approval resolution promise
const pendingApprovalResolvers = new Map<string, { resolve: (decision: 'approved' | 'rejected') => void; approvalId: string }>()

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

export async function runWorkflow(goal: string, deps: OrchestratorDeps): Promise<WorkflowRow> {
  const { model, tools, workspacePath, emit } = deps

  // 1. Create and persist
  const wf = createWorkflow(goal)
  trace(wf.id, 'workflow.created', { status: 'start' })
  emit({ type: 'workflow.status', workflowId: wf.id, status: 'queued' })

  try {
    // 2. Planning
    transition(wf, 'planning')
    trace(wf.id, 'workflow.planning', { status: 'start' })
    emit({ type: 'workflow.status', workflowId: wf.id, status: 'planning' })

    const planStep = createStep(wf.id, 'reason')
    updateStep(planStep.id, { status: 'running', startedAt: new Date().toISOString() })

    const planStart = Date.now()
    const planResult = await model.generatePlan({
      goal,
      workspacePath,
      tools: getToolDefinitions(tools)
    })
    const planDuration = Date.now() - planStart

    // Persist usage
    appendUsage({
      workflowId: wf.id,
      stepId: planStep.id,
      provider: planResult.provider,
      model: planResult.model,
      inputTokens: planResult.usage.inputTokens,
      outputTokens: planResult.usage.outputTokens,
      estimatedCost: planResult.usage.estimatedCost ?? null,
      timestamp: new Date().toISOString()
    })

    trace(wf.id, 'model.plan', {
      stepId: planStep.id,
      status: 'success',
      durationMs: planDuration,
      model: planResult.model,
      inputTokens: planResult.usage.inputTokens,
      outputTokens: planResult.usage.outputTokens
    })

    const plan = planResult.data
    updateWorkflow(wf.id, { plan: JSON.stringify(plan) })
    updateStep(planStep.id, {
      status: 'completed',
      outputData: JSON.stringify(plan),
      completedAt: new Date().toISOString()
    })

    trace(wf.id, 'plan.validated', { status: 'success' })
    emit({ type: 'step.completed', workflowId: wf.id, step: stepToSummary(planStep) })

    // Emit plan text to renderer
    emit({ type: 'model.text', workflowId: wf.id, text: plan.summary })

    // 3. Executing
    transition(wf, 'executing')
    trace(wf.id, 'workflow.executing', { status: 'start' })
    emit({ type: 'workflow.status', workflowId: wf.id, status: 'executing' })

    // Create steps from plan
    const stepResults: Record<string, unknown> = {}
    for (const planItem of plan.steps) {
      if (planItem.preferredAction === 'use_tool' && planItem.toolName) {
        const step = createStep(wf.id, 'tool', planItem.toolName, { objective: planItem.objective })
        updateWorkflow(wf.id, { currentStepId: step.id })
        updateStep(step.id, { status: 'running', startedAt: new Date().toISOString() })

        emit({ type: 'step.started', workflowId: wf.id, step: stepToSummary(step) })
        trace(wf.id, 'tool.started', { stepId: step.id, toolName: planItem.toolName, status: 'start' })

        const toolDef = tools.get(planItem.toolName)
        if (!toolDef) {
          updateStep(step.id, { status: 'failed', completedAt: new Date().toISOString() })
          trace(wf.id, 'tool.failed', { stepId: step.id, toolName: planItem.toolName, status: 'failure', errorCode: 'unknown_tool' })
          continue
        }

        // Approval gate for write tools
        if (toolDef.approval === 'write' || toolDef.approval === 'always') {
          transition(wf, 'awaiting_approval')
          emit({ type: 'workflow.status', workflowId: wf.id, status: 'awaiting_approval' })

          const approval = createApproval({
            workflowId: wf.id,
            stepId: step.id,
            action: planItem.toolName,
            summary: planItem.objective,
            risk: toolDef.approval === 'always' ? 'high' : 'medium',
            payloadPreview: planItem.toolArgs ? JSON.stringify(planItem.toolArgs) : null
          })

          trace(wf.id, 'approval.requested', { stepId: step.id, status: 'start' })
          emit({
            type: 'approval.requested',
            approval: {
              id: approval.id,
              workflowId: wf.id,
              stepId: step.id,
              action: planItem.toolName,
              summary: planItem.objective,
              risk: approval.risk as 'low' | 'medium' | 'high',
              payloadPreview: planItem.toolArgs ?? null,
              status: 'pending'
            }
          })

          // Wait for user decision
          const decision = await new Promise<'approved' | 'rejected'>((resolve) => {
            pendingApprovalResolvers.set(wf.id, { resolve, approvalId: approval.id })
          })

          trace(wf.id, `approval.${decision}`, { stepId: step.id, status: decision === 'approved' ? 'success' : 'failure' })

          if (decision === 'rejected') {
            updateStep(step.id, { status: 'failed', completedAt: new Date().toISOString() })
            transition(wf, 'failed')
            trace(wf.id, 'workflow.failed', { status: 'failure', errorCode: 'approval_rejected' })
            emit({ type: 'workflow.failed', workflowId: wf.id, error: 'Approval rejected by user' })
            return getWorkflow(wf.id)!
          }

          // Resume executing after approval
          transition(wf, 'executing')
          emit({ type: 'workflow.status', workflowId: wf.id, status: 'executing' })
        }

        // Idempotency check
        const idempotencyKey = `${wf.id}:${step.id}:${planItem.toolName}:${step.attempt}`
        const existing = checkIdempotency(idempotencyKey)
        let toolResult: unknown

        if (existing?.status === 'completed') {
          toolResult = JSON.parse(existing.result!)
          trace(wf.id, 'tool.idempotent_hit', { stepId: step.id, toolName: planItem.toolName, status: 'success' })
        } else {
          markIdempotencyPending(idempotencyKey)
          emit({ type: 'tool.started', workflowId: wf.id, stepId: step.id, toolName: planItem.toolName })

          const toolStart = Date.now()
          try {
            toolResult = await executeTool(tools, planItem.toolName, planItem.toolArgs ?? {}, { workspacePath })
            const toolDuration = Date.now() - toolStart

            markIdempotencyComplete(idempotencyKey, toolResult)
            trace(wf.id, 'tool.completed', {
              stepId: step.id,
              toolName: planItem.toolName,
              status: 'success',
              durationMs: toolDuration
            })
            emit({ type: 'tool.completed', workflowId: wf.id, stepId: step.id, toolName: planItem.toolName, durationMs: toolDuration })
          } catch (err) {
            const toolDuration = Date.now() - toolStart
            const errMsg = err instanceof Error ? err.message : String(err)
            trace(wf.id, 'tool.failed', {
              stepId: step.id,
              toolName: planItem.toolName,
              status: 'failure',
              durationMs: toolDuration,
              errorCode: errMsg
            })
            updateStep(step.id, { status: 'failed', completedAt: new Date().toISOString() })
            continue
          }
        }

        stepResults[planItem.toolName] = toolResult
        updateStep(step.id, {
          status: 'completed',
          outputData: JSON.stringify(toolResult),
          completedAt: new Date().toISOString()
        })
        emit({ type: 'step.completed', workflowId: wf.id, step: stepToSummary(step) })
      }
    }

    // 4. Verifying
    transition(wf, 'verifying')
    trace(wf.id, 'workflow.verifying', { status: 'start' })
    emit({ type: 'workflow.status', workflowId: wf.id, status: 'verifying' })

    const verifyStep = createStep(wf.id, 'verify')
    updateStep(verifyStep.id, { status: 'running', startedAt: new Date().toISOString() })

    const verifyStart = Date.now()
    const verifyResult = await model.generateVerification({
      goal,
      stepResults,
      plan
    })
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

    // 5. Complete
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
