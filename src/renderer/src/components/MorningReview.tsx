import { useState, useEffect } from 'react'
import type { ProjectInfo } from '../App'

interface WorkflowResultSummary {
  workflowId: string
  goal: string
  status: 'succeeded' | 'failed' | 'partial'
  summary: string
  verificationReason: string | null
  artifacts: string | null
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
                    workflowId: wf.id, goal: wf.goal,
                    status: resultData.result.status, summary: resultData.result.summary,
                    verificationReason: resultData.result.verificationReason,
                    artifacts: resultData.result.artifacts,
                    createdAt: wf.createdAt
                  })
                }
              } catch { /* ok */ }
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
                  analytics.push({ label: res.summary.label, sessions: res.summary.sessions, sessionsChange: res.summary.sessionsChange })
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

  const succeeded = projectStates.flatMap(p => p.workflows).filter(w => w.status === 'succeeded')
  const failed = projectStates.flatMap(p => p.workflows).filter(w => w.status === 'failed' || w.status === 'partial')
  const allSentryIssues = projectStates.flatMap(p => p.sentryIssues)
  const allAnalytics = projectStates.flatMap(p => p.analytics)

  // Summary parts
  const parts: string[] = []
  parts.push(`${projectStates.length} projects checked`)
  if (allSentryIssues.length > 0) parts.push(`${allSentryIssues.length} Sentry issue${allSentryIssues.length !== 1 ? 's' : ''}`)
  if (succeeded.length > 0) parts.push(`${succeeded.length} workflow${succeeded.length !== 1 ? 's' : ''} completed`)
  if (failed.length > 0) parts.push(`${failed.length} need${failed.length !== 1 ? '' : 's'} attention`)

  const S: Record<string, React.CSSProperties> = {
    sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 },
    sectionLabel: { fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase' as const },
    sectionCount: { fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)' },
    card: { padding: '14px 18px', border: '1px solid var(--border-subtle)', borderRadius: 6, marginBottom: 8 },
    cardTitle: { fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 },
    cardDesc: { fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10, lineHeight: 1.5 },
    metaGrid: { display: 'grid', gridTemplateColumns: '110px 1fr', gap: '3px 14px', fontSize: 12, marginBottom: 12 } as React.CSSProperties,
    metaLabel: { color: 'var(--text-muted)' },
    metaValue: { color: 'var(--text-secondary)' },
    actionRow: { display: 'flex', gap: 8 },
    actionBtn: { padding: '4px 12px', border: '1px solid var(--border-subtle)', borderRadius: 4, fontSize: 11, color: 'var(--text-secondary)', background: 'none', cursor: 'pointer' },
    actionBtnPrimary: { padding: '4px 12px', border: '1px solid var(--accent)', borderRadius: 4, fontSize: 11, color: 'var(--accent)', background: 'none', cursor: 'pointer' },
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="morning-review" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28, flexShrink: 0 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Morning Review</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>&times;</button>
        </div>

        {loading ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '80px 0', textAlign: 'center' }}>
            Collecting portfolio state...
          </div>
        ) : (
          <div style={{ overflowY: 'auto', flex: 1, marginRight: -8, paddingRight: 8 }}>

            {/* Date + greeting */}
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{dateStr}</div>
            <div style={{ fontSize: 15, color: 'var(--text-primary)', lineHeight: 1.6, marginBottom: 8 }}>
              Good morning, Reuben.
            </div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)', marginBottom: 32 }}>
              {parts.map((p, i) => <span key={i}>{p}</span>)}
            </div>

            {/* Ready for Review */}
            {succeeded.length > 0 && (
              <div style={{ marginBottom: 28 }}>
                <div style={S.sectionHeader}>
                  <div style={{ ...S.sectionLabel, color: '#22c55e' }}>Ready for Review</div>
                  <div style={S.sectionCount}>{succeeded.length}</div>
                </div>

                {succeeded.map(wf => {
                  // Try to extract structured data from artifacts
                  let artifactData: any[] = []
                  try { if (wf.artifacts) artifactData = JSON.parse(wf.artifacts) } catch { /* ok */ }

                  // Check for test/verification results in artifacts
                  const testArtifact = artifactData.find((a: any) => a.data?.passed !== undefined)
                  const branchArtifact = artifactData.find((a: any) => a.data?.branchName)
                  const prArtifact = artifactData.find((a: any) => a.data?.url)

                  return (
                    <div key={wf.workflowId} style={S.card}>
                      <div style={S.cardTitle}>{wf.goal}</div>
                      <div style={S.cardDesc}>
                        {wf.summary.length > 120 ? wf.summary.slice(0, 120) + '...' : wf.summary}
                      </div>

                      <div style={S.metaGrid}>
                        {branchArtifact && <>
                          <span style={S.metaLabel}>Branch</span>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-secondary)' }}>{branchArtifact.data.branchName}</span>
                        </>}
                        {testArtifact && <>
                          <span style={S.metaLabel}>Tests</span>
                          <span style={{ color: testArtifact.data.passed ? '#22c55e' : 'var(--status-danger)' }}>
                            {testArtifact.data.passed ? 'Passed' : 'Failed'}
                          </span>
                        </>}
                        <span style={S.metaLabel}>Verification</span>
                        <span style={{ color: '#22c55e' }}>Passed</span>
                      </div>

                      <div style={S.actionRow}>
                        <button style={S.actionBtn} onClick={() => { onSelectWorkflow(wf.workflowId); onClose() }}>
                          Inspect workflow
                        </button>
                        {prArtifact && (
                          <button style={S.actionBtnPrimary}>Review changes</button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Needs Attention - failed workflows */}
            {failed.length > 0 && (
              <div style={{ marginBottom: 28 }}>
                <div style={S.sectionHeader}>
                  <div style={{ ...S.sectionLabel, color: '#eab308' }}>Needs Attention</div>
                  <div style={S.sectionCount}>{failed.length}</div>
                </div>
                {failed.map(wf => (
                  <div key={wf.workflowId} style={S.card}>
                    <div style={S.cardTitle}>{wf.goal}</div>
                    <div style={{ fontSize: 12, color: 'var(--status-danger)', marginBottom: 10, lineHeight: 1.5 }}>
                      {wf.verificationReason || wf.summary}
                    </div>
                    <button style={S.actionBtn} onClick={() => { onSelectWorkflow(wf.workflowId); onClose() }}>
                      Inspect investigation
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Sentry */}
            {allSentryIssues.length > 0 && (
              <div style={{ marginBottom: 28 }}>
                <div style={S.sectionHeader}>
                  <div style={{ ...S.sectionLabel, color: '#eab308' }}>Sentry</div>
                  <div style={S.sectionCount}>{allSentryIssues.length}</div>
                </div>
                {allSentryIssues.map(issue => {
                  const colonIdx = issue.title.indexOf(':')
                  const errorType = colonIdx > 0 ? issue.title.slice(0, colonIdx) : null
                  const errorMsg = colonIdx > 0 ? issue.title.slice(colonIdx + 1).trim() : issue.title
                  const levelColor = issue.level === 'fatal' || issue.level === 'error' ? 'var(--status-danger)' : issue.level === 'warning' ? '#eab308' : 'var(--text-muted)'

                  return (
                    <div key={issue.id} style={S.card}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {errorType && (
                            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: levelColor, marginBottom: 4 }}>{errorType}</div>
                          )}
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                            {errorMsg.length > 100 ? errorMsg.slice(0, 100) + '...' : errorMsg}
                          </div>
                        </div>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: levelColor, whiteSpace: 'nowrap' }}>
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

            {/* Portfolio */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ ...S.sectionHeader, marginBottom: 8 }}>
                <div style={{ ...S.sectionLabel, color: 'var(--text-muted)' }}>Portfolio</div>
              </div>
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

            {/* Empty state */}
            {succeeded.length === 0 && failed.length === 0 && allSentryIssues.length === 0 && allAnalytics.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: '20px 0', textAlign: 'center' }}>
                No signals or workflows to report.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
