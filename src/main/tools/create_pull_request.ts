/**
 * create_pull_request - write tool.
 * Creates a pull request on GitHub. Requires GITHUB_TOKEN.
 */
import { z } from 'zod'
import type { ToolDefinition } from './registry'

const InputSchema = z.object({
  title: z.string().min(1).max(200).describe('PR title'),
  body: z.string().max(5000).optional().describe('PR description'),
  headBranch: z.string().describe('Branch with changes'),
  baseBranch: z.string().optional().describe('Target branch (default: main)'),
  draft: z.boolean().optional().describe('Create as draft PR (default: true)')
})

const OutputSchema = z.object({
  number: z.number(),
  url: z.string(),
  title: z.string(),
  draft: z.boolean(),
  created: z.boolean(),
  reconciled: z.boolean()
})

type Input = z.infer<typeof InputSchema>
type Output = z.infer<typeof OutputSchema>

export const createPullRequestTool: ToolDefinition<Input, Output> = {
  name: 'create_pull_request',
  description: 'Create a pull request on GitHub. Created as draft by default. Requires approval.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  mode: 'write',
  approval: 'always',
  timeoutMs: 15_000,
  maxRetries: 0,

  async execute(input, ctx) {
    if (!ctx.githubClient || !ctx.githubIdentity) {
      throw new Error('GitHub not configured - set GITHUB_TOKEN and ensure project has a GitHub remote')
    }

    const { owner, repo } = ctx.githubIdentity
    const baseBranch = input.baseBranch ?? 'main'
    const draft = input.draft ?? true

    // Push branch first
    const { execFile } = require('child_process')
    const { promisify } = require('util')
    const exec = promisify(execFile)
    await exec('git', ['push', '-u', 'origin', input.headBranch], {
      cwd: ctx.workspacePath, timeout: 30_000
    })

    // Create PR via GitHub API
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ctx.githubClient.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: input.title,
        body: input.body ?? '',
        head: input.headBranch,
        base: baseBranch,
        draft
      })
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`GitHub API error ${res.status}: ${body}`)
    }

    const pr = await res.json() as { number: number; html_url: string; title: string; draft: boolean }

    return {
      number: pr.number,
      url: pr.html_url,
      title: pr.title,
      draft: pr.draft,
      created: true,
      reconciled: false
    }
  }
}
