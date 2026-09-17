/**
 * get_pull_requests - read-only tool.
 * Lists pull requests for the project's GitHub repository.
 */
import { z } from 'zod'
import type { ToolDefinition } from './registry'

const InputSchema = z.object({
  state: z.enum(['open', 'closed', 'all']).optional().describe('PR state filter (default: open)'),
  limit: z.number().int().min(1).max(100).optional().describe('Max PRs to return (default: 30)')
})

const PRSchema = z.object({
  number: z.number(),
  title: z.string(),
  state: z.enum(['open', 'closed', 'merged']),
  body: z.string().nullable(),
  author: z.string(),
  labels: z.array(z.string()),
  headBranch: z.string(),
  baseBranch: z.string(),
  draft: z.boolean(),
  mergeable: z.boolean().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  commentCount: z.number()
})

const OutputSchema = z.object({
  pullRequests: z.array(PRSchema),
  totalCount: z.number(),
  truncated: z.boolean()
})

type Input = z.infer<typeof InputSchema>
type Output = z.infer<typeof OutputSchema>

export const getPullRequestsTool: ToolDefinition<Input, Output> = {
  name: 'get_pull_requests',
  description: 'List pull requests for the project GitHub repository. Returns PR number, title, state, author, branches, draft status and labels.',
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
    const pullRequests = await ctx.githubClient.listPullRequests(ctx.githubIdentity, {
      state: input.state ?? 'open',
      perPage: limit
    })

    return {
      pullRequests,
      totalCount: pullRequests.length,
      truncated: pullRequests.length >= limit
    }
  }
}
