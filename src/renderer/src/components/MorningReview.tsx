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
          const workflows = await window.artemis.workflows.list()

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
  const allAnalytics = projectStates.flatMap(p => p.analytics)

  // Build greeting
  const parts: string[] = []
  if (totalProjects > 0) parts.push(`${totalProjects} project${totalProjects !== 1 ? 's' : ''} checked`)
  if (allSentryIssues.length > 0) parts.push(`${allSentryIssues.length} Sentry issue${allSentryIssues.length !== 1 ? 's' : ''}`)
  if (succeeded.length > 0) parts.push(`${succeeded.length} workflow${succeeded.length !== 1 ? 's' : ''} completed`)
  if (failed.length > 0) parts.push(`${failed.length} need${failed.length !== 1 ? '' : 's'} attention`)

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="morning-review" onClick={e => e.stopPropagation()}>

        {/* Header bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Morning Review</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>&times;</button>
        </div>

        {loading ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '60px 0', textAlign: 'center' }}>
            Collecting portfolio state...
          </div>
        ) : (
          <>
            {/* Date + greeting */}
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{dateStr}</div>
            <div style={{ fontSize: 15, color: 'var(--text-primary)', lineHeight: 1.6, marginBottom: 6 }}>
              Good morning, Reuben.
            </div>

            {/* Structured counts */}
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)', marginBottom: 28 }}>
              {parts.map((p, i) => <span key={i}>{p}</span>)}
            </div>

            {/* Sentry Issues */}
            {allSentryIssues.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#eab308' }}>Sentry</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)' }}>{allSentryIssues.length}</div>
                </div>
                {allSentryIssues.map(issue => {
                  const colonIdx = issue.title.indexOf(':')
                  const errorType = colonIdx > 0 ? issue.title.slice(0, colonIdx) : null
                  const errorMsg = colonIdx > 0 ? issue.title.slice(colonIdx + 1).trim() : issue.title
                  const levelColor = issue.level === 'fatal' ? 'var(--status-danger)' : issue.level === 'error' ? 'var(--status-danger)' : issue.level === 'warning' ? '#eab308' : 'var(--text-muted)'

                  return (
                    <div key={issue.id} style={{
                      padding: '12px 16px', border: '1px solid var(--border-subtle)',
                      borderRadius: 6, marginBottom: 6
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {errorType && (
                            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: levelColor, marginBottom: 3 }}>{errorType}</div>
                          )}
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                            {errorMsg.length > 120 ? errorMsg.slice(0, 120) + '...' : errorMsg}
                          </div>
                        </div>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: levelColor, whiteSpace: 'nowrap', textAlign: 'right' }}>
                          {issue.count} events
                        </div>
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, fontFamily: 'var(--mono)' }}>
                        {issue.projectSlug}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Completed Workflows */}
            {succeeded.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#22c55e' }}>Completed</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)' }}>{succeeded.length}</div>
                </div>
                {succeeded.map(wf => (
                  <div key={wf.workflowId} style={{
                    padding: '12px 16px', border: '1px solid var(--border-subtle)',
                    borderRadius: 6, marginBottom: 6
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>{wf.goal}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.5, whiteSpace: 'pre-line' }}>
                      {wf.summary.length > 150 ? wf.summary.slice(0, 150) + '...' : wf.summary}
                    </div>
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize: 11, padding: '3px 10px' }}
                      onClick={() => { onSelectWorkflow(wf.workflowId); onClose() }}
                    >
                      Inspect workflow
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Failed Workflows */}
            {failed.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#eab308' }}>Needs Attention</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)' }}>{failed.length}</div>
                </div>
                {failed.map(wf => (
                  <div key={wf.workflowId} style={{
                    padding: '12px 16px', border: '1px solid var(--border-subtle)',
                    borderRadius: 6, marginBottom: 6
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>{wf.goal}</div>
                    <div style={{ fontSize: 12, color: 'var(--status-danger)', marginBottom: 8 }}>
                      {wf.verificationReason || wf.summary}
                    </div>
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize: 11, padding: '3px 10px' }}
                      onClick={() => { onSelectWorkflow(wf.workflowId); onClose() }}
                    >
                      Inspect investigation
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Portfolio table */}
            <div style={{ marginTop: 4 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>Portfolio</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <th style={{ textAlign: 'left', padding: '6px 0', color: 'var(--text-muted)', fontWeight: 400, fontSize: 11 }}></th>
                      <th style={{ textAlign: 'left', padding: '6px 12px', color: 'var(--text-muted)', fontWeight: 400, fontSize: 11 }}>Branch</th>
                      <th style={{ textAlign: 'left', padding: '6px 12px', color: 'var(--text-muted)', fontWeight: 400, fontSize: 11 }}>Sentry</th>
                      <th style={{ textAlign: 'right', padding: '6px 0', color: 'var(--text-muted)', fontWeight: 400, fontSize: 11 }}>Sessions (7d)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projectStates.map(ps => (
                      <tr key={ps.project.id} style={{ borderBottom: '1px solid rgba(42,43,48,0.4)' }}>
                        <td style={{ padding: '8px 0', color: 'var(--text-primary)', fontWeight: 500, fontSize: 12 }}>{ps.project.name}</td>
                        <td style={{ padding: '8px 12px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)' }}>{ps.project.branch || '-'}</td>
                        <td style={{ padding: '8px 12px', fontSize: 11, color: ps.sentryIssues.length > 0 ? '#eab308' : 'var(--text-muted)' }}>
                          {ps.sentryIssues.length > 0 ? `${ps.sentryIssues.length} issue${ps.sentryIssues.length !== 1 ? 's' : ''}` : 'Clear'}
                        </td>
                        <td style={{ padding: '8px 0', textAlign: 'right', fontSize: 11 }}>
                          {ps.analytics.length > 0 ? ps.analytics.map((a, i) => (
                            <span key={a.label} style={{ color: 'var(--text-secondary)' }}>
                              {i > 0 && <span style={{ color: 'var(--text-muted)' }}> / </span>}
                              {a.sessions.toLocaleString()}
                              {a.sessionsChange !== null && a.sessionsChange !== 0 && (
                                <span style={{ color: a.sessionsChange > 0 ? '#22c55e' : 'var(--text-muted)', marginLeft: 4 }}>
                                  {a.sessionsChange > 0 ? '+' : ''}{a.sessionsChange}%
                                </span>
                              )}
                            </span>
                          )) : <span style={{ color: 'var(--text-muted)' }}>-</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Empty workflows state */}
            {succeeded.length === 0 && failed.length === 0 && allSentryIssues.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: '20px 0', textAlign: 'center' }}>
                No workflows or signals to report. Run a workflow to see results here.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
