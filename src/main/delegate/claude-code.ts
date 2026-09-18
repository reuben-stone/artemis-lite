/**
 * Claude Code execution adapter.
 *
 * Artemis supplies operational context (why the work exists).
 * Claude Code owns repository context (what code to inspect/change).
 *
 * The worktree + --dangerously-skip-permissions is sufficient for
 * controlled local dogfood use. This is not a complete security sandbox.
 */
import { spawn, execFile as execFileCb } from 'child_process'
import { promisify } from 'util'
import { join, dirname } from 'path'
import { existsSync } from 'fs'
import {
  createStep, updateStep, appendTrace, appendUsage,
  createApproval, getApprovalForStep,
  checkIdempotency, idempotencyKey, markIdempotencyPending, markIdempotencyComplete
} from '../store'
import type { WorkflowRow, StepRow } from '../store'
import type { PlanOutput } from '../model/types'
import type { WorkflowStatus, RendererEvent } from '../../shared/ipc'
import { validateTransition } from '../workflow/transitions'
import { runDeterministicVerification, type DeterministicVerificationResult } from './verification'

const execFile = promisify(execFileCb)

// ── Engine interface (supports future Codex adapter) ──────────────

export interface DelegateEngineResult {
  success: boolean
  output: string
  error?: string
  durationMs: number
  costUsd?: number
  usage?: { inputTokens: number; outputTokens: number }
}

export interface DelegateEngine {
  name: string
  execute(opts: {
    worktreePath: string
    systemPrompt: string
    taskPrompt: string
    timeoutMs: number
    maxBudgetUsd: number
  }): Promise<DelegateEngineResult>
}

// ── Claude Code engine ────────────────────────────────────────────

export class ClaudeCodeEngine implements DelegateEngine {
  name = 'claude_code'

  async execute(opts: {
    worktreePath: string
    systemPrompt: string
    taskPrompt: string
    timeoutMs: number
    maxBudgetUsd: number
  }): Promise<DelegateEngineResult> {
    const start = Date.now()

    const args = [
      '-p', '--print',
      '--output-format', 'json',
      '--model', 'claude-sonnet-4-6',
      '--dangerously-skip-permissions',
      '--no-session-persistence',
      '--max-budget-usd', String(opts.maxBudgetUsd),
      '--disallowedTools', 'Bash(git push:*) Bash(git checkout main:*) Bash(git checkout master:*) Bash(gh pr create:*)',
      '--system-prompt', opts.systemPrompt,
      opts.taskPrompt
    ]

    return new Promise<DelegateEngineResult>((resolve) => {
      const chunks: Buffer[] = []
      const errChunks: Buffer[] = []

      const proc = spawn('claude', args, {
        cwd: opts.worktreePath,
        timeout: opts.timeoutMs,
        stdio: ['ignore', 'pipe', 'pipe']
      })

      proc.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
      proc.stderr.on('data', (chunk: Buffer) => errChunks.push(chunk))

      proc.on('close', (code) => {
        const durationMs = Date.now() - start
        const stdout = Buffer.concat(chunks).toString('utf-8')
        const stderr = Buffer.concat(errChunks).toString('utf-8')

        // Try to parse structured JSON output
        let parsed: any = null
        try {
          parsed = JSON.parse(stdout)
        } catch { /* not JSON */ }

        resolve({
          success: code === 0 && !parsed?.is_error,
          output: parsed?.result ?? stdout.slice(0, 10_000),
          error: parsed?.is_error ? (parsed.result ?? stderr) : (code !== 0 ? stderr.slice(0, 2_000) : undefined),
          durationMs,
          costUsd: parsed?.total_cost_usd ?? undefined,
          usage: parsed?.usage ? {
            inputTokens: parsed.usage.input_tokens ?? 0,
            outputTokens: parsed.usage.output_tokens ?? 0
          } : undefined
        })
      })

      proc.on('error', (err) => {
        resolve({
          success: false,
          output: '',
          error: err.message,
          durationMs: Date.now() - start
        })
      })
    })
  }
}

// ── Worktree management ───────────────────────────────────────────

function worktreeDir(repoPath: string): string {
  return join(dirname(repoPath), '.artemis-worktrees')
}

export async function createWorktree(
  repoPath: string,
  branchName: string,
  workflowIdShort: string
): Promise<{ worktreePath: string; baseCommit: string }> {
  // Get current HEAD as baseCommit before creating worktree
  const { stdout: headOut } = await execFile('git', ['rev-parse', 'HEAD'], { cwd: repoPath })
  const baseCommit = headOut.trim()

  const wtBase = worktreeDir(repoPath)
  const wtPath = join(wtBase, workflowIdShort)

  await execFile('git', ['worktree', 'add', '-b', branchName, wtPath, 'HEAD'], {
    cwd: repoPath,
    timeout: 30_000
  })

  return { worktreePath: wtPath, baseCommit }
}

export async function removeWorktree(repoPath: string, worktreePath: string, branchName: string): Promise<void> {
  try {
    await execFile('git', ['worktree', 'remove', '--force', worktreePath], { cwd: repoPath, timeout: 15_000 })
  } catch { /* worktree may not exist */ }
  try {
    await execFile('git', ['branch', '-D', branchName], { cwd: repoPath, timeout: 5_000 })
  } catch { /* branch may not exist */ }
}

// ── Task prompt construction ──────────────────────────────────────

export function buildSystemPrompt(): string {
  return `You are fixing a production issue in this repository.

Constraints:
- Fix ONLY the identified issue. Do not refactor unrelated code.
- Keep changes minimal and focused.
- Ensure the fix handles edge cases visible in the error.
- Do not modify test infrastructure or CI configuration.
- Do not add new dependencies unless essential to the fix.
- Do not push, deploy, or create pull requests.
- Commit your changes with a clear message referencing the issue.
- After making changes, run the project's test suite if one exists.`
}

export function buildTaskPrompt(goal: string, sentryEvidence?: {
  title?: string
  errorType?: string
  errorValue?: string
  culprit?: string
  count?: string
  firstSeen?: string
  lastSeen?: string
}): string {
  const parts: string[] = []

  if (sentryEvidence) {
    parts.push('## Production Issue')
    if (sentryEvidence.title) parts.push(`Title: ${sentryEvidence.title}`)
    if (sentryEvidence.errorType) parts.push(`Error: ${sentryEvidence.errorType}: ${sentryEvidence.errorValue ?? ''}`)
    if (sentryEvidence.culprit) parts.push(`Location: ${sentryEvidence.culprit}`)
    if (sentryEvidence.count) parts.push(`Frequency: ${sentryEvidence.count} events`)
    if (sentryEvidence.firstSeen) parts.push(`First seen: ${sentryEvidence.firstSeen}`)
    if (sentryEvidence.lastSeen) parts.push(`Last seen: ${sentryEvidence.lastSeen}`)
    parts.push('')
  }

  parts.push('## Goal')
  parts.push(goal)

  return parts.join('\n')
}

// ── Trace helper ──────────────────────────────────────────────────

function trace(workflowId: string, type: string, extra: Record<string, unknown> = {}) {
  appendTrace({
    workflowId,
    stepId: (extra.stepId as string) ?? null,
    timestamp: new Date().toISOString(),
    type,
    status: (extra.status as string) ?? null,
    durationMs: (extra.durationMs as number) ?? null,
    model: (extra.model as string) ?? null,
    inputTokens: (extra.inputTokens as number) ?? null,
    outputTokens: (extra.outputTokens as number) ?? null,
    toolName: (extra.toolName as string) ?? null,
    retry: null,
    errorCode: (extra.errorCode as string) ?? null,
    metadata: extra.metadata ? JSON.stringify(extra.metadata) : null
  })
}

// ── Approval helper ───────────────────────────────────────────────

type Emit = (event: RendererEvent) => void

function transition(wf: WorkflowRow, to: WorkflowStatus): void {
  if (!validateTransition(wf.status as WorkflowStatus, to)) {
    throw new Error(`Invalid transition: ${wf.status} -> ${to}`)
  }
  // Note: we import updateWorkflow lazily to avoid circular deps
  const { updateWorkflow } = require('../store')
  updateWorkflow(wf.id, { status: to })
  wf.status = to
}

async function requestApproval(
  wf: WorkflowRow,
  step: StepRow,
  summary: string,
  emit: Emit,
  waitForApproval: (wfId: string, approval: any, emit: Emit) => Promise<'approved' | 'rejected'>
): Promise<boolean> {
  let approval = getApprovalForStep(wf.id, step.id)
  if (!approval) {
    if (wf.status !== 'awaiting_approval') {
      transition(wf, 'awaiting_approval')
      emit({ type: 'workflow.status', workflowId: wf.id, status: 'awaiting_approval' })
    }
    approval = createApproval({
      workflowId: wf.id,
      stepId: step.id,
      action: 'delegate_engineering',
      summary,
      risk: 'high',
      payloadPreview: null
    })
    trace(wf.id, 'approval.requested', { stepId: step.id, status: 'start' })
  } else if (approval.status === 'pending' && wf.status !== 'awaiting_approval') {
    transition(wf, 'awaiting_approval')
    emit({ type: 'workflow.status', workflowId: wf.id, status: 'awaiting_approval' })
  }

  if (approval.status === 'approved') return true
  if (approval.status === 'rejected') return false

  const decision = await waitForApproval(wf.id, approval, emit)
  trace(wf.id, `approval.${decision}`, { stepId: step.id, status: decision === 'approved' ? 'success' : 'failure' })

  if (decision === 'approved' && wf.status === 'awaiting_approval') {
    transition(wf, 'executing')
    emit({ type: 'workflow.status', workflowId: wf.id, status: 'executing' })
  }

  return decision === 'approved'
}

// ── Main execution function ───────────────────────────────────────

export interface DelegateConfig {
  maxBudgetUsd: number
  timeoutMs: number
}

const DEFAULT_DELEGATE_CONFIG: DelegateConfig = {
  maxBudgetUsd: 0.50,
  timeoutMs: 300_000 // 5 minutes
}

export async function executeDelegatedEngineering(
  wf: WorkflowRow,
  plan: PlanOutput,
  deps: {
    workspacePath: string
    emit: Emit
    waitForApproval: (wfId: string, approval: any, emit: Emit) => Promise<'approved' | 'rejected'>
  },
  engine: DelegateEngine = new ClaudeCodeEngine(),
  config: DelegateConfig = DEFAULT_DELEGATE_CONFIG
): Promise<Record<string, unknown>> {
  const planStep = plan.steps[0]
  const branchName = `artemis/${wf.id.slice(0, 8)}`

  // Create step for the delegation
  const step = createStep(wf.id, 'tool', 'delegate_engineering', {
    planStepId: planStep.id,
    objective: planStep.objective,
    engine: engine.name,
    config
  })

  // Approval gate - human must consent before we spawn a coding agent
  const approved = await requestApproval(
    wf, step,
    `Delegate engineering to ${engine.name}: ${planStep.objective}`,
    deps.emit, deps.waitForApproval
  )

  if (!approved) {
    updateStep(step.id, { status: 'failed', completedAt: new Date().toISOString() })
    return { [planStep.id]: { status: 'rejected', reason: 'Human rejected delegation' } }
  }

  // Idempotency: check if this step already completed
  const idemKey = idempotencyKey(wf.id, step.id, 'delegate_engineering')
  const existing = checkIdempotency(idemKey)

  if (existing?.status === 'completed' && existing.result) {
    trace(wf.id, 'delegate.idempotent_hit', { stepId: step.id, status: 'success' })
    return { [planStep.id]: JSON.parse(existing.result) }
  }

  markIdempotencyPending(idemKey)
  updateStep(step.id, { status: 'running', startedAt: new Date().toISOString() })
  deps.emit({ type: 'step.started', workflowId: wf.id, step: { id: step.id, type: 'tool', status: 'running', toolName: 'delegate_engineering' } })

  let worktreePath: string | null = null
  let baseCommit: string | null = null

  try {
    // Create isolated worktree
    trace(wf.id, 'delegate.worktree_create', { stepId: step.id, status: 'start' })
    const wt = await createWorktree(deps.workspacePath, branchName, wf.id.slice(0, 8))
    worktreePath = wt.worktreePath
    baseCommit = wt.baseCommit

    trace(wf.id, 'delegate.worktree_create', {
      stepId: step.id, status: 'success',
      metadata: { worktreePath, branchName, baseCommit }
    })

    // Build prompts - operational context only, not repository context
    const systemPrompt = buildSystemPrompt()
    const taskPrompt = buildTaskPrompt(planStep.objective)

    // Spawn Claude Code
    trace(wf.id, 'delegate.engine_start', {
      stepId: step.id, status: 'start',
      toolName: engine.name,
      metadata: { maxBudgetUsd: config.maxBudgetUsd, timeoutMs: config.timeoutMs }
    })

    const engineResult = await engine.execute({
      worktreePath,
      systemPrompt,
      taskPrompt,
      timeoutMs: config.timeoutMs,
      maxBudgetUsd: config.maxBudgetUsd
    })

    // Record engine usage
    trace(wf.id, 'delegate.engine_complete', {
      stepId: step.id,
      status: engineResult.success ? 'success' : 'failure',
      durationMs: engineResult.durationMs,
      metadata: {
        engine: engine.name,
        costUsd: engineResult.costUsd,
        outputLength: engineResult.output.length,
        error: engineResult.error
      }
    })

    if (engineResult.usage) {
      appendUsage({
        workflowId: wf.id,
        stepId: step.id,
        provider: engine.name,
        model: 'claude-sonnet-4-6',
        inputTokens: engineResult.usage.inputTokens,
        outputTokens: engineResult.usage.outputTokens,
        estimatedCost: engineResult.costUsd ?? 0,
        timestamp: new Date().toISOString()
      })
    }

    // Run deterministic verification in worktree
    trace(wf.id, 'delegate.verification_start', { stepId: step.id, status: 'start' })
    const verification = await runDeterministicVerification(worktreePath, baseCommit)

    trace(wf.id, 'delegate.verification_complete', {
      stepId: step.id,
      status: verification.allPassed ? 'success' : 'failure',
      metadata: {
        checks: verification.checks.map(c => ({ check: c.check, passed: c.passed, skipped: c.skipped })),
        filesChanged: verification.diff.files.length,
        additions: verification.diff.additions,
        deletions: verification.diff.deletions,
        commitCount: verification.gitState.commitCount,
        hasUncommittedChanges: verification.gitState.hasUncommittedChanges
      }
    })

    // Build consolidated result - Claude Code's report separate from Artemis-observed facts
    const result = {
      status: engineResult.success && verification.allPassed ? 'completed' : 'failed',
      engine: {
        name: engine.name,
        success: engineResult.success,
        output: engineResult.output.slice(0, 5_000),
        error: engineResult.error,
        durationMs: engineResult.durationMs,
        costUsd: engineResult.costUsd
      },
      observed: {
        diff: verification.diff,
        checks: verification.checks,
        allChecksPassed: verification.allPassed,
        gitState: verification.gitState,
        worktreePath,
        branchName,
        baseCommit
      }
    }

    // Persist completion explicitly
    markIdempotencyComplete(idemKey, result)
    updateStep(step.id, {
      status: 'completed',
      outputData: JSON.stringify(result),
      completedAt: new Date().toISOString()
    })
    deps.emit({ type: 'step.completed', workflowId: wf.id, step: { id: step.id, type: 'tool', status: 'completed', toolName: 'delegate_engineering' } })

    return { [planStep.id]: result }

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    trace(wf.id, 'delegate.failed', {
      stepId: step.id, status: 'failure', errorCode: errMsg,
      metadata: { worktreePath, branchName }
    })

    updateStep(step.id, { status: 'failed', completedAt: new Date().toISOString() })

    // Clean up worktree on failure
    if (worktreePath) {
      try {
        await removeWorktree(deps.workspacePath, worktreePath, branchName)
        trace(wf.id, 'delegate.worktree_cleanup', { stepId: step.id, status: 'success' })
      } catch { /* cleanup is best-effort */ }
    }

    return { [planStep.id]: { status: 'failed', error: errMsg } }
  }
}
