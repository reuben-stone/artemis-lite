/**
 * get_issues - read-only tool.
 * Lists issues for the project's GitHub repository.
 */
import { z } from 'zod'
import type { ToolDefinition } from './registry'

const InputSchema = z.object({
  state: z.enum(['open', 'closed', 'all']).optional().describe('Issue state filter (default: open)'),
  limit: z.number().int().min(1).max(100).optional().describe('Max issues to return (default: 30)')
})

const IssueSchema = z.object({
  number: z.number(),
  title: z.string(),
  state: z.enum(['open', 'closed']),
  body: z.string().nullable(),
  author: z.string(),
  labels: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
  commentCount: z.number()
})

const OutputSchema = z.object({
  issues: z.array(IssueSchema),
  totalCount: z.number(),
  truncated: z.boolean()
})

type Input = z.infer<typeof InputSchema>
type Output = z.infer<typeof OutputSchema>

export const getIssuesTool: ToolDefinition<Input, Output> = {
  name: 'get_issues',
  description: 'List issues for the project GitHub repository. Returns issue number, title, state, author, labels and comment count.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  mode: 'read',
  approval: 'never',
  timeoutMs: 10_000,
  maxRetries: 1,

  async execute(input, ctx) {
    if (!ctx.githubClient || !ctx.githubIdentity) {
      throw new Error('GitHub not configured - set GITHUB_TOKEN and ensure project has a GitHub remote')
    }

    const limit = input.limit ?? 30
    const issues = await ctx.githubClient.listIssues(ctx.githubIdentity, {
      state: input.state ?? 'open',
      perPage: limit
    })

    return {
      issues,
      totalCount: issues.length,
      truncated: issues.length >= limit
    }
  }
}
