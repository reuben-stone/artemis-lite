/**
 * get_issue_detail - read-only tool.
 * Gets a single issue with its full comment thread.
 */
import { z } from 'zod'
import type { ToolDefinition } from './registry'

const InputSchema = z.object({
  issueNumber: z.number().int().min(1).describe('The issue number to retrieve')
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

const CommentSchema = z.object({
  author: z.string(),
  body: z.string(),
  createdAt: z.string()
})

const OutputSchema = z.object({
  issue: IssueSchema,
  comments: z.array(CommentSchema)
})

type Input = z.infer<typeof InputSchema>
type Output = z.infer<typeof OutputSchema>

export const getIssueDetailTool: ToolDefinition<Input, Output> = {
  name: 'get_issue_detail',
  description: 'Get a single issue with its full comment thread. Useful for understanding reported bugs, feature requests and discussion context.',
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

    const [issue, comments] = await Promise.all([
      ctx.githubClient.getIssue(ctx.githubIdentity, input.issueNumber),
      ctx.githubClient.listIssueComments(ctx.githubIdentity, input.issueNumber)
    ])

    return { issue, comments }
  }
}
