/**
 * create_branch - write tool.
 * Creates a new git branch in the workspace.
 */
import { z } from 'zod'
import { execFile } from 'child_process'
import { promisify } from 'util'
import type { ToolDefinition } from './registry'

const exec = promisify(execFile)

const InputSchema = z.object({
  branchName: z.string().min(1).max(100).describe('Branch name to create (e.g. "artemis/fix-scanner-timeout")')
})

const OutputSchema = z.object({
  branchName: z.string(),
  created: z.boolean(),
  previousBranch: z.string()
})

type Input = z.infer<typeof InputSchema>
type Output = z.infer<typeof OutputSchema>

export const createBranchTool: ToolDefinition<Input, Output> = {
  name: 'create_branch',
  description: 'Create a new git branch in the workspace and switch to it.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  mode: 'write',
  approval: 'write',
  timeoutMs: 10_000,
  maxRetries: 0,

  async execute(input, ctx) {
    // Get current branch
    const { stdout: currentBranch } = await exec('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: ctx.workspacePath, timeout: 5000
    })

    // Create and checkout
    await exec('git', ['checkout', '-b', input.branchName], {
      cwd: ctx.workspacePath, timeout: 5000
    })

    return {
      branchName: input.branchName,
      created: true,
      previousBranch: currentBranch.trim()
    }
  }
}
