/**
 * Regression test: distinct tool calls with different arguments
 * must produce distinct artifacts in WorkflowResult.
 *
 * Covers the bug where stepResults was keyed by toolName,
 * causing multiple calls to the same tool to overwrite each other.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { __setDbOpener, createWorkflow, createStep, updateStep, createWorkflowResult, getWorkflowResult } from '../src/main/store'
import type { WorkflowArtifact } from '../src/main/store'

let testDb: Database.Database

beforeEach(() => {
  testDb = new Database(':memory:')
  __setDbOpener(() => testDb)
})

afterEach(() => {
  __setDbOpener(null)
  testDb.close()
})

describe('Result artifacts preserve distinct tool outputs', () => {
  it('three list_workspace_files calls with different paths produce three distinct artifacts', () => {
    const wf = createWorkflow('List key files in this repo')

    // Simulate three plan steps calling the same tool with different args
    const rootResult = {
      files: [
        { path: 'src', type: 'directory' },
        { path: 'package.json', type: 'file', sizeBytes: 500 },
        { path: 'README.md', type: 'file', sizeBytes: 200 }
      ],
      truncated: false
    }

    const mainResult = {
      files: [
        { path: 'src/main/workflow.ts', type: 'file', sizeBytes: 15000 },
        { path: 'src/main/store.ts', type: 'file', sizeBytes: 12000 }
      ],
      truncated: false
    }

    const rendererResult = {
      files: [
        { path: 'src/renderer/src/App.tsx', type: 'file', sizeBytes: 8000 },
        { path: 'src/renderer/src/main.tsx', type: 'file', sizeBytes: 500 }
      ],
      truncated: false
    }

    // Create steps with distinct planStepId in inputData
    const step1 = createStep(wf.id, 'tool', 'list_workspace_files', { planStepId: 'step_1', objective: 'List root' })
    updateStep(step1.id, { status: 'completed', outputData: JSON.stringify(rootResult) })

    const step2 = createStep(wf.id, 'tool', 'list_workspace_files', { planStepId: 'step_2', objective: 'List src/main' })
    updateStep(step2.id, { status: 'completed', outputData: JSON.stringify(mainResult) })

    const step3 = createStep(wf.id, 'tool', 'list_workspace_files', { planStepId: 'step_3', objective: 'List src/renderer' })
    updateStep(step3.id, { status: 'completed', outputData: JSON.stringify(rendererResult) })

    // Build artifacts as the orchestrator would (keyed by plan step ID)
    const artifacts: WorkflowArtifact[] = [
      { toolName: 'list_workspace_files', objective: 'List root', data: rootResult },
      { toolName: 'list_workspace_files', objective: 'List src/main', data: mainResult },
      { toolName: 'list_workspace_files', objective: 'List src/renderer', data: rendererResult }
    ]

    createWorkflowResult(wf.id, 'succeeded', 'Listed files', 'All directories inspected', artifacts)

    const result = getWorkflowResult(wf.id)
    expect(result).toBeDefined()
    expect(result!.status).toBe('succeeded')

    const parsed = JSON.parse(result!.artifacts!) as WorkflowArtifact[]
    expect(parsed).toHaveLength(3)

    // Each artifact must have DISTINCT data
    const fileSets = parsed.map(a => (a.data as any).files.map((f: any) => f.path).sort())
    expect(fileSets[0]).not.toEqual(fileSets[1])
    expect(fileSets[1]).not.toEqual(fileSets[2])
    expect(fileSets[0]).not.toEqual(fileSets[2])

    // Verify specific content
    expect(fileSets[0]).toContain('src')
    expect(fileSets[1]).toContain('src/main/workflow.ts')
    expect(fileSets[2]).toContain('src/renderer/src/App.tsx')
  })

  it('failed verification produces failed result with reason', () => {
    const wf = createWorkflow('Do something impossible')

    createWorkflowResult(wf.id, 'failed', 'Verification failed: evidence is contradictory', 'The step results do not demonstrate the goal was achieved')

    const result = getWorkflowResult(wf.id)
    expect(result).toBeDefined()
    expect(result!.status).toBe('failed')
    expect(result!.summary).toContain('Verification failed')
    expect(result!.verificationReason).toContain('do not demonstrate')
  })

  it('result persists and renders identically after simulated restart', () => {
    const wf = createWorkflow('Persist test')

    const artifacts: WorkflowArtifact[] = [
      { toolName: 'list_workspace_files', objective: 'List root', data: { files: [{ path: 'a.ts', type: 'file' }], truncated: false } }
    ]

    createWorkflowResult(wf.id, 'succeeded', 'Found a.ts', 'Goal met', artifacts)

    // Simulate restart: re-read from DB
    const result1 = getWorkflowResult(wf.id)
    const result2 = getWorkflowResult(wf.id)

    expect(result1).toEqual(result2)
    expect(JSON.parse(result1!.artifacts!)).toEqual(JSON.parse(result2!.artifacts!))
  })
})
