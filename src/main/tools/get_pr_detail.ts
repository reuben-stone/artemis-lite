/**
 * get_pr_detail - read-only tool.
 * Gets a single pull request with reviews and check status.
 */
import { z } from 'zod'
import type { ToolDefinition } from './registry'

const InputSchema = z.object({
  prNumber: z.number().int().min(1).describe('The pull request number to retrieve')
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

const ReviewSchema = z.object({
  author: z.string(),
  state: z.enum(['approved', 'changes_requested', 'commented', 'dismissed', 'pending']),
  body: z.string(),
  submittedAt: z.string()
})

const CheckRunSchema = z.object({
  name: z.string(),
  status: z.enum(['queued', 'in_progress', 'completed']),
  conclusion: z.string().nullable()
})

const OutputSchema = z.object({
  pullRequest: PRSchema,
  reviews: z.array(ReviewSchema),
  checks: z.array(CheckRunSchema)
})

type Input = z.infer<typeof InputSchema>
type Output = z.infer<typeof OutputSchema>

export const getPRDetailTool: ToolDefinition<Input, Output> = {
  name: 'get_pr_detail',
  description: 'Get a single pull request with its reviews and CI check status. Useful for understanding PR state, review feedback and whether checks are passing.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  mode: 'read',
  approval: 'never',
  timeoutMs: 15_000,
  maxRetries: 1,

  async execute(input, ctx) {
    if (!ctx.githubClient || !ctx.githubIdentity) {
      throw new Error('GitHub not configured - set GITHUB_TOKEN and ensure project has a GitHub remote')
    }

    const [pullRequest, reviews, checks] = await Promise.all([
      ctx.githubClient.getPullRequest(ctx.githubIdentity, input.prNumber),
      ctx.githubClient.listPRReviews(ctx.githubIdentity, input.prNumber),
      ctx.githubClient.listPRChecks(ctx.githubIdentity, input.prNumber)
    ])

    return { pullRequest, reviews, checks }
  }
}
