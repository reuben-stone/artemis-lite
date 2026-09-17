/**
 * write_file - write tool.
 * Writes or modifies a file in the workspace. Requires approval.
 */
import { z } from 'zod'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, resolve, dirname } from 'path'
import type { ToolDefinition } from './registry'

const InputSchema = z.object({
  path: z.string().describe('Relative file path within the workspace'),
  content: z.string().describe('Full file content to write')
})

const OutputSchema = z.object({
  path: z.string(),
  written: z.boolean(),
  sizeBytes: z.number()
})

type Input = z.infer<typeof InputSchema>
type Output = z.infer<typeof OutputSchema>

export const writeFileTool: ToolDefinition<Input, Output> = {
  name: 'write_file',
  description: 'Write content to a file in the workspace. Creates directories if needed. Requires approval.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  mode: 'write',
  approval: 'write',
  timeoutMs: 5000,
  maxRetries: 0,

  async execute(input, ctx) {
    const fullPath = resolve(join(ctx.workspacePath, input.path))
    if (!fullPath.startsWith(ctx.workspacePath)) {
      throw new Error('Path traversal blocked: path outside workspace')
    }

    const dir = dirname(fullPath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    writeFileSync(fullPath, input.content, 'utf-8')

    return {
      path: input.path,
      written: true,
      sizeBytes: Buffer.byteLength(input.content, 'utf-8')
    }
  }
}
