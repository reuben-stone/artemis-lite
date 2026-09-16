import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import {
  __setDbOpener,
  createWorkflow, getWorkflow, listWorkflows, updateWorkflow,
  createStep, getStep, listSteps, updateStep,
  appendTrace, listTraceEvents,
  createApproval, resolveApproval, getApproval, listPendingApprovals,
  appendUsage, getWorkflowUsage
} from '../src/main/store'

let testDb: Database.Database

beforeEach(() => {
  testDb = new Database(':memory:')
  __setDbOpener(() => testDb)
})

afterEach(() => {
  __setDbOpener(null)
  testDb.close()
})

describe('Workflow CRUD', () => {
  it('creates and retrieves a workflow', () => {
    const wf = createWorkflow('Test goal')
    expect(wf.goal).toBe('Test goal')
    expect(wf.status).toBe('queued')

    const retrieved = getWorkflow(wf.id)
    expect(retrieved).not.toBeNull()
    expect(retrieved!.goal).toBe('Test goal')
  })

  it('lists workflows in descending order', () => {
    createWorkflow('First')
    createWorkflow('Second')
    const list = listWorkflows()
    expect(list.length).toBe(2)
    const goals = list.map(w => w.goal)
    expect(goals).toContain('First')
    expect(goals).toContain('Second')
  })

  it('updates workflow status', () => {
    const wf = createWorkflow('Update test')
    updateWorkflow(wf.id, { status: 'planning' })
    const retrieved = getWorkflow(wf.id)
    expect(retrieved!.status).toBe('planning')
  })

  it('updates workflow plan', () => {
    const wf = createWorkflow('Plan test')
    const plan = JSON.stringify({ summary: 'test', steps: [] })
    updateWorkflow(wf.id, { plan })
    const retrieved = getWorkflow(wf.id)
    expect(retrieved!.plan).toBe(plan)
  })
})

describe('Step CRUD', () => {
  it('creates and lists steps', () => {
    const wf = createWorkflow('Step test')
    createStep(wf.id, 'reason')
    createStep(wf.id, 'tool', 'list_workspace_files')
    const steps = listSteps(wf.id)
    expect(steps.length).toBe(2)
    expect(steps[0].type).toBe('reason')
    expect(steps[1].toolName).toBe('list_workspace_files')
  })

  it('updates step status', () => {
    const wf = createWorkflow('Step update test')
    const step = createStep(wf.id, 'tool', 'create_work_item')
    updateStep(step.id, { status: 'running', startedAt: new Date().toISOString() })
    const retrieved = getStep(step.id)
    expect(retrieved!.status).toBe('running')
    expect(retrieved!.startedAt).not.toBeNull()
  })
})

describe('Trace events', () => {
  it('appends and lists trace events', () => {
    const wf = createWorkflow('Trace test')
    appendTrace({
      workflowId: wf.id,
      stepId: null,
      timestamp: new Date().toISOString(),
      type: 'workflow.created',
      status: 'start',
      durationMs: null,
      model: null,
      inputTokens: null,
      outputTokens: null,
      toolName: null,
      retry: null,
      errorCode: null,
      metadata: null
    })
    appendTrace({
      workflowId: wf.id,
      stepId: null,
      timestamp: new Date().toISOString(),
      type: 'model.plan',
      status: 'success',
      durationMs: 1500,
      model: 'claude-sonnet',
      inputTokens: 2000,
      outputTokens: 300,
      toolName: null,
      retry: null,
      errorCode: null,
      metadata: null
    })
    const events = listTraceEvents(wf.id)
    expect(events.length).toBe(2)
    expect(events[1].type).toBe('model.plan')
    expect(events[1].inputTokens).toBe(2000)
  })
})

describe('Approvals', () => {
  it('creates pending approval', () => {
    const wf = createWorkflow('Approval test')
    const step = createStep(wf.id, 'tool', 'create_work_item')
    const approval = createApproval({
      workflowId: wf.id,
      stepId: step.id,
      action: 'create_work_item',
      summary: 'Create a work item',
      risk: 'medium',
      payloadPreview: JSON.stringify({ title: 'Test' })
    })
    expect(approval.status).toBe('pending')
    expect(listPendingApprovals(wf.id).length).toBe(1)
  })

  it('resolves approval', () => {
    const wf = createWorkflow('Resolve test')
    const step = createStep(wf.id, 'tool', 'create_work_item')
    const approval = createApproval({
      workflowId: wf.id,
      stepId: step.id,
      action: 'create_work_item',
      summary: 'Create',
      risk: 'medium',
      payloadPreview: null
    })
    resolveApproval(approval.id, 'approved')
    const resolved = getApproval(approval.id)
    expect(resolved!.status).toBe('approved')
    expect(resolved!.resolvedAt).not.toBeNull()
    expect(listPendingApprovals(wf.id).length).toBe(0)
  })
})

describe('Usage records', () => {
  it('appends and aggregates usage', () => {
    const wf = createWorkflow('Usage test')
    appendUsage({
      workflowId: wf.id,
      stepId: null,
      provider: 'anthropic',
      model: 'claude-sonnet',
      inputTokens: 2000,
      outputTokens: 300,
      estimatedCost: 0.0105,
      timestamp: new Date().toISOString()
    })
    appendUsage({
      workflowId: wf.id,
      stepId: null,
      provider: 'anthropic',
      model: 'claude-sonnet',
      inputTokens: 1500,
      outputTokens: 200,
      estimatedCost: 0.0075,
      timestamp: new Date().toISOString()
    })
    const usage = getWorkflowUsage(wf.id)
    expect(usage.modelCalls).toBe(2)
    expect(usage.inputTokens).toBe(3500)
    expect(usage.outputTokens).toBe(500)
    expect(usage.estimatedCost).toBeCloseTo(0.018)
  })
})
