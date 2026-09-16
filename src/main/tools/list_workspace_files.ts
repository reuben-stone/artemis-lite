/**
 * list_workspace_files — read-only tool.
 * Returns compact file listing from the workspace directory.
 */
import { z } from 'zod'
import { readdirSync, statSync } from 'fs'
import { join, relative } from 'path'
import type { ToolDefinition } from './registry'

const InputSchema = z.object({
  directory: z.string().optional().describe('Subdirectory within workspace (default: root)')
})

const FileEntry = z.object({
  path: z.string(),
  type: z.enum(['file', 'directory']),
  sizeBytes: z.number().optional()
})

const OutputSchema = z.object({
  files: z.array(FileEntry),
  truncated: z.boolean()
})

type Input = z.infer<typeof InputSchema>
type Output = z.infer<typeof OutputSchema>

const MAX_ENTRIES = 100

export const listWorkspaceFilesTool: ToolDefinition<Input, Output> = {
  name: 'list_workspace_files',
  description: 'List files and directories in the workspace. Returns paths, types and sizes. Max 100 entries.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  mode: 'read',
  approval: 'never',
  timeoutMs: 5000,
  maxRetries: 0,

  async execute(input, ctx) {
    const targetDir = input.directory
      ? join(ctx.workspacePath, input.directory)
      : ctx.workspacePath

    // Path containment: resolved path must be within workspace
    const resolved = join(targetDir)
    if (!resolved.startsWith(ctx.workspacePath)) {
      throw new Error('Path traversal blocked: directory outside workspace')
    }

    const entries: { path: string; type: 'file' | 'directory'; sizeBytes?: number }[] = []
    let truncated = false

    try {
      const items = readdirSync(targetDir, { withFileTypes: true })
      for (const item of items) {
        if (entries.length >= MAX_ENTRIES) {
          truncated = true
          break
        }
        const fullPath = join(targetDir, item.name)
        const relPath = relative(ctx.workspacePath, fullPath)
        if (item.isDirectory()) {
          entries.push({ path: relPath, type: 'directory' })
        } else if (item.isFile()) {
          const stat = statSync(fullPath)
          entries.push({ path: relPath, type: 'file', sizeBytes: stat.size })
        }
      }
    } catch (err) {
      throw new Error(`Cannot list directory: ${err instanceof Error ? err.message : String(err)}`)
    }

    return { files: entries, truncated }
  }
}
