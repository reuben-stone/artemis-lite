/**
 * read_file - read-only tool.
 * Reads the content of a file within the workspace.
 */
import { z } from 'zod'
import { readFileSync, statSync } from 'fs'
import { join, resolve } from 'path'
import type { ToolDefinition } from './registry'

const InputSchema = z.object({
  path: z.string().describe('Relative file path within the workspace'),
  maxLines: z.number().int().min(1).max(500).optional().describe('Maximum lines to read (default: 200)'),
  offset: z.number().int().min(0).optional().describe('Line number to start reading from (0-based, default: 0)')
})

const OutputSchema = z.object({
  path: z.string(),
  content: z.string(),
  lines: z.number(),
  truncated: z.boolean(),
  sizeBytes: z.number()
})

type Input = z.infer<typeof InputSchema>
type Output = z.infer<typeof OutputSchema>

export const readFileTool: ToolDefinition<Input, Output> = {
  name: 'read_file',
  description: 'Read the content of a file in the workspace. Returns file content, line count and size. Use offset to start reading from a specific line (e.g. to jump to a search match).',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  mode: 'read',
  approval: 'never',
  timeoutMs: 5000,
  maxRetries: 0,

  async execute(input, ctx) {
    const fullPath = resolve(join(ctx.workspacePath, input.path))
    if (!fullPath.startsWith(ctx.workspacePath)) {
      throw new Error('Path traversal blocked: path outside workspace')
    }

    const stat = statSync(fullPath)
    if (!stat.isFile()) throw new Error(`Not a file: ${input.path}`)
    if (stat.size > 512_000) throw new Error(`File too large: ${stat.size} bytes (max 512KB)`)

    const raw = readFileSync(fullPath, 'utf-8')
    const allLines = raw.split('\n')
    const startLine = input.offset ?? 0
    const maxLines = input.maxLines ?? 200
    const remaining = allLines.slice(startLine)
    const truncated = remaining.length > maxLines
    const content = truncated ? remaining.slice(0, maxLines).join('\n') : remaining.join('\n')

    return {
      path: input.path,
      content,
      lines: allLines.length,
      truncated,
      sizeBytes: stat.size
    }
  }
}
