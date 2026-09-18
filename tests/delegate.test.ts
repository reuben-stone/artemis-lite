/**
 * Delegation adapter tests.
 *
 * Tests prompt construction, verification parsing, worktree paths,
 * dispatch detection, and the engine result interface.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { execSync } from 'child_process'
import { PlanSchema } from '../src/main/model/types'
import { buildTaskPrompt, buildSystemPrompt } from '../src/main/delegate/claude-code'
import { runDeterministicVerification } from '../src/main/delegate/verification'

// ── Prompt construction ───────────────────────────────────────────

describe('buildTaskPrompt', () => {
  it('builds a prompt with Sentry evidence', () => {
    const prompt = buildTaskPrompt('Fix the ByteString error', {
      title: 'TypeError: Cannot convert argument to a ByteString',
      errorType: 'TypeError',
      errorValue: 'Cannot convert argument to a ByteString',
      culprit: 'worker/scanner.js',
      count: '4',
      firstSeen: '2026-09-15',
      lastSeen: '2026-09-18'
    })

    expect(prompt).toContain('## Production Issue')
    expect(prompt).toContain('TypeError')
    expect(prompt).toContain('ByteString')
    expect(prompt).toContain('worker/scanner.js')
    expect(prompt).toContain('4 events')
    expect(prompt).toContain('## Goal')
    expect(prompt).toContain('Fix the ByteString error')
  })

  it('builds a prompt without Sentry evidence', () => {
    const prompt = buildTaskPrompt('Investigate the auth failure')
    expect(prompt).not.toContain('## Production Issue')
    expect(prompt).toContain('## Goal')
    expect(prompt).toContain('Investigate the auth failure')
  })
})

describe('buildSystemPrompt', () => {
  it('includes key constraints', () => {
    const prompt = buildSystemPrompt()
    expect(prompt).toContain('Do not push')
    expect(prompt).toContain('Do not add new dependencies')
    expect(prompt).toContain('Commit your changes')
    expect(prompt).toContain('minimal and focused')
  })
})

// ── Plan detection ────────────────────────────────────────────────

describe('delegate_engineering plan detection', () => {
  it('recognizes a delegation plan', () => {
    const plan = PlanSchema.parse({
      summary: 'Fix ByteString error by delegating to coding agent',
      steps: [{
        id: 'step_1',
        objective: 'Fix the TypeError in worker/scanner.js caused by non-ASCII character in HTTP header',
        preferredAction: 'delegate_engineering',
        reason: 'Code change required, delegate to specialised coding agent'
      }]
    })

    const isDelegated = plan.steps.length === 1 && plan.steps[0].preferredAction === 'delegate_engineering'
    expect(isDelegated).toBe(true)
  })

  it('does not confuse with investigate', () => {
    const plan = PlanSchema.parse({
      summary: 'Investigate the error',
      steps: [{
        id: 'step_1',
        objective: 'Find root cause',
        preferredAction: 'investigate',
        reason: 'Need exploration'
      }]
    })

    const isDelegated = plan.steps.length === 1 && plan.steps[0].preferredAction === 'delegate_engineering'
    expect(isDelegated).toBe(false)
  })
})

// ── Deterministic verification ────────────────────────────────────

describe('runDeterministicVerification', () => {
  let testDir: string
  let baseCommit: string

  beforeEach(() => {
    testDir = join(tmpdir(), `artemis-delegate-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(testDir, { recursive: true })

    // Init a git repo with a base commit
    execSync('git init --initial-branch=main', { cwd: testDir })
    execSync('git config user.email "test@test.com"', { cwd: testDir })
    execSync('git config user.name "Test"', { cwd: testDir })
    writeFileSync(join(testDir, 'index.ts'), 'export const x = 1\n')
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({
      name: 'test-project',
      scripts: { test: 'echo "tests pass"' }
    }))
    execSync('git add -A && git commit -m "initial"', { cwd: testDir })
    baseCommit = execSync('git rev-parse HEAD', { cwd: testDir }).toString().trim()
  })

  afterEach(() => {
    try {
      if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true })
    } catch { /* best effort */ }
  })

  it('detects changed files against baseCommit', async () => {
    // Make a change and commit
    writeFileSync(join(testDir, 'index.ts'), 'export const x = 2\n')
    execSync('git add -A && git commit -m "fix"', { cwd: testDir })

    const result = await runDeterministicVerification(testDir, baseCommit)
    expect(result.diff.files).toContain('index.ts')
    expect(result.diff.additions).toBeGreaterThan(0)
    expect(result.gitState.commitCount).toBe(1)
    expect(result.gitState.hasUncommittedChanges).toBe(false)
  })

  it('detects uncommitted changes', async () => {
    writeFileSync(join(testDir, 'index.ts'), 'export const x = 2\n')
    // Don't commit

    const result = await runDeterministicVerification(testDir, baseCommit)
    expect(result.gitState.hasUncommittedChanges).toBe(true)
    expect(result.diff.files.length).toBeGreaterThan(0)
  })

  it('reports no changes when nothing changed', async () => {
    const result = await runDeterministicVerification(testDir, baseCommit)
    expect(result.diff.files).toHaveLength(0)
    expect(result.gitState.commitCount).toBe(0)
  })

  it('runs test script from package.json', async () => {
    writeFileSync(join(testDir, 'index.ts'), 'export const x = 2\n')
    execSync('git add -A && git commit -m "fix"', { cwd: testDir })

    const result = await runDeterministicVerification(testDir, baseCommit)
    const testCheck = result.checks.find(c => c.check === 'test')
    expect(testCheck).toBeDefined()
    expect(testCheck!.skipped).toBe(false)
    expect(testCheck!.passed).toBe(true)
  })

  it('skips typecheck when no script defined', async () => {
    const result = await runDeterministicVerification(testDir, baseCommit)
    const tcCheck = result.checks.find(c => c.check === 'typecheck')
    expect(tcCheck).toBeDefined()
    expect(tcCheck!.skipped).toBe(true)
  })

  it('skips lint when no script defined', async () => {
    const result = await runDeterministicVerification(testDir, baseCommit)
    const lintCheck = result.checks.find(c => c.check === 'lint')
    expect(lintCheck).toBeDefined()
    expect(lintCheck!.skipped).toBe(true)
  })
})
