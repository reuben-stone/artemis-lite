import { useState, useEffect } from 'react'
import type { ProjectInfo } from '../App'

interface WorkflowResultSummary {
  workflowId: string
  goal: string
  status: 'succeeded' | 'failed' | 'partial'
  summary: string
  verificationReason: string | null
  createdAt: string
}

interface SentryIssueSummary {
  id: string
  title: string
  level: string
  count: string
  lastSeen: string
  projectSlug: string
}

interface AnalyticsSummaryData {
  label: string
  sessions: number
  sessionsChange: number | null
}

interface ProjectState {
  project: ProjectInfo
  workflows: WorkflowResultSummary[]
  sentryIssues: SentryIssueSummary[]
  analytics: AnalyticsSummaryData[]
}

interface Props {
  onClose: () => void
  onSelectWorkflow: (workflowId: string) => void
}

export function MorningReview({ onClose, onSelectWorkflow }: Props) {
  const [projectStates, setProjectStates] = useState<ProjectState[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const projects = await window.artemis.projects.list()
        const states: ProjectState[] = []

        for (const project of projects) {
          // Get all workflows (they're project-scoped via the active project when created)
          const workflows = await window.artemis.workflows.list()

          // Get results for completed workflows
          const results: WorkflowResultSummary[] = []
          for (const wf of workflows) {
            if (wf.status === 'completed' || wf.status === 'failed') {
              try {
                const resultData = await window.artemis.workflows.result({ workflowId: wf.id })
                if (resultData.result) {
                  results.push({
                    workflowId: wf.id,
                    goal: wf.goal,
                    status: resultData.result.status,
                    summary: resultData.result.summary,
                    verificationReason: resultData.result.verificationReason,
                    createdAt: wf.createdAt
                  })
                }
              } catch { /* no result */ }
            }
          }

          // Fetch Sentry issues for mapped projects
          const sentryIssues: SentryIssueSummary[] = []
          let mappings: Array<{ label: string; sentrySlug: string; gaPropertyId: string; subdir: string }> = []
          try {
            const raw = project.sentryProject
            if (raw && raw.startsWith('[')) mappings = JSON.parse(raw)
          } catch { /* ok */ }

          for (const m of mappings) {
            if (m.sentrySlug) {
              try {
                const res = await window.artemis.sentry.issues({ projectSlug: m.sentrySlug })
                if (res.issues) {
                  sentryIssues.push(...res.issues.slice(0, 5).map((i: any) => ({
                    id: i.id, title: i.title, level: i.level,
                    count: i.count, lastSeen: i.lastSeen, projectSlug: m.sentrySlug
                  })))
                }
              } catch { /* skip */ }
            }
          }

          // Fetch Analytics summaries
          const analytics: AnalyticsSummaryData[] = []
          for (const m of mappings) {
            if (m.gaPropertyId) {
              try {
                const res = await window.artemis.analytics.summary({ propertyId: m.gaPropertyId, label: m.label || project.name })
                if (res.summary) {
                  analytics.push({
                    label: res.summary.label,
                    sessions: res.summary.sessions,
                    sessionsChange: res.summary.sessionsChange
                  })
                }
              } catch { /* skip */ }
            }
          }

          states.push({ project, workflows: results, sentryIssues, analytics })
        }

        setProjectStates(states)
      } catch (err) {
        console.error('Failed to load morning review:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const today = new Date()
  const dateStr = today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

  const totalProjects = projectStates.length
  const succeeded = projectStates.flatMap(p => p.workflows).filter(w => w.status === 'succeeded')
  const failed = projectStates.flatMap(p => p.workflows).filter(w => w.status === 'failed')
  const allSentryIssues = projectStates.flatMap(p => p.sentryIssues)
  const needsAttention = failed.length + allSentryIssues.length

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="morning-review" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 24 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Morning Review</div>
          <button className="btn btn-ghost" onClick={onClose} style={{ fontSize: 16 }}>&times;</button>
        </div>

        {loading ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '40px 0', textAlign: 'center' }}>
            Loading portfolio state...
          </div>
        ) : (
          <>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{dateStr}</div>

            {/* Summary counts */}
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)', marginBottom: 24 }}>
              <span>{totalProjects} projects</span>
              {succeeded.length > 0 && <span>{succeeded.length} completed</span>}
              {allSentryIssues.length > 0 && <span>{allSentryIssues.length} Sentry issues</span>}
              {failed.length > 0 && <span>{failed.length} need attention</span>}
            </div>

            {/* Ready for Review */}
            {succeeded.length > 0 && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#22c55e' }}>Completed</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)' }}>{succeeded.length}</div>
                </div>

                {succeeded.map(wf => (
                  <div key={wf.workflowId} style={{
                    padding: '14px 18px', border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)', marginBottom: 8
                  }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>
                      {wf.goal}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.5, whiteSpace: 'pre-line' }}>
                      {wf.summary.slice(0, 200)}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        className="btn btn-ghost"
                        style={{ fontSize: 11 }}
                        onClick={() => { onSelectWorkflow(wf.workflowId); onClose() }}
                      >
                        Inspect workflow
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* Needs Attention */}
            {failed.length > 0 && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '16px 0 12px' }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#eab308' }}>Needs Attention</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)' }}>{failed.length}</div>
                </div>

                {failed.map(wf => (
                  <div key={wf.workflowId} style={{
                    padding: '14px 18px', border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)', marginBottom: 8
                  }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>
                      {wf.goal}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--status-danger)', marginBottom: 8 }}>
                      {wf.verificationReason || wf.summary}
                    </div>
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize: 11 }}
                      onClick={() => { onSelectWorkflow(wf.workflowId); onClose() }}
                    >
                      Inspect investigation
                    </button>
                  </div>
                ))}
              </>
            )}

            {/* Sentry Issues */}
            {allSentryIssues.length > 0 && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '16px 0 12px' }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#eab308' }}>Sentry</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)' }}>{allSentryIssues.length}</div>
                </div>
                {allSentryIssues.map(issue => (
                  <div key={issue.id} style={{
                    padding: '10px 14px', border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)', marginBottom: 6, fontSize: 12
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{issue.title}</span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: issue.level === 'error' || issue.level === 'fatal' ? 'var(--status-danger)' : 'var(--text-muted)' }}>
                        {issue.count} events
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      {issue.projectSlug}
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* Portfolio */}
            {projectStates.length > 0 && (
              <>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '20px 0 12px' }}>Portfolio</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <th style={{ textAlign: 'left', padding: '6px 0', color: 'var(--text-muted)', fontWeight: 400, fontSize: 11 }}></th>
                        <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 400, fontSize: 11 }}>Branch</th>
                        <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 400, fontSize: 11 }}>Sentry</th>
                        <th style={{ textAlign: 'right', padding: '6px 0', color: 'var(--text-muted)', fontWeight: 400, fontSize: 11 }}>Sessions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projectStates.map(ps => (
                        <tr key={ps.project.id} style={{ borderBottom: '1px solid rgba(42,43,48,0.5)' }}>
                          <td style={{ padding: '8px 0', color: 'var(--text-primary)', fontWeight: 500 }}>{ps.project.name}</td>
                          <td style={{ padding: '8px 8px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)' }}>{ps.project.branch || '-'}</td>
                          <td style={{ padding: '8px 8px', color: ps.sentryIssues.length > 0 ? '#eab308' : 'var(--text-muted)', fontSize: 11 }}>
                            {ps.sentryIssues.length > 0 ? `${ps.sentryIssues.length} issue${ps.sentryIssues.length !== 1 ? 's' : ''}` : 'Clear'}
                          </td>
                          <td style={{ padding: '8px 0', textAlign: 'right', color: 'var(--text-secondary)', fontSize: 11 }}>
                            {ps.analytics.length > 0 ? ps.analytics.map((a, i) => (
                              <span key={a.label}>
                                {i > 0 && ' / '}
                                {a.sessions.toLocaleString()}
                                {a.sessionsChange !== null && a.sessionsChange !== 0 && (
                                  <span style={{ color: a.sessionsChange > 0 ? '#22c55e' : 'var(--text-muted)', marginLeft: 4 }}>
                                    {a.sessionsChange > 0 ? '+' : ''}{a.sessionsChange}%
                                  </span>
                                )}
                              </span>
                            )) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* Empty state */}
            {succeeded.length === 0 && failed.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '24px 0', textAlign: 'center' }}>
                No completed workflows yet. Run a workflow to see results here.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
