/**
 * Deterministic verification for delegated engineering work.
 *
 * Runs in the worktree after the coding agent completes.
 * Every check produces a structured result. Model judgement
 * supplements these facts but does not replace them.
 */
import { execFile as execFileCb } from 'child_process'
import { promisify } from 'util'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const execFile = promisify(execFileCb)

const CHECK_TIMEOUT = 90_000
const MAX_OUTPUT = 5_000

export interface VerificationCheck {
  check: string
  passed: boolean
  output: string
  skipped: boolean
  durationMs: number
}

export interface DiffSummary {
  files: string[]
  additions: number
  deletions: number
  raw: string
}

export interface DeterministicVerificationResult {
  checks: VerificationCheck[]
  allPassed: boolean
  diff: DiffSummary
  gitState: {
    branch: string
    hasUncommittedChanges: boolean
    commitCount: number
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(-max) + '\n[truncated]' : s
}

async function runCheck(
  name: string,
  cmd: string,
  args: string[],
  cwd: string
): Promise<VerificationCheck> {
  const start = Date.now()
  try {
    const { stdout, stderr } = await execFile(cmd, args, {
      cwd,
      timeout: CHECK_TIMEOUT,
      maxBuffer: 1024 * 1024
    })
    return {
      check: name,
      passed: true,
      output: truncate(stdout + stderr, MAX_OUTPUT),
      skipped: false,
      durationMs: Date.now() - start
    }
  } catch (err: any) {
    return {
      check: name,
      passed: false,
      output: truncate((err.stdout ?? '') + (err.stderr ?? '') + (err.message ?? ''), MAX_OUTPUT),
      skipped: false,
      durationMs: Date.now() - start
    }
  }
}

/**
 * Detect available verification scripts from project metadata.
 * Uses package.json scripts rather than blindly invoking tooling.
 */
function detectAvailableChecks(worktreePath: string): { test: boolean; typecheck: boolean; lint: boolean } {
  const result = { test: false, typecheck: false, lint: false }
  const pkgPath = join(worktreePath, 'package.json')
  if (!existsSync(pkgPath)) return result

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
    const scripts = pkg.scripts ?? {}
    if (scripts.test && scripts.test !== 'echo "Error: no test specified" && exit 1') {
      result.test = true
    }
    if (scripts.typecheck || scripts['type-check']) result.typecheck = true
    if (scripts.lint) result.lint = true
  } catch { /* ok */ }

  return result
}

export async function runDeterministicVerification(
  worktreePath: string,
  baseCommit: string
): Promise<DeterministicVerificationResult> {
  const checks: VerificationCheck[] = []

  // 1. Git state
  let branch = 'unknown'
  let hasUncommittedChanges = false
  let commitCount = 0

  try {
    const { stdout: branchOut } = await execFile('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: worktreePath })
    branch = branchOut.trim()
  } catch { /* ok */ }

  try {
    const { stdout: statusOut } = await execFile('git', ['status', '--porcelain'], { cwd: worktreePath })
    hasUncommittedChanges = statusOut.trim().length > 0
  } catch { /* ok */ }

  try {
    const { stdout: logOut } = await execFile('git', ['rev-list', '--count', `${baseCommit}..HEAD`], { cwd: worktreePath })
    commitCount = parseInt(logOut.trim(), 10) || 0
  } catch { /* ok */ }

  // 2. Diff against baseCommit (not HEAD~1)
  let diff: DiffSummary = { files: [], additions: 0, deletions: 0, raw: '' }

  try {
    const { stdout: diffStat } = await execFile('git', ['diff', '--stat', baseCommit], { cwd: worktreePath, maxBuffer: 1024 * 1024 })
    const { stdout: diffRaw } = await execFile('git', ['diff', baseCommit], { cwd: worktreePath, maxBuffer: 2 * 1024 * 1024 })

    const files: string[] = []
    let additions = 0
    let deletions = 0

    for (const line of diffStat.split('\n')) {
      const fileMatch = line.match(/^\s*(.+?)\s*\|\s*(\d+)/)
      if (fileMatch) files.push(fileMatch[1].trim())
      const addMatch = line.match(/(\d+) insertion/)
      const delMatch = line.match(/(\d+) deletion/)
      if (addMatch) additions += parseInt(addMatch[1], 10)
      if (delMatch) deletions += parseInt(delMatch[1], 10)
    }

    diff = { files, additions, deletions, raw: truncate(diffRaw, 10_000) }

    checks.push({
      check: 'git_diff',
      passed: true, // Diff is observational - it reports facts, not pass/fail
      output: `${files.length} file(s) changed, +${additions} -${deletions}`,
      skipped: false,
      durationMs: 0
    })
  } catch (err: any) {
    checks.push({
      check: 'git_diff',
      passed: false,
      output: err.message ?? 'Failed to compute diff',
      skipped: false,
      durationMs: 0
    })
  }

  // 3. Repo-defined checks
  const available = detectAvailableChecks(worktreePath)

  if (available.test) {
    checks.push(await runCheck('test', 'npm', ['test'], worktreePath))
  } else {
    checks.push({ check: 'test', passed: true, output: 'No test script defined', skipped: true, durationMs: 0 })
  }

  if (available.typecheck) {
    const scriptName = available.typecheck ? 'typecheck' : 'type-check'
    checks.push(await runCheck('typecheck', 'npm', ['run', scriptName], worktreePath))
  } else {
    checks.push({ check: 'typecheck', passed: true, output: 'No typecheck script defined', skipped: true, durationMs: 0 })
  }

  if (available.lint) {
    checks.push(await runCheck('lint', 'npm', ['run', 'lint'], worktreePath))
  } else {
    checks.push({ check: 'lint', passed: true, output: 'No lint script defined', skipped: true, durationMs: 0 })
  }

  const allPassed = checks.filter(c => !c.skipped).every(c => c.passed)

  return {
    checks,
    allPassed,
    diff,
    gitState: { branch, hasUncommittedChanges, commitCount }
  }
}
