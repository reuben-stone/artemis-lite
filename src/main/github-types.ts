/**
 * GitHub domain types.
 * No external dependencies — these are Artemis-owned representations,
 * not SDK types leaked into the domain.
 */

export interface GitHubIdentity {
  owner: string
  repo: string
}

export interface GitHubIssue {
  number: number
  title: string
  state: 'open' | 'closed'
  body: string | null
  author: string
  labels: string[]
  createdAt: string
  updatedAt: string
  commentCount: number
}

export interface GitHubComment {
  author: string
  body: string
  createdAt: string
}

export interface GitHubPullRequest {
  number: number
  title: string
  state: 'open' | 'closed' | 'merged'
  body: string | null
  author: string
  labels: string[]
  headBranch: string
  baseBranch: string
  draft: boolean
  mergeable: boolean | null
  createdAt: string
  updatedAt: string
  commentCount: number
}

export interface GitHubReview {
  author: string
  state: 'approved' | 'changes_requested' | 'commented' | 'dismissed' | 'pending'
  body: string
  submittedAt: string
}

export interface GitHubCheckRun {
  name: string
  status: 'queued' | 'in_progress' | 'completed'
  conclusion: string | null
}
