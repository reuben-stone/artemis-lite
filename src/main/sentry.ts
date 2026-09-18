/**
 * Sentry read adapter.
 * Fetches issues and events from Sentry's REST API.
 * Domain types only - no SDK dependency.
 */
import { getSecret } from './secrets'

const API_BASE = 'https://sentry.io/api/0'
const TIMEOUT_MS = 10_000

// ── Domain types ──────────────────────────────────────────────────

export interface SentryIssue {
  id: string
  title: string
  culprit: string
  shortId: string
  level: 'fatal' | 'error' | 'warning' | 'info'
  status: 'unresolved' | 'resolved' | 'ignored'
  count: string
  firstSeen: string
  lastSeen: string
  isRegression: boolean
  metadata: { type?: string; value?: string; filename?: string }
  project: { slug: string }
}

export interface SentryEvent {
  eventID: string
  title: string
  message: string
  dateCreated: string
  tags: Array<{ key: string; value: string }>
  entries: Array<{ type: string; data: unknown }>
}

// ── Client ────────────────────────────────────────────────────────

export class SentryClient {
  private token: string
  private org: string

  constructor(token: string, org: string) {
    this.token = token
    this.org = org
  }

  private async request<T>(path: string): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
      const res = await fetch(`${API_BASE}${path}`, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        signal: controller.signal
      })

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`Sentry API ${res.status}: ${body.slice(0, 200)}`)
      }

      return (await res.json()) as T
    } finally {
      clearTimeout(timer)
    }
  }

  async listIssues(projectSlug: string, opts?: { query?: string; limit?: number }): Promise<SentryIssue[]> {
    const params = new URLSearchParams()
    params.set('query', opts?.query ?? 'is:unresolved')
    params.set('limit', String(opts?.limit ?? 25))
    params.set('sort', 'freq')

    return this.request<SentryIssue[]>(
      `/projects/${this.org}/${projectSlug}/issues/?${params}`
    )
  }

  async getIssue(issueId: string): Promise<SentryIssue> {
    return this.request<SentryIssue>(`/issues/${issueId}/`)
  }

  async getLatestEvent(issueId: string): Promise<SentryEvent> {
    return this.request<SentryEvent>(`/issues/${issueId}/events/latest/`)
  }
}

// ── Factory ───────────────────────────────────────────────────────

const SENTRY_ORG = 'livana-group-ltd-1a'

export function createSentryClient(): SentryClient | null {
  const token = getSecret('sentry')
  if (!token) return null
  return new SentryClient(token, SENTRY_ORG)
}
