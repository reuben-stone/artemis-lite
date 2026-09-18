import { useState, useEffect } from 'react'
import type { ReviewTab } from './ReviewDialog'

interface Props {
  onSwitchTab: (tab: ReviewTab) => void
  onSelectWorkflow: (workflowId: string) => void
  onCreateWorkflow: (goal: string) => void
  onClose: () => void
}

export function ReviewMorning({ onSwitchTab, onSelectWorkflow, onCreateWorkflow, onClose }: Props) {
  const [loading, setLoading] = useState(true)
  const [issueCount, setIssueCount] = useState(0)
  const [topIssues, setTopIssues] = useState<any[]>([])
  const [prCount, setPrCount] = useState(0)
  const [analytics, setAnalytics] = useState<any[]>([])
  const [portfolioRows, setPortfolioRows] = useState<any[]>([])
  const [workflows, setWorkflows] = useState<any[]>([])

  useEffect(() => {
    async function load() {
      try {
        const projects = await window.artemis.projects.list()
        let issues: any[] = []
        let prs = 0
        const analyticsData: any[] = []
        const rows: any[] = []

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
                  issues.push(...res.issues.slice(0, 3).map((i: any) => ({
                    ...i, projectLabel: m.label || project.name, projectSlug: m.sentrySlug
                  })))
                }
              } catch { /* skip */ }
            }
          }

          // GitHub PRs
          if (project.githubOwner && project.githubRepo) {
            try {
              const res = await window.artemis.github.projectPrs({ owner: project.githubOwner, repo: project.githubRepo })
              if (res.pullRequests) prs += res.pullRequests.length
            } catch { /* skip */ }
          }

          // Analytics
          for (const m of mappings) {
            if (m.gaPropertyId) {
              try {
                const res = await window.artemis.analytics.summary({ propertyId: m.gaPropertyId, label: m.label || project.name })
                if (res.summary) analyticsData.push(res.summary)
              } catch { /* skip */ }
            }
          }

          // Portfolio rows - expand monorepo mappings
          if (mappings.length > 0) {
            for (const m of mappings) {
              const sentryCount = issues.filter(i => i.projectSlug === m.sentrySlug).length
              const ga = analyticsData.find(a => a.label === m.label)
              rows.push({ name: m.label || project.name, branch: project.branch, sentryCount, sessions: ga?.sessions, sessionsChange: ga?.sessionsChange })
            }
          } else {
            rows.push({ name: project.name, branch: project.branch, sentryCount: 0, sessions: null, sessionsChange: null })
          }
        }

        // Workflows with results
        const wfList = await window.artemis.workflows.list()
        const wfResults: any[] = []
        for (const wf of wfList.slice(0, 5)) {
          if (wf.status === 'completed' || wf.status === 'failed') {
            try {
              const r = await window.artemis.workflows.result({ workflowId: wf.id })
              if (r.result) wfResults.push({ ...wf, result: r.result })
            } catch { /* ok */ }
          }
        }

        setIssueCount(issues.length)
        setTopIssues(issues.slice(0, 3))
        setPrCount(prs)
        setAnalytics(analyticsData)
        setPortfolioRows(rows)
        setWorkflows(wfResults)
      } catch (err) {
        console.error('Morning review load failed:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const today = new Date()
  const dateStr = today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

  if (loading) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '80px 0', textAlign: 'center' }}>Collecting portfolio state...</div>
  }

  const succeededWf = workflows.filter(w => w.result?.status === 'succeeded')
  const failedWf = workflows.filter(w => w.result?.status === 'failed')

  // Summary parts
  const parts: string[] = []
  parts.push(`${portfolioRows.length} projects`)
  if (issueCount > 0) parts.push(`${issueCount} issue${issueCount !== 1 ? 's' : ''}`)
  if (prCount > 0) parts.push(`${prCount} PR${prCount !== 1 ? 's' : ''} open`)
  if (succeededWf.length > 0) parts.push(`${succeededWf.length} completed`)

  return (
    <div>
      {/* Greeting */}
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{dateStr}</div>
      <div style={{ fontSize: 15, color: 'var(--text-primary)', lineHeight: 1.6, marginBottom: 8 }}>Good morning, Reuben.</div>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)', marginBottom: 28 }}>
        {parts.map((p, i) => <span key={i}>{p}</span>)}
      </div>

      {/* Issues summary */}
      {issueCount > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <div className="review-section-label" style={{ color: '#eab308' }}>Issues</div>
            <button className="review-link" onClick={() => onSwitchTab('issues')}>View all {issueCount} &rarr;</button>
          </div>
          {topIssues.map((issue: any) => {
            const colonIdx = issue.title.indexOf(':')
            const errorType = colonIdx > 0 ? issue.title.slice(0, colonIdx) : null
            const errorMsg = colonIdx > 0 ? issue.title.slice(colonIdx + 1).trim() : issue.title
            return (
              <div key={issue.id} className="review-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 2 }}>{issue.projectLabel}</div>
                    {errorType && <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--status-danger)', marginBottom: 2 }}>{errorType}</div>}
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{errorMsg.length > 80 ? errorMsg.slice(0, 80) + '...' : errorMsg}</div>
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{issue.count} events</div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button className="review-action" onClick={() => onSwitchTab('issues')}>View issue &rarr;</button>
                  <button className="review-action-primary" onClick={() => {
                    onCreateWorkflow(`Investigate issue in ${issue.projectLabel}: "${issue.title}". ${issue.count} events. Search the repository for relevant code and identify the likely cause.`)
                    onClose()
                  }}>Investigate</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* PR Review summary */}
      {prCount > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <div className="review-section-label" style={{ color: 'var(--accent)' }}>PR Review</div>
            <button className="review-link" onClick={() => onSwitchTab('prs')}>{prCount} awaiting &rarr;</button>
          </div>
        </div>
      )}

      {/* Completed workflows */}
      {succeededWf.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <div className="review-section-label" style={{ color: '#22c55e' }}>Completed</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)' }}>{succeededWf.length}</div>
          </div>
          {succeededWf.slice(0, 3).map((wf: any) => (
            <div key={wf.id} className="review-card">
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>{wf.goal}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.4 }}>
                {wf.result.summary.length > 100 ? wf.result.summary.slice(0, 100) + '...' : wf.result.summary}
              </div>
              <button className="review-action" onClick={() => { onSelectWorkflow(wf.id); onClose() }}>Inspect workflow &rarr;</button>
            </div>
          ))}
        </div>
      )}

      {/* Analytics summary */}
      {analytics.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <div className="review-section-label">Analytics</div>
            <button className="review-link" onClick={() => onSwitchTab('analytics')}>View details &rarr;</button>
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {analytics.map((a: any) => (
              <div key={a.label} style={{ fontSize: 12 }}>
                <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{a.label}</span>
                <span style={{ color: 'var(--text-secondary)', marginLeft: 8 }}>{a.sessions.toLocaleString()} sessions</span>
                {a.sessionsChange !== null && a.sessionsChange !== 0 && (
                  <span style={{ color: a.sessionsChange > 0 ? '#22c55e' : 'var(--text-muted)', marginLeft: 4, fontSize: 11 }}>
                    {a.sessionsChange > 0 ? '+' : ''}{a.sessionsChange}%
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Portfolio */}
      <div>
        <div className="review-section-label" style={{ marginBottom: 8 }}>Portfolio</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <th style={{ textAlign: 'left', padding: '6px 0', color: 'var(--text-muted)', fontWeight: 400, fontSize: 11 }}></th>
              <th style={{ textAlign: 'left', padding: '6px 12px', color: 'var(--text-muted)', fontWeight: 400, fontSize: 11 }}>Branch</th>
              <th style={{ textAlign: 'left', padding: '6px 12px', color: 'var(--text-muted)', fontWeight: 400, fontSize: 11 }}>Issues</th>
              <th style={{ textAlign: 'right', padding: '6px 0', color: 'var(--text-muted)', fontWeight: 400, fontSize: 11 }}>Sessions (7d)</th>
            </tr>
          </thead>
          <tbody>
            {portfolioRows.map((r: any, i: number) => (
              <tr key={i} style={{ borderBottom: '1px solid rgba(42,43,48,0.4)' }}>
                <td style={{ padding: '7px 0', color: 'var(--text-primary)', fontWeight: 500, fontSize: 12 }}>{r.name}</td>
                <td style={{ padding: '7px 12px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)' }}>{r.branch || '-'}</td>
                <td style={{ padding: '7px 12px', fontSize: 11, color: r.sentryCount > 0 ? '#eab308' : 'var(--text-muted)' }}>
                  {r.sentryCount > 0 ? `${r.sentryCount}` : 'Clear'}
                </td>
                <td style={{ padding: '7px 0', textAlign: 'right', fontSize: 11 }}>
                  {r.sessions != null ? (
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {r.sessions.toLocaleString()}
                      {r.sessionsChange !== null && r.sessionsChange !== 0 && (
                        <span style={{ color: r.sessionsChange > 0 ? '#22c55e' : 'var(--text-muted)', marginLeft: 4 }}>
                          {r.sessionsChange > 0 ? '+' : ''}{r.sessionsChange}%
                        </span>
                      )}
                    </span>
                  ) : <span style={{ color: 'var(--text-muted)' }}>-</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
