/**
 * git_diff - read-only tool.
 * Shows the git diff for the workspace (unstaged changes).
 */
import { z } from 'zod'
import { execFile } from 'child_process'
import { promisify } from 'util'
import type { ToolDefinition } from './registry'

const exec = promisify(execFile)

const InputSchema = z.object({
  staged: z.boolean().optional().describe('Show staged changes instead of unstaged (default: false)')
})

const OutputSchema = z.object({
  diff: z.string(),
  changedFiles: z.array(z.string()),
  additions: z.number(),
  deletions: z.number(),
  truncated: z.boolean()
})

type Input = z.infer<typeof InputSchema>
type Output = z.infer<typeof OutputSchema>

const MAX_DIFF_SIZE = 10_000

export const gitDiffTool: ToolDefinition<Input, Output> = {
  name: 'git_diff',
  description: 'Show git diff for the workspace. Returns diff content, changed files, and addition/deletion counts.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  mode: 'read',
  approval: 'never',
  timeoutMs: 10_000,
  maxRetries: 0,

  async execute(input, ctx) {
    const args = input.staged ? ['diff', '--staged'] : ['diff']

    let diffOutput = ''
    try {
      const result = await exec('git', args, { cwd: ctx.workspacePath, timeout: 8000, maxBuffer: 512 * 1024 })
      diffOutput = result.stdout
    } catch (err: any) {
      diffOutput = err.stdout ?? ''
    }

    // Parse changed files from diff headers
    const fileRegex = /^diff --git a\/(.+?) b\//gm
    const changedFiles: string[] = []
    let match
    while ((match = fileRegex.exec(diffOutput)) !== null) {
      changedFiles.push(match[1])
    }

    // Count additions/deletions
    let additions = 0
    let deletions = 0
    for (const line of diffOutput.split('\n')) {
      if (line.startsWith('+') && !line.startsWith('+++')) additions++
      if (line.startsWith('-') && !line.startsWith('---')) deletions++
    }

    const truncated = diffOutput.length > MAX_DIFF_SIZE
    const diff = truncated ? diffOutput.slice(0, MAX_DIFF_SIZE) + '\n... (truncated)' : diffOutput

    return { diff, changedFiles, additions, deletions, truncated }
  }
}
