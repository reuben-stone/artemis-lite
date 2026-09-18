/**
 * Google Analytics Data API adapter.
 * Fetches basic metrics (sessions, users, views) from GA4 properties.
 * Uses service account JWT auth - no SDK dependency.
 */
import { getSecret } from './secrets'
import { createSign } from 'crypto'

const GA_API = 'https://analyticsdata.googleapis.com/v1beta'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const TIMEOUT_MS = 10_000

// ── Domain types ──────────────────────────────────────────────────

export interface AnalyticsSummary {
  propertyId: string
  label: string
  sessions: number
  users: number
  pageViews: number
  sessionsChange: number | null // percentage change vs prior period
}

// ── JWT auth for service accounts ─────────────────────────────────

interface ServiceAccount {
  client_email: string
  private_key: string
  token_uri?: string
}

let cachedToken: { token: string; expiresAt: number } | null = null

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token
  }

  const now = Math.floor(Date.now() / 1000)
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600
  })).toString('base64url')

  const sign = createSign('RSA-SHA256')
  sign.update(`${header}.${payload}`)
  const signature = sign.sign(sa.private_key, 'base64url')

  const jwt = `${header}.${payload}.${signature}`

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`GA auth failed: ${res.status} ${body.slice(0, 200)}`)
  }

  const data = await res.json() as { access_token: string; expires_in: number }
  cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in * 1000) }
  return cachedToken.token
}

// ── Client ────────────────────────────────────────────────────────

export class AnalyticsClient {
  private serviceAccount: ServiceAccount

  constructor(credentialsJson: string) {
    this.serviceAccount = JSON.parse(credentialsJson)
  }

  async getPropertySummary(propertyId: string, label: string): Promise<AnalyticsSummary> {
    const token = await getAccessToken(this.serviceAccount)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
      // Current period: last 7 days vs prior 7 days
      const formatDate = (d: Date) => d.toISOString().split('T')[0]
      const end = new Date()
      end.setDate(end.getDate() - 1) // yesterday
      const start = new Date()
      start.setDate(start.getDate() - 7)
      const priorEnd = new Date()
      priorEnd.setDate(priorEnd.getDate() - 8)
      const priorStart = new Date()
      priorStart.setDate(priorStart.getDate() - 14)

      const body = {
        dateRanges: [
          { startDate: formatDate(start), endDate: formatDate(end) },
          { startDate: formatDate(priorStart), endDate: formatDate(priorEnd) }
        ],
        metrics: [
          { name: 'sessions' },
          { name: 'totalUsers' },
          { name: 'screenPageViews' }
        ]
      }

      const res = await fetch(`${GA_API}/properties/${propertyId}:runReport`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        signal: controller.signal
      })

      if (!res.ok) {
        const errBody = await res.text()
        throw new Error(`GA API ${res.status}: ${errBody.slice(0, 200)}`)
      }

      const data = await res.json() as {
        rows?: Array<{ metricValues: Array<{ value: string }> }>
      }

      const current = data.rows?.[0]?.metricValues ?? []
      const previous = data.rows?.[1]?.metricValues ?? []

      const sessions = parseInt(current[0]?.value ?? '0', 10)
      const prevSessions = parseInt(previous[0]?.value ?? '0', 10)
      const change = prevSessions > 0 ? Math.round(((sessions - prevSessions) / prevSessions) * 100) : null

      return {
        propertyId,
        label,
        sessions,
        users: parseInt(current[1]?.value ?? '0', 10),
        pageViews: parseInt(current[2]?.value ?? '0', 10),
        sessionsChange: change
      }
    } finally {
      clearTimeout(timer)
    }
  }
}

// ── Factory ───────────────────────────────────────────────────────

export function createAnalyticsClient(): AnalyticsClient | null {
  const credentials = getSecret('google_analytics')
  if (!credentials) return null
  try {
    return new AnalyticsClient(credentials)
  } catch {
    return null
  }
}
