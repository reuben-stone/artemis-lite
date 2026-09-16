import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import Database from 'better-sqlite3'
import { buildContext } from '../src/main/context/builder'
import {
  estimateTokens, contentHash, excerpt, toPersistedItem
} from '../src/main/context/types'
import { gatherRepositoryEvidence } from '../src/main/context/repo-evidence'
import {
  __setDbOpener,
  appendContextPacket, listContextPackets, createWorkflow
} from '../src/main/store'

let testDir: string
let testDb: Database.Database

beforeEach(() => {
  testDir = join(tmpdir(), `artemis-context-test-${Date.now()}`)
  mkdirSync(join(testDir, 'src'), { recursive: true })
  writeFileSync(join(testDir, 'README.md'), '# Test Project\nA test project for context tests.')
  writeFileSync(join(testDir, 'package.json'), '{ "name": "test", "version": "1.0.0" }')
  writeFileSync(join(testDir, 'src', 'main.ts'), 'export function main() {\n  console.log("hello")\n}\n')
  writeFileSync(join(testDir, 'src', 'workflow.ts'), 'export function runWorkflow() {\n  // workflow logic\n}\n')

  testDb = new Database(':memory:')
  __setDbOpener(() => testDb)
})

afterEach(() => {
  __setDbOpener(null)
  testDb.close()
  if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true })
})

// ── Token estimation ───────────────────────────────────────────────

describe('estimateTokens', () => {
  it('estimates roughly 1 token per 4 chars', () => {
    expect(estimateTokens('hello world')).toBe(3) // 11 chars / 4 = 2.75 → 3
  })

  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0)
  })

  it('rounds up', () => {
    expect(estimateTokens('a')).toBe(1) // 1/4 → 0.25 → 1
  })
})

// ── Provenance helpers ─────────────────────────────────────────────

describe('contentHash', () => {
  it('produces consistent 16-char hash', () => {
    const h = contentHash('hello world')
    expect(h).toHaveLength(16)
    expect(contentHash('hello world')).toBe(h) // deterministic
  })

  it('different content produces different hash', () => {
    expect(contentHash('a')).not.toBe(contentHash('b'))
  })
})

describe('excerpt', () => {
  it('returns full content if short', () => {
    expect(excerpt('short')).toBe('short')
  })

  it('truncates with ellipsis at 500 chars by default', () => {
    const long = 'x'.repeat(600)
    const result = excerpt(long)
    expect(result).toHaveLength(503) // 500 + '...'
    expect(result.endsWith('...')).toBe(true)
  })
})

describe('toPersistedItem', () => {
  it('converts runtime item to compact form', () => {
    const item = {
      source: 'file' as const,
      identifier: 'src/main.ts',
      reason: 'keyword match',
      content: 'export function main() {}',
      estimatedTokens: 7,
      truncated: false
    }
    const persisted = toPersistedItem(item)
    expect(persisted.contentHash).toHaveLength(16)
    expect(persisted.excerpt).toBe('export function main() {}')
    expect(persisted.content).toBeUndefined() // no full content in persisted form
    expect(persisted.identifier).toBe('src/main.ts')
    expect(persisted.reason).toBe('keyword match')
  })
})

// ── Repository evidence retrieval ──────────────────────────────────

describe('gatherRepositoryEvidence', () => {
  it('discovers files in workspace', async () => {
    const { evidence } = await gatherRepositoryEvidence({
      workspacePath: testDir,
      goal: 'test the workflow',
      budgetTokens: 5000
    })
    expect(evidence.length).toBeGreaterThan(0)
  })

  it('ranks files by keyword relevance', async () => {
    const { evidence } = await gatherRepositoryEvidence({
      workspacePath: testDir,
      goal: 'fix the workflow logic',
      budgetTokens: 5000
    })
    // workflow.ts should score higher than main.ts for "workflow" keyword
    const workflowIdx = evidence.findIndex(e => e.identifier.includes('workflow'))
    const mainIdx = evidence.findIndex(e => e.identifier.includes('main'))
    if (workflowIdx >= 0 && mainIdx >= 0) {
      expect(workflowIdx).toBeLessThan(mainIdx)
    }
  })

  it('respects budget limit', async () => {
    const { evidence, excludedFiles } = await gatherRepositoryEvidence({
      workspacePath: testDir,
      goal: 'everything',
      budgetTokens: 50  // very small budget
    })
    // Should include at most a few small files
    const totalTokens = evidence.reduce((sum, e) => sum + e.estimatedTokens, 0)
    expect(totalTokens).toBeLessThanOrEqual(50)
  })

  it('excludes binary/ignored files', async () => {
    writeFileSync(join(testDir, 'image.png'), Buffer.alloc(100))
    const { excludedFiles } = await gatherRepositoryEvidence({
      workspacePath: testDir,
      goal: 'test',
      budgetTokens: 5000
    })
    const binaryExcluded = excludedFiles.find(e => e.identifier === 'image.png')
    expect(binaryExcluded).toBeDefined()
    expect(binaryExcluded!.reason).toBe('binary_file')
  })

  it('excludes node_modules', async () => {
    mkdirSync(join(testDir, 'node_modules', 'foo'), { recursive: true })
    writeFileSync(join(testDir, 'node_modules', 'foo', 'index.js'), 'module.exports = {}')
    const { evidence } = await gatherRepositoryEvidence({
      workspacePath: testDir,
      goal: 'test',
      budgetTokens: 5000
    })
    const nmFile = evidence.find(e => e.identifier.includes('node_modules'))
    expect(nmFile).toBeUndefined()
  })

  it('records exclusion reasons', async () => {
    const { excludedFiles } = await gatherRepositoryEvidence({
      workspacePath: testDir,
      goal: 'test',
      budgetTokens: 5000
    })
    // Every excluded item should have a reason
    for (const ex of excludedFiles) {
      expect(['not_relevant', 'budget_exceeded', 'unsupported', 'too_large', 'binary_file']).toContain(ex.reason)
    }
  })
})

// ── Context builder ────────────────────────────────────────────────

describe('buildContext', () => {
  it('always includes goal', async () => {
    const packet = await buildContext({
      workflowId: 'wf-1',
      stepId: 'step-1',
      phase: 'plan',
      goal: 'Fix the bug',
      workspacePath: testDir
    })
    const goalItem = packet.items.find(i => i.source === 'goal')
    expect(goalItem).toBeDefined()
    expect(goalItem!.content).toBe('Fix the bug')
  })

  it('includes current step if provided', async () => {
    const packet = await buildContext({
      workflowId: 'wf-1',
      stepId: 'step-1',
      phase: 'plan',
      goal: 'Test',
      workspacePath: testDir,
      currentStep: { type: 'reason', objective: 'Create plan' }
    })
    const stepItem = packet.items.find(i => i.source === 'step')
    expect(stepItem).toBeDefined()
    expect(stepItem!.content).toContain('Create plan')
  })

  it('includes repository evidence for plan phase', async () => {
    const packet = await buildContext({
      workflowId: 'wf-1',
      stepId: 'step-1',
      phase: 'plan',
      goal: 'Fix the workflow',
      workspacePath: testDir
    })
    const fileItems = packet.items.filter(i => i.source === 'file')
    expect(fileItems.length).toBeGreaterThan(0)
  })

  it('does NOT include repo evidence for verify phase', async () => {
    const packet = await buildContext({
      workflowId: 'wf-1',
      stepId: 'step-1',
      phase: 'verify',
      goal: 'Test',
      workspacePath: testDir,
      toolEvidence: { list_workspace_files: { files: ['a.txt'] } }
    })
    const fileItems = packet.items.filter(i => i.source === 'file')
    expect(fileItems.length).toBe(0)
  })

  it('includes tool evidence for verify phase', async () => {
    const packet = await buildContext({
      workflowId: 'wf-1',
      stepId: 'step-1',
      phase: 'verify',
      goal: 'Test',
      workspacePath: testDir,
      toolEvidence: { create_work_item: { id: 'abc', created: true } }
    })
    const toolItem = packet.items.find(i => i.source === 'tool_result')
    expect(toolItem).toBeDefined()
  })

  it('enforces total budget', async () => {
    // Add more files to make budget pressure real
    for (let i = 0; i < 20; i++) {
      writeFileSync(join(testDir, `src/file${i}.ts`), `export const data${i} = "${'x'.repeat(200)}";\n`)
    }
    const packet = await buildContext({
      workflowId: 'wf-1',
      stepId: 'step-1',
      phase: 'plan',
      goal: 'Test all files',
      workspacePath: testDir,
      budget: 200  // tight budget with many files
    })
    expect(packet.budget.used).toBeLessThanOrEqual(200)
    // With 20+ files and 200 token budget, some must be excluded
    expect(packet.excluded.length).toBeGreaterThan(0)
  })

  it('tracks budget correctly', async () => {
    const packet = await buildContext({
      workflowId: 'wf-1',
      stepId: 'step-1',
      phase: 'plan',
      goal: 'Test',
      workspacePath: testDir,
      budget: 8000
    })
    expect(packet.budget.limit).toBe(8000)
    expect(packet.budget.used).toBe(packet.estimatedTokens)
    expect(packet.budget.remaining).toBe(8000 - packet.budget.used)
  })

  it('all included items have provenance', async () => {
    const packet = await buildContext({
      workflowId: 'wf-1',
      stepId: 'step-1',
      phase: 'plan',
      goal: 'Fix workflow',
      workspacePath: testDir
    })
    for (const item of packet.items) {
      expect(item.source).toBeTruthy()
      expect(item.identifier).toBeTruthy()
      expect(item.reason).toBeTruthy()
      expect(item.estimatedTokens).toBeGreaterThan(0)
      expect(typeof item.truncated).toBe('boolean')
    }
  })
})

// ── Context persistence ────────────────────────────────────────────

describe('Context packet persistence', () => {
  it('persists and retrieves context packets', () => {
    const wf = createWorkflow('Test goal')
    const row = appendContextPacket({
      workflowId: wf.id,
      stepId: 'step-1',
      phase: 'plan',
      composition: JSON.stringify({ items: [], excluded: [], budget: { limit: 8000, used: 500, remaining: 7500 } }),
      estimatedTokens: 500,
      providerInputTokens: null,
      createdAt: new Date().toISOString()
    })

    const packets = listContextPackets(wf.id)
    expect(packets.length).toBe(1)
    expect(packets[0].id).toBe(row.id)
    expect(packets[0].estimatedTokens).toBe(500)
  })

  it('separates estimated and provider tokens', () => {
    const wf = createWorkflow('Test goal')
    const row = appendContextPacket({
      workflowId: wf.id,
      stepId: 'step-1',
      phase: 'plan',
      composition: '{}',
      estimatedTokens: 500,
      providerInputTokens: 612,
      createdAt: new Date().toISOString()
    })

    const packets = listContextPackets(wf.id)
    expect(packets[0].estimatedTokens).toBe(500)
    expect(packets[0].providerInputTokens).toBe(612)
  })
})
