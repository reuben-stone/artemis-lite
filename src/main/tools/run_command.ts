/**
 * run_command - read-only tool (bounded execution).
 * Runs an allowed command in the workspace (tests, typecheck, build, lint).
 * Only whitelisted commands are permitted.
 */
import { z } from 'zod'
import { execFile } from 'child_process'
import { promisify } from 'util'
import type { ToolDefinition } from './registry'

const exec = promisify(execFile)

const ALLOWED_COMMANDS: Record<string, { cmd: string; args: string[] }> = {
  'test':      { cmd: 'npm', args: ['test'] },
  'typecheck': { cmd: 'npx', args: ['tsc', '--noEmit'] },
  'lint':      { cmd: 'npx', args: ['eslint', '.'] },
  'build':     { cmd: 'npm', args: ['run', 'build'] }
}

const InputSchema = z.object({
  command: z.enum(['test', 'typecheck', 'lint', 'build']).describe('Whitelisted command to run')
})

const OutputSchema = z.object({
  command: z.string(),
  exitCode: z.number(),
  stdout: z.string(),
  stderr: z.string(),
  durationMs: z.number(),
  passed: z.boolean()
})

type Input = z.infer<typeof InputSchema>
type Output = z.infer<typeof OutputSchema>

export const runCommandTool: ToolDefinition<Input, Output> = {
  name: 'run_command',
  description: 'Run a whitelisted command (test, typecheck, lint, build) in the workspace. Returns output and exit code.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  mode: 'read',
  approval: 'never',
  timeoutMs: 120_000,
  maxRetries: 0,

  async execute(input, ctx) {
    const spec = ALLOWED_COMMANDS[input.command]
    if (!spec) throw new Error(`Unknown command: ${input.command}`)

    const start = Date.now()
    let stdout = ''
    let stderr = ''
    let exitCode = 0

    try {
      const result = await exec(spec.cmd, spec.args, {
        cwd: ctx.workspacePath,
        timeout: 90_000,
        maxBuffer: 1024 * 1024
      })
      stdout = result.stdout.slice(-5000) // Last 5KB
      stderr = result.stderr.slice(-2000)
    } catch (err: any) {
      exitCode = err.code ?? 1
      stdout = (err.stdout ?? '').slice(-5000)
      stderr = (err.stderr ?? '').slice(-2000)
    }

    return {
      command: input.command,
      exitCode,
      stdout,
      stderr,
      durationMs: Date.now() - start,
      passed: exitCode === 0
    }
  }
}
