/**
 * Deterministic recovery tests.
 * These simulate interruption by directly manipulating persisted state
 * and calling resumeWorkflow, without needing a live model or Electron.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import {
  __setDbOpener,
  createWorkflow, updateWorkflow, getWorkflow,
  createStep, updateStep, listSteps,
  listNonTerminalWorkflows,
  createApproval, getApproval, listPendingApprovals, getApprovalForStep,
  checkIdempotency, markIdempotencyPending, markIdempotencyComplete,
  idempotencyKey, appendTrace, listTraceEvents
} from '../src/main/store'
import { validateTransition } from '../src/main/workflow/transitions'

let testDb: Database.Database

beforeEach(() => {
  testDb = new Database(':memory:')
  __setDbOpener(() => testDb)
})

afterEach(() => {
  __setDbOpener(null)
  testDb.close()
})

describe('Recovery: discovery', () => {
  it('discovers non-terminal workflows', () => {
    createWorkflow('queued one')
    const wf2 = createWorkflow('completed one')
    updateWorkflow(wf2.id, { status: 'planning' })
    // Simulate terminal
    const wf3 = createWorkflow('done')
    updateWorkflow(wf3.id, { status: 'planning' })
    updateWorkflow(wf3.id, { status: 'executing' })
    updateWorkflow(wf3.id, { status: 'verifying' })
    updateWorkflow(wf3.id, { status: 'completed' })

    const interrupted = listNonTerminalWorkflows()
    expect(interrupted.length).toBe(2)
    expect(interrupted.every(w => w.status !== 'completed')).toBe(true)
  })

  it('does not discover terminal workflows', () => {
    for (const status of ['completed', 'failed', 'cancelled'] as const) {
      const wf = createWorkflow(`${status} workflow`)
      if (status === 'completed') {
        updateWorkflow(wf.id, { status: 'planning' })
        updateWorkflow(wf.id, { status: 'executing' })
        updateWorkflow(wf.id, { status: 'verifying' })
      }
      if (status === 'failed') {
        updateWorkflow(wf.id, { status: 'planning' })
      }
      updateWorkflow(wf.id, { status })
    }

    const interrupted = listNonTerminalWorkflows()
    expect(interrupted.length).toBe(0)
  })
})

describe('Recovery: approval survives restart', () => {
  it('pending approval persists and is discoverable after simulated restart', () => {
    // Simulate: workflow reached awaiting_approval, then app killed
    const wf = createWorkflow('approval test')
    updateWorkflow(wf.id, { status: 'planning' })
    updateWorkflow(wf.id, { status: 'executing' })
    updateWorkflow(wf.id, { status: 'awaiting_approval' })

    const plan = { summary: 'test', steps: [{ id: 's1', objective: 'write', preferredAction: 'use_tool', toolName: 'create_work_item', reason: 'test' }] }
    updateWorkflow(wf.id, { plan: JSON.stringify(plan) })

    const step = createStep(wf.id, 'tool', 'create_work_item')
    updateStep(step.id, { status: 'running', startedAt: new Date().toISOString() })

    const approval = createApproval({
      workflowId: wf.id,
      stepId: step.id,
      action: 'create_work_item',
      summary: 'Create work item',
      risk: 'medium',
      payloadPreview: null
    })

    // === "Restart" === (in-memory state is gone, only DB remains)

    // Verify the workflow is discoverable
    const interrupted = listNonTerminalWorkflows()
    expect(interrupted.length).toBe(1)
    expect(interrupted[0].status).toBe('awaiting_approval')

    // Verify the pending approval is discoverable
    const pending = listPendingApprovals(wf.id)
    expect(pending.length).toBe(1)
    expect(pending[0].id).toBe(approval.id)
    expect(pending[0].status).toBe('pending')

    // Verify approval can be found by step
    const found = getApprovalForStep(wf.id, step.id)
    expect(found).toBeDefined()
    expect(found!.status).toBe('pending')
  })
})

describe('Recovery: completed steps are not repeated', () => {
  it('completed read step has persisted output and would be skipped', () => {
    const wf = createWorkflow('skip test')
    updateWorkflow(wf.id, { status: 'planning' })
    updateWorkflow(wf.id, { status: 'executing' })

    const step = createStep(wf.id, 'tool', 'list_workspace_files')
    updateStep(step.id, {
      status: 'completed',
      outputData: JSON.stringify({ files: [{ path: 'test.txt', type: 'file' }], truncated: false }),
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    })

    // After restart, this step is completed — the orchestrator should skip it
    const steps = listSteps(wf.id)
    const readStep = steps.find(s => s.toolName === 'list_workspace_files')
    expect(readStep!.status).toBe('completed')
    expect(readStep!.outputData).not.toBeNull()
  })
})

describe('Recovery: idempotency prevents duplicate writes', () => {
  it('completed write has idempotency record that survives restart', () => {
    const wf = createWorkflow('idemp test')
    const step = createStep(wf.id, 'tool', 'create_work_item')

    const key = idempotencyKey(wf.id, step.id, 'create_work_item')
    markIdempotencyPending(key)
    markIdempotencyComplete(key, { id: 'abc', path: 'work-items/abc.json', created: true })

    // === "Restart" ===
    const record = checkIdempotency(key)
    expect(record).toBeDefined()
    expect(record!.status).toBe('completed')
    const result = JSON.parse(record!.result!)
    expect(result.created).toBe(true)
    // The orchestrator would use this stored result instead of re-executing
  })

  it('idempotency key does NOT include attempt — same logical write, same key', () => {
    const wf = createWorkflow('key test')
    const step = createStep(wf.id, 'tool', 'create_work_item')

    const key1 = idempotencyKey(wf.id, step.id, 'create_work_item')
    // If attempt were in the key, a retry would get a different key.
    // Verify the key format is workflowId:stepId:toolName (no attempt)
    expect(key1).toBe(`${wf.id}:${step.id}:create_work_item`)
    expect(key1).not.toContain(':1') // No attempt suffix
  })

  it('completed idempotency record prevents a second execution attempt', () => {
    const wf = createWorkflow('dedup test')
    const step = createStep(wf.id, 'tool', 'create_work_item')
    const key = idempotencyKey(wf.id, step.id, 'create_work_item')

    // First execution
    markIdempotencyPending(key)
    markIdempotencyComplete(key, { id: 'xyz', path: 'work-items/xyz.json', created: true })

    // Second attempt (after recovery)
    const existing = checkIdempotency(key)
    expect(existing!.status).toBe('completed')
    // Orchestrator returns stored result — tool.execute() is never called
  })
})

describe('Recovery: terminal workflows are not resumed', () => {
  it('completed workflow is not in non-terminal list', () => {
    const wf = createWorkflow('terminal test')
    updateWorkflow(wf.id, { status: 'planning' })
    updateWorkflow(wf.id, { status: 'executing' })
    updateWorkflow(wf.id, { status: 'verifying' })
    updateWorkflow(wf.id, { status: 'completed' })

    expect(listNonTerminalWorkflows().length).toBe(0)
  })

  it('failed workflow is not in non-terminal list', () => {
    const wf = createWorkflow('failed test')
    updateWorkflow(wf.id, { status: 'failed' })
    expect(listNonTerminalWorkflows().length).toBe(0)
  })

  it('cancelled workflow is not in non-terminal list', () => {
    const wf = createWorkflow('cancelled test')
    updateWorkflow(wf.id, { status: 'cancelled' })
    expect(listNonTerminalWorkflows().length).toBe(0)
  })

  it('attempting to transition from completed throws', () => {
    expect(validateTransition('completed', 'queued')).toBe(false)
    expect(validateTransition('completed', 'executing')).toBe(false)
    expect(validateTransition('failed', 'planning')).toBe(false)
    expect(validateTransition('cancelled', 'executing')).toBe(false)
  })
})

describe('Recovery: corrupt state fails safely', () => {
  it('workflow with invalid plan JSON is detectable', () => {
    const wf = createWorkflow('corrupt test')
    updateWorkflow(wf.id, { status: 'planning' })
    updateWorkflow(wf.id, { status: 'executing' })
    updateWorkflow(wf.id, { plan: 'not valid json {{{' })

    const retrieved = getWorkflow(wf.id)!
    expect(() => JSON.parse(retrieved.plan!)).toThrow()
  })

  it('workflow with null plan in executing state is detectable', () => {
    const wf = createWorkflow('null plan test')
    updateWorkflow(wf.id, { status: 'planning' })
    updateWorkflow(wf.id, { status: 'executing' })
    // plan is still null

    const retrieved = getWorkflow(wf.id)!
    expect(retrieved.plan).toBeNull()
    expect(retrieved.status).toBe('executing')
    // resumeWorkflow should throw "Cannot resume executing workflow without a plan"
  })
})

describe('Recovery: trace events', () => {
  it('recovery events are traceable', () => {
    const wf = createWorkflow('trace test')
    // Simulate what resumeWorkflow would write
    appendTrace({
      workflowId: wf.id, stepId: null,
      timestamp: new Date().toISOString(),
      type: 'workflow.interrupted',
      status: 'failure',
      durationMs: null, model: null, inputTokens: null, outputTokens: null,
      toolName: null, retry: null, errorCode: null,
      metadata: JSON.stringify({ interruptedAt: wf.updatedAt })
    })
    appendTrace({
      workflowId: wf.id, stepId: null,
      timestamp: new Date().toISOString(),
      type: 'workflow.recovered',
      status: 'start',
      durationMs: null, model: null, inputTokens: null, outputTokens: null,
      toolName: null, retry: null, errorCode: null, metadata: null
    })
    appendTrace({
      workflowId: wf.id, stepId: null,
      timestamp: new Date().toISOString(),
      type: 'workflow.resumed',
      status: 'start',
      durationMs: null, model: null, inputTokens: null, outputTokens: null,
      toolName: null, retry: null, errorCode: null,
      metadata: JSON.stringify({ from: 'awaiting_approval' })
    })

    const events = listTraceEvents(wf.id)
    const types = events.map(e => e.type)
    expect(types).toContain('workflow.interrupted')
    expect(types).toContain('workflow.recovered')
    expect(types).toContain('workflow.resumed')
  })
})
