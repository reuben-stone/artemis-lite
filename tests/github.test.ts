import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { __setDbOpener, createProject, getProject } from '../src/main/store'
import { parseGitHubRemote, GitHubClient, GitHubError } from '../src/main/github'
import { getIssuesTool } from '../src/main/tools/get_issues'
import { getIssueDetailTool } from '../src/main/tools/get_issue_detail'
import { getPullRequestsTool } from '../src/main/tools/get_pull_requests'
import { getPRDetailTool } from '../src/main/tools/get_pr_detail'
import type { ToolContext } from '../src/main/tools/registry'

// ── parseGitHubRemote ────────────────────────────────────────────

describe('parseGitHubRemote', () => {
  it('parses SSH remote', () => {
    const result = parseGitHubRemote('git@github.com:reuben-stone/artemis-lite.git')
    expect(result).toEqual({ owner: 'reuben-stone', repo: 'artemis-lite' })
  })

  it('parses SSH remote without .git suffix', () => {
    const result = parseGitHubRemote('git@github.com:owner/repo')
    expect(result).toEqual({ owner: 'owner', repo: 'repo' })
  })

  it('parses HTTPS remote', () => {
    const result = parseGitHubRemote('https://github.com/reuben-stone/artemis-lite.git')
    expect(result).toEqual({ owner: 'reuben-stone', repo: 'artemis-lite' })
  })

  it('parses HTTPS remote without .git suffix', () => {
    const result = parseGitHubRemote('https://github.com/owner/repo')
    expect(result).toEqual({ owner: 'owner', repo: 'repo' })
  })

  it('returns null for non-GitHub remote', () => {
    expect(parseGitHubRemote('git@gitlab.com:owner/repo.git')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseGitHubRemote('')).toBeNull()
  })

  it('returns null for garbage input', () => {
    expect(parseGitHubRemote('not-a-url')).toBeNull()
  })

  it('handles HTTPS with trailing slash', () => {
    // URL constructor normalizes this
    const result = parseGitHubRemote('https://github.com/owner/repo/')
    expect(result).not.toBeNull()
    expect(result!.owner).toBe('owner')
  })
})

// ── GitHubClient with fetch stubs ────────────────────────────────

describe('GitHubClient', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  function stubFetch(body: unknown, status = 200) {
    global.fetch = vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body)
    }) as unknown as typeof fetch
  }

  it('listIssues maps raw API response to domain types', async () => {
    stubFetch([
      {
        number: 1,
        title: 'Bug report',
        state: 'open',
        body: 'Something broke',
        user: { login: 'alice' },
        labels: [{ name: 'bug' }],
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z',
        comments: 3
      }
    ])

    const client = new GitHubClient('test-token')
    const issues = await client.listIssues({ owner: 'o', repo: 'r' })

    expect(issues).toHaveLength(1)
    expect(issues[0]).toEqual({
      number: 1,
      title: 'Bug report',
      state: 'open',
      body: 'Something broke',
      author: 'alice',
      labels: ['bug'],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
      commentCount: 3
    })
  })

  it('listIssues filters out pull requests from issues endpoint', async () => {
    stubFetch([
      { number: 1, title: 'Issue', state: 'open', body: '', user: { login: 'a' }, labels: [], created_at: '', updated_at: '', comments: 0 },
      { number: 2, title: 'PR', state: 'open', body: '', user: { login: 'b' }, labels: [], created_at: '', updated_at: '', comments: 0, pull_request: {} }
    ])

    const client = new GitHubClient('test-token')
    const issues = await client.listIssues({ owner: 'o', repo: 'r' })
    expect(issues).toHaveLength(1)
    expect(issues[0].number).toBe(1)
  })

  it('listPullRequests maps merged PRs correctly', async () => {
    stubFetch([
      {
        number: 10,
        title: 'Add feature',
        state: 'closed',
        body: 'New stuff',
        user: { login: 'bob' },
        labels: [],
        head: { ref: 'feature' },
        base: { ref: 'main' },
        draft: false,
        mergeable: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-03T00:00:00Z',
        comments: 1,
        merged_at: '2026-01-03T00:00:00Z'
      }
    ])

    const client = new GitHubClient('test-token')
    const prs = await client.listPullRequests({ owner: 'o', repo: 'r' })

    expect(prs[0].state).toBe('merged')
    expect(prs[0].headBranch).toBe('feature')
    expect(prs[0].baseBranch).toBe('main')
  })

  it('sends correct authorization header', async () => {
    stubFetch([])
    const client = new GitHubClient('my-secret-token')
    await client.listIssues({ owner: 'o', repo: 'r' })

    expect(global.fetch).toHaveBeenCalledOnce()
    const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(callArgs[1].headers.Authorization).toBe('Bearer my-secret-token')
  })

  it('throws GitHubError on 404', async () => {
    stubFetch({ message: 'Not Found' }, 404)
    const client = new GitHubClient('test-token')

    await expect(client.getIssue({ owner: 'o', repo: 'r' }, 999))
      .rejects.toThrow(GitHubError)
  })

  it('throws GitHubError on 401', async () => {
    stubFetch({ message: 'Bad credentials' }, 401)
    const client = new GitHubClient('bad-token')

    await expect(client.listIssues({ owner: 'o', repo: 'r' }))
      .rejects.toThrow('Bad credentials')
  })
})

// ── Tool schema validation and execution ─────────────────────────

describe('GitHub tools', () => {
  function mockClient() {
    return {
      listIssues: vi.fn().mockResolvedValue([
        { number: 1, title: 'Bug', state: 'open', body: 'desc', author: 'a', labels: ['bug'], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', commentCount: 0 }
      ]),
      getIssue: vi.fn().mockResolvedValue(
        { number: 1, title: 'Bug', state: 'open', body: 'desc', author: 'a', labels: ['bug'], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', commentCount: 0 }
      ),
      listIssueComments: vi.fn().mockResolvedValue([
        { author: 'b', body: 'comment', createdAt: '2026-01-02T00:00:00Z' }
      ]),
      listPullRequests: vi.fn().mockResolvedValue([
        { number: 5, title: 'PR', state: 'open', body: null, author: 'c', labels: [], headBranch: 'feat', baseBranch: 'main', draft: false, mergeable: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', commentCount: 0 }
      ]),
      getPullRequest: vi.fn().mockResolvedValue(
        { number: 5, title: 'PR', state: 'open', body: null, author: 'c', labels: [], headBranch: 'feat', baseBranch: 'main', draft: false, mergeable: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', commentCount: 0 }
      ),
      listPRReviews: vi.fn().mockResolvedValue([
        { author: 'd', state: 'approved', body: 'LGTM', submittedAt: '2026-01-02T00:00:00Z' }
      ]),
      listPRChecks: vi.fn().mockResolvedValue([
        { name: 'CI', status: 'completed', conclusion: 'success' }
      ])
    } as unknown as import('../src/main/github').GitHubClient
  }

  const identity = { owner: 'test', repo: 'repo' }

  function ctx(): ToolContext {
    return { workspacePath: '/tmp/test', githubClient: mockClient(), githubIdentity: identity }
  }

  it('get_issues returns issues from mock client', async () => {
    const result = await getIssuesTool.execute({}, ctx())
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0].title).toBe('Bug')
    expect(result.truncated).toBe(false)
  })

  it('get_issues throws without GitHub configured', async () => {
    await expect(getIssuesTool.execute({}, { workspacePath: '/tmp' }))
      .rejects.toThrow('GitHub not configured')
  })

  it('get_issue_detail returns issue and comments', async () => {
    const result = await getIssueDetailTool.execute({ issueNumber: 1 }, ctx())
    expect(result.issue.number).toBe(1)
    expect(result.comments).toHaveLength(1)
    expect(result.comments[0].author).toBe('b')
  })

  it('get_pull_requests returns PRs', async () => {
    const result = await getPullRequestsTool.execute({}, ctx())
    expect(result.pullRequests).toHaveLength(1)
    expect(result.pullRequests[0].headBranch).toBe('feat')
  })

  it('get_pr_detail returns PR with reviews and checks', async () => {
    const result = await getPRDetailTool.execute({ prNumber: 5 }, ctx())
    expect(result.pullRequest.number).toBe(5)
    expect(result.reviews).toHaveLength(1)
    expect(result.reviews[0].state).toBe('approved')
    expect(result.checks).toHaveLength(1)
    expect(result.checks[0].conclusion).toBe('success')
  })
})

// ── Store: GitHub columns on projects ────────────────────────────

describe('Project GitHub columns', () => {
  let testDb: Database.Database

  beforeEach(() => {
    testDb = new Database(':memory:')
    __setDbOpener(() => testDb)
  })

  afterEach(() => {
    __setDbOpener(null)
    testDb.close()
  })

  it('creates project with GitHub identity', () => {
    const p = createProject('test', '/tmp/test', 'git@github.com:o/r.git', { owner: 'o', repo: 'r' })
    expect(p.githubOwner).toBe('o')
    expect(p.githubRepo).toBe('r')

    const retrieved = getProject(p.id)
    expect(retrieved!.githubOwner).toBe('o')
    expect(retrieved!.githubRepo).toBe('r')
  })

  it('creates project without GitHub identity', () => {
    const p = createProject('test', '/tmp/test2', null)
    expect(p.githubOwner).toBeNull()
    expect(p.githubRepo).toBeNull()
  })
})
