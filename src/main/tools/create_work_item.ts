/**
 * create_work_item — write tool, requires approval.
 * Creates a JSON work item file in the workspace's work-items/ directory.
 *
 * Reconciliation strategy:
 * - The file ID is deterministic (derived from title hash) so that after
 *   an ambiguous interruption (ledger says "pending"), the tool can check
 *   if the artifact already exists on disk.
 * - If the file exists with matching content, return it without re-writing.
 * - If the file does not exist, create it normally.
 *
 * Side-effect categories:
 * - completed: idempotency ledger says "completed" → skip, use stored result
 * - safe-to-retry: file does not exist → create normally
 * - ambiguous: ledger says "pending" → check disk, reconcile
 */
import { z } from 'zod'
import { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import type { ToolDefinition } from './registry'

const InputSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional()
})

const OutputSchema = z.object({
  id: z.string(),
  path: z.string(),
  created: z.boolean(),
  reconciled: z.boolean().optional()
})

type Input = z.infer<typeof InputSchema>
type Output = z.infer<typeof OutputSchema>

/**
 * Deterministic 8-char ID from title. Same title → same ID → same filename.
 * This enables reconciliation after ambiguous interruption.
 */
function deterministicId(title: string): string {
  return createHash('sha256').update(title).digest('hex').slice(0, 8)
}

export const createWorkItemTool: ToolDefinition<Input, Output> = {
  name: 'create_work_item',
  description: 'Create a work item (JSON file) in the workspace work-items/ directory. Requires approval before execution.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  mode: 'write',
  approval: 'write',
  timeoutMs: 10000,
  maxRetries: 1,

  async execute(input, ctx) {
    const dir = join(ctx.workspacePath, 'work-items')
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    const id = deterministicId(input.title)
    const filename = `${id}.json`
    const filepath = join(dir, filename)

    // Path containment
    if (!filepath.startsWith(ctx.workspacePath)) {
      throw new Error('Path traversal blocked')
    }

    // Reconciliation: if file already exists with matching title, don't re-create
    if (existsSync(filepath)) {
      try {
        const existing = JSON.parse(readFileSync(filepath, 'utf-8'))
        if (existing.title === input.title) {
          return {
            id,
            path: `work-items/${filename}`,
            created: false,
            reconciled: true
          }
        }
      } catch {
        // Corrupt file — overwrite
      }
    }

    const workItem = {
      id,
      title: input.title,
      description: input.description ?? '',
      priority: input.priority ?? 'medium',
      createdAt: new Date().toISOString()
    }

    writeFileSync(filepath, JSON.stringify(workItem, null, 2))

    return {
      id,
      path: `work-items/${filename}`,
      created: true
    }
  }
}
