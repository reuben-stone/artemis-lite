import { useState, useEffect } from 'react'
import { ReviewMorning } from './ReviewMorning'
import { ReviewIssues } from './ReviewIssues'
import { ReviewPRQueue } from './ReviewPRQueue'
import { ReviewAnalytics } from './ReviewAnalytics'

export type ReviewTab = 'morning' | 'issues' | 'prs' | 'analytics'

// Shared data loaded once and passed to all tabs
export interface ReviewData {
  projects: any[]
  issues: OperationalIssue[]
  prs: ReviewPR[]
  analytics: AnalyticsRow[]
  workflows: any[]
  portfolioRows: PortfolioRow[]
  loading: boolean
}

export interface OperationalIssue {
  id: string
  source: 'sentry'
  projectId: string
  projectLabel: string
  projectSlug: string
  title: string
  errorType: string | null
  message: string
  level: string
  count: string
  lastSeen: string
}

export interface ReviewPR {
  number: number
  title: string
  project: string
  author: string
  headBranch: string
  baseBranch: string
  draft: boolean
  state: string
  labels: string[]
}

export interface AnalyticsRow {
  label: string
  propertyId: string
  sessions: number
  users: number
  pageViews: number
  sessionsChange: number | null
}

export interface PortfolioRow {
  name: string
  branch: string | null
  sentryCount: number
  sessions: number | null
  sessionsChange: number | null
}

interface Props {
  onClose: () => void
  onSelectWorkflow: (workflowId: string) => void
  onCreateWorkflow: (goal: string) => void
  onInvestigate: (projectId: string, goal: string) => void
  initialTab?: ReviewTab
}

export function ReviewDialog({ onClose, onSelectWorkflow, onCreateWorkflow, onInvestigate, initialTab = 'morning' }: Props) {
  const [tab, setTab] = useState<ReviewTab>(initialTab)
  const [data, setData] = useState<ReviewData>({
    projects: [], issues: [], prs: [], analytics: [], workflows: [], portfolioRows: [], loading: true
  })

  useEffect(() => {
    async function loadAll() {
      try {
        const projects = await window.artemis.projects.list()
        const allIssues: OperationalIssue[] = []
        const allPrs: ReviewPR[] = []
        const allAnalytics: AnalyticsRow[] = []
        const portfolioRows: PortfolioRow[] = []

        for (const project of projects) {
          let mappings: any[] = []
          try {
            const raw = project.sentryProject
            if (raw && raw.startsWith('[')) mappings = JSON.parse(raw)
          } catch { /* ok */ }

          // Sentry issues
          for (const m of mappings) {
            if (m.sentrySlug) {
              try {
                const res = await window.artemis.sentry.issues({ projectSlug: m.sentrySlug })
                if (res.issues) {
                  allIssues.push(...res.issues.map((i: any) => {
                    const colonIdx = i.title.indexOf(':')
                    return {
                      id: i.id, source: 'sentry' as const,
                      projectId: project.id,
                      projectLabel: m.label || project.name, projectSlug: m.sentrySlug,
                      title: i.title,
                      errorType: colonIdx > 0 ? i.title.slice(0, colonIdx) : null,
                      message: colonIdx > 0 ? i.title.slice(colonIdx + 1).trim() : i.title,
                      level: i.level, count: i.count, lastSeen: i.lastSeen
                    }
                  }))
                }
              } catch { /* skip */ }
            }
          }

          // GitHub PRs
          if (project.githubOwner && project.githubRepo) {
            try {
              const res = await window.artemis.github.projectPrs({ owner: project.githubOwner, repo: project.githubRepo })
              if (res.pullRequests) {
                allPrs.push(...res.pullRequests.map((pr: any) => ({
                  number: pr.number, title: pr.title, project: project.name,
                  author: pr.author, headBranch: pr.headBranch, baseBranch: pr.baseBranch,
                  draft: pr.draft, state: pr.state, labels: pr.labels || []
                })))
              }
            } catch { /* skip */ }
          }

          // Analytics
          for (const m of mappings) {
            if (m.gaPropertyId) {
              try {
                const res = await window.artemis.analytics.summary({ propertyId: m.gaPropertyId, label: m.label || project.name })
                if (res.summary) {
                  allAnalytics.push({
                    label: res.summary.label, propertyId: m.gaPropertyId,
                    sessions: res.summary.sessions, users: res.summary.users || 0,
                    pageViews: res.summary.pageViews || 0, sessionsChange: res.summary.sessionsChange
                  })
                }
              } catch { /* skip */ }
            }
          }

          // Portfolio rows
          if (mappings.length > 0) {
            for (const m of mappings) {
              const sentryCount = allIssues.filter(i => i.projectSlug === m.sentrySlug).length
              const ga = allAnalytics.find(a => a.label === m.label)
              portfolioRows.push({ name: m.label || project.name, branch: project.branch, sentryCount, sessions: ga?.sessions ?? null, sessionsChange: ga?.sessionsChange ?? null })
            }
          } else {
            portfolioRows.push({ name: project.name, branch: project.branch, sentryCount: 0, sessions: null, sessionsChange: null })
          }
        }

        // Workflows
        const wfList = await window.artemis.workflows.list()
        const wfResults: any[] = []
        for (const wf of wfList.slice(0, 10)) {
          if (wf.status === 'completed' || wf.status === 'failed') {
            try {
              const r = await window.artemis.workflows.result({ workflowId: wf.id })
              if (r.result) wfResults.push({ ...wf, result: r.result })
            } catch { /* ok */ }
          }
        }

        setData({
          projects, issues: allIssues, prs: allPrs, analytics: allAnalytics,
          workflows: wfResults, portfolioRows, loading: false
        })
      } catch (err) {
        console.error('Review load failed:', err)
        setData(prev => ({ ...prev, loading: false }))
      }
    }
    loadAll()
  }, [])

  const switchTab = (t: ReviewTab) => setTab(t)

  const tabs: { id: ReviewTab; label: string; count?: number }[] = [
    { id: 'morning', label: 'Morning' },
    { id: 'issues', label: 'Issues', count: data.issues.length || undefined },
    { id: 'prs', label: 'PR Queue', count: data.prs.length || undefined },
    { id: 'analytics', label: 'Analytics', count: data.analytics.length || undefined }
  ]

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="review-dialog" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 0, flexShrink: 0 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Review</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '4px' }}>&times;</button>
        </div>

        {/* Tab bar */}
        <div className="tab-bar" style={{ flexShrink: 0 }}>
          {tabs.map(t => (
            <button
              key={t.id}
              className="tab"
              data-active={tab === t.id ? 'true' : undefined}
              onClick={() => setTab(t.id)}
            >
              {t.label}{t.count ? ` (${t.count})` : ''}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="review-content">
          {data.loading ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '80px 0', textAlign: 'center' }}>
              Collecting portfolio state...
            </div>
          ) : (
            <>
              {tab === 'morning' && (
                <ReviewMorning data={data} onSwitchTab={switchTab} onSelectWorkflow={onSelectWorkflow} onInvestigate={(projectId, goal) => { onInvestigate(projectId, goal); onClose() }} onClose={onClose} />
              )}
              {tab === 'issues' && (
                <ReviewIssues data={data} onSelectWorkflow={onSelectWorkflow} onInvestigate={(projectId, goal) => { onInvestigate(projectId, goal); onClose() }} onClose={onClose} />
              )}
              {tab === 'prs' && (
                <ReviewPRQueue data={data} />
              )}
              {tab === 'analytics' && (
                <ReviewAnalytics data={data} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
