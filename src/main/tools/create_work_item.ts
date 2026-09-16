/**
 * create_work_item — write tool, requires approval.
 * Creates a JSON work item file in the workspace's work-items/ directory.
 * Idempotent via the orchestrator's idempotency ledger.
 */
import { z } from 'zod'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type { ToolDefinition } from './registry'

const InputSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional()
})

const OutputSchema = z.object({
  id: z.string(),
  path: z.string(),
  created: z.boolean()
})

type Input = z.infer<typeof InputSchema>
type Output = z.infer<typeof OutputSchema>

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

    const id = randomUUID().slice(0, 8)
    const filename = `${id}.json`
    const filepath = join(dir, filename)

    // Path containment
    if (!filepath.startsWith(ctx.workspacePath)) {
      throw new Error('Path traversal blocked')
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
