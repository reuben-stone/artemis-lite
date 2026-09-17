/**
 * git_commit - write tool.
 * Stages and commits changes in the workspace. Requires approval.
 */
import { z } from 'zod'
import { execFile } from 'child_process'
import { promisify } from 'util'
import type { ToolDefinition } from './registry'

const exec = promisify(execFile)

const InputSchema = z.object({
  message: z.string().min(1).max(500).describe('Commit message'),
  files: z.array(z.string()).optional().describe('Specific files to stage (default: all changes)')
})

const OutputSchema = z.object({
  commitHash: z.string(),
  message: z.string(),
  filesChanged: z.number()
})

type Input = z.infer<typeof InputSchema>
type Output = z.infer<typeof OutputSchema>

export const gitCommitTool: ToolDefinition<Input, Output> = {
  name: 'git_commit',
  description: 'Stage and commit changes in the workspace. Requires approval.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  mode: 'write',
  approval: 'write',
  timeoutMs: 15_000,
  maxRetries: 0,

  async execute(input, ctx) {
    const opts = { cwd: ctx.workspacePath, timeout: 10_000 }

    // Stage files
    if (input.files && input.files.length > 0) {
      await exec('git', ['add', ...input.files], opts)
    } else {
      await exec('git', ['add', '-A'], opts)
    }

    // Commit
    await exec('git', ['commit', '-m', input.message], opts)

    // Get commit hash
    const { stdout: hash } = await exec('git', ['rev-parse', '--short', 'HEAD'], opts)

    // Count changed files
    const { stdout: stat } = await exec('git', ['diff', '--stat', 'HEAD~1', 'HEAD'], opts)
    const filesChanged = stat.split('\n').filter(l => l.includes('|')).length

    return {
      commitHash: hash.trim(),
      message: input.message,
      filesChanged
    }
  }
}
