/**
 * Git metadata service.
 * Extracts repository information via execFile, scoped to a project path.
 * No git commands are embedded in workflow or tool code.
 */
import { execFile } from 'child_process'
import { promisify } from 'util'

const exec = promisify(execFile)

const TIMEOUT_MS = 5000

export interface GitStatus {
  branch: string | null
  remote: string | null
  dirty: boolean
  changedFiles: string[]
}

async function gitCmd(args: string[], cwd: string): Promise<string> {
  try {
    const { stdout } = await exec('git', args, { cwd, timeout: TIMEOUT_MS })
    return stdout.trim()
  } catch {
    return ''
  }
}

export async function getGitBranch(projectPath: string): Promise<string | null> {
  const result = await gitCmd(['rev-parse', '--abbrev-ref', 'HEAD'], projectPath)
  return result || null
}

export async function getGitRemote(projectPath: string): Promise<string | null> {
  const result = await gitCmd(['config', '--get', 'remote.origin.url'], projectPath)
  return result || null
}

export async function getGitStatus(projectPath: string): Promise<GitStatus> {
  const [branch, remote, porcelain] = await Promise.all([
    getGitBranch(projectPath),
    getGitRemote(projectPath),
    gitCmd(['status', '--porcelain'], projectPath)
  ])

  const changedFiles = porcelain
    ? porcelain.split('\n').filter(Boolean).map(line => line.slice(3))
    : []

  return {
    branch,
    remote,
    dirty: changedFiles.length > 0,
    changedFiles
  }
}

/**
 * Detect whether a path is inside a git repository.
 */
export async function isGitRepo(projectPath: string): Promise<boolean> {
  const result = await gitCmd(['rev-parse', '--is-inside-work-tree'], projectPath)
  return result === 'true'
}
