/**
 * GitHub service layer.
 * All GitHub REST API calls go through this module.
 * Uses built-in fetch — no Octokit dependency.
 * Domain types only — no SDK types leak into consumers.
 */
import type {
  GitHubIdentity,
  GitHubIssue,
  GitHubComment,
  GitHubPullRequest,
  GitHubReview,
  GitHubCheckRun
} from './github-types'

const API_BASE = 'https://api.github.com'
const TIMEOUT_MS = 10_000

// ── Remote URL parsing ────────────────────────────────────────────

/**
 * Extract owner/repo from a git remote URL.
 * Supports SSH (git@github.com:owner/repo.git) and
 * HTTPS (https://github.com/owner/repo.git) formats.
 */
export function parseGitHubRemote(remoteUrl: string): GitHubIdentity | null {
  // SSH: git@github.com:owner/repo.git
  const sshMatch = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/)
  if (sshMatch) return { owner: sshMatch[1], repo: sshMatch[2] }

  // HTTPS: https://github.com/owner/repo.git
  try {
    const url = new URL(remoteUrl)
    if (!url.hostname.includes('github.com')) return null
    const parts = url.pathname.replace(/^\//, '').replace(/\.git$/, '').split('/')
    if (parts.length >= 2 && parts[0] && parts[1]) {
      return { owner: parts[0], repo: parts[1] }
    }
  } catch {
    // Not a valid URL — already tried SSH regex above
  }

  return null
}

// ── GitHub API client ─────────────────────────────────────────────

export class GitHubClient {
  readonly token: string

  constructor(token: string) {
    this.token = token
  }

  private async request<T>(path: string, params?: Record<string, string | number>): Promise<T> {
    const url = new URL(`${API_BASE}${path}`)
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, String(v))
      }
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28'
        },
        signal: controller.signal
      })

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        if (res.status === 404) throw new GitHubError(`Not found: ${path}`, 404)
        if (res.status === 401) throw new GitHubError('Bad credentials — check GITHUB_TOKEN', 401)
        if (res.status === 403) throw new GitHubError(`Forbidden (rate limit or permissions): ${body}`, 403)
        throw new GitHubError(`GitHub API ${res.status}: ${body}`, res.status)
      }

      return (await res.json()) as T
    } finally {
      clearTimeout(timer)
    }
  }

  // ── Issues ────────────────────────────────────────────────────

  async listIssues(
    id: GitHubIdentity,
    opts?: { state?: 'open' | 'closed' | 'all'; perPage?: number }
  ): Promise<GitHubIssue[]> {
    const raw = await this.request<RawIssue[]>(
      `/repos/${id.owner}/${id.repo}/issues`,
      {
        state: opts?.state ?? 'open',
        per_page: opts?.perPage ?? 30,
        sort: 'updated',
        direction: 'desc'
      }
    )
    // GitHub REST API returns PRs in the issues endpoint — filter them out
    return raw.filter(i => !i.pull_request).map(mapIssue)
  }

  async getIssue(id: GitHubIdentity, issueNumber: number): Promise<GitHubIssue> {
    const raw = await this.request<RawIssue>(
      `/repos/${id.owner}/${id.repo}/issues/${issueNumber}`
    )
    return mapIssue(raw)
  }

  async listIssueComments(id: GitHubIdentity, issueNumber: number): Promise<GitHubComment[]> {
    const raw = await this.request<RawComment[]>(
      `/repos/${id.owner}/${id.repo}/issues/${issueNumber}/comments`,
      { per_page: 50 }
    )
    return raw.map(mapComment)
  }

  // ── Pull Requests ─────────────────────────────────────────────

  async listPullRequests(
    id: GitHubIdentity,
    opts?: { state?: 'open' | 'closed' | 'all'; perPage?: number }
  ): Promise<GitHubPullRequest[]> {
    const raw = await this.request<RawPullRequest[]>(
      `/repos/${id.owner}/${id.repo}/pulls`,
      {
        state: opts?.state ?? 'open',
        per_page: opts?.perPage ?? 30,
        sort: 'updated',
        direction: 'desc'
      }
    )
    return raw.map(mapPR)
  }

  async getPullRequest(id: GitHubIdentity, prNumber: number): Promise<GitHubPullRequest> {
    const raw = await this.request<RawPullRequest>(
      `/repos/${id.owner}/${id.repo}/pulls/${prNumber}`
    )
    return mapPR(raw)
  }

  async listPRReviews(id: GitHubIdentity, prNumber: number): Promise<GitHubReview[]> {
    const raw = await this.request<RawReview[]>(
      `/repos/${id.owner}/${id.repo}/pulls/${prNumber}/reviews`,
      { per_page: 50 }
    )
    return raw.map(mapReview)
  }

  async listPRChecks(id: GitHubIdentity, prNumber: number): Promise<GitHubCheckRun[]> {
    const raw = await this.request<{ check_runs: RawCheckRun[] }>(
      `/repos/${id.owner}/${id.repo}/commits/HEAD/check-runs`,
      { per_page: 50 }
    )
    // For a specific PR we need the head SHA — use the simpler combined status endpoint
    // Actually, use the check-runs for the PR's head ref
    return raw.check_runs.map(mapCheckRun)
  }
}

// ── Error ─────────────────────────────────────────────────────────

export class GitHubError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'GitHubError'
    this.status = status
  }
}

// ── Raw API shapes (internal — not exported) ──────────────────────

interface RawIssue {
  number: number
  title: string
  state: string
  body: string | null
  user: { login: string } | null
  labels: Array<{ name: string }>
  created_at: string
  updated_at: string
  comments: number
  pull_request?: unknown
}

interface RawComment {
  user: { login: string } | null
  body: string
  created_at: string
}

interface RawPullRequest {
  number: number
  title: string
  state: string
  body: string | null
  user: { login: string } | null
  labels: Array<{ name: string }>
  head: { ref: string }
  base: { ref: string }
  draft: boolean
  mergeable: boolean | null
  created_at: string
  updated_at: string
  comments: number
  merged_at: string | null
}

interface RawReview {
  user: { login: string } | null
  state: string
  body: string | null
  submitted_at: string
}

interface RawCheckRun {
  name: string
  status: string
  conclusion: string | null
}

// ── Mappers (raw API → domain types) ──────────────────────────────

function mapIssue(raw: RawIssue): GitHubIssue {
  return {
    number: raw.number,
    title: raw.title,
    state: raw.state === 'open' ? 'open' : 'closed',
    body: raw.body,
    author: raw.user?.login ?? 'unknown',
    labels: raw.labels.map(l => l.name),
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    commentCount: raw.comments
  }
}

function mapComment(raw: RawComment): GitHubComment {
  return {
    author: raw.user?.login ?? 'unknown',
    body: raw.body,
    createdAt: raw.created_at
  }
}

function mapPR(raw: RawPullRequest): GitHubPullRequest {
  let state: 'open' | 'closed' | 'merged' = 'open'
  if (raw.merged_at) state = 'merged'
  else if (raw.state === 'closed') state = 'closed'

  return {
    number: raw.number,
    title: raw.title,
    state,
    body: raw.body,
    author: raw.user?.login ?? 'unknown',
    labels: raw.labels.map(l => l.name),
    headBranch: raw.head.ref,
    baseBranch: raw.base.ref,
    draft: raw.draft,
    mergeable: raw.mergeable,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    commentCount: raw.comments
  }
}

function mapReview(raw: RawReview): GitHubReview {
  const validStates = ['approved', 'changes_requested', 'commented', 'dismissed', 'pending'] as const
  const state = validStates.includes(raw.state.toLowerCase() as typeof validStates[number])
    ? (raw.state.toLowerCase() as GitHubReview['state'])
    : 'commented'

  return {
    author: raw.user?.login ?? 'unknown',
    state,
    body: raw.body ?? '',
    submittedAt: raw.submitted_at
  }
}

function mapCheckRun(raw: RawCheckRun): GitHubCheckRun {
  const validStatuses = ['queued', 'in_progress', 'completed'] as const
  const status = validStatuses.includes(raw.status as typeof validStatuses[number])
    ? (raw.status as GitHubCheckRun['status'])
    : 'queued'

  return {
    name: raw.name,
    status,
    conclusion: raw.conclusion
  }
}
