import type { ReviewTab } from './ReviewDialog'
import type { ReviewData } from './ReviewDialog'

interface Props {
  data: ReviewData
  onSwitchTab: (tab: ReviewTab) => void
  onSelectWorkflow: (workflowId: string) => void
  onInvestigate: (projectId: string, goal: string) => void
  onClose: () => void
}

export function ReviewMorning({ data, onSwitchTab, onSelectWorkflow, onInvestigate, onClose }: Props) {
  const today = new Date()
  const dateStr = today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

  const succeededWf = data.workflows.filter(w => w.result?.status === 'succeeded')
  const failedWf = data.workflows.filter(w => w.result?.status === 'failed')

  const parts: string[] = []
  parts.push(`${data.portfolioRows.length} projects`)
  if (data.issues.length > 0) parts.push(`${data.issues.length} issue${data.issues.length !== 1 ? 's' : ''}`)
  if (data.prs.length > 0) parts.push(`${data.prs.length} PR${data.prs.length !== 1 ? 's' : ''} open`)
  if (succeededWf.length > 0) parts.push(`${succeededWf.length} completed`)

  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{dateStr}</div>
      <div style={{ fontSize: 15, color: 'var(--text-primary)', lineHeight: 1.6, marginBottom: 8 }}>Good morning, Reuben.</div>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)', marginBottom: 28 }}>
        {parts.map((p, i) => <span key={i}>{p}</span>)}
      </div>

      {/* Issues */}
      {data.issues.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <div className="review-section-label" style={{ color: '#eab308' }}>Issues</div>
            <button className="review-link" onClick={() => onSwitchTab('issues')}>View all {data.issues.length} &rarr;</button>
          </div>
          {data.issues.slice(0, 3).map(issue => {
            // Check if a PR exists for this issue (Artemis branch matching issue title)
            const matchingPr = data.prs.find(pr =>
              pr.headBranch.startsWith('artemis/') &&
              pr.title.toLowerCase().includes(issue.projectLabel.toLowerCase())
            )
            // Check if a workflow investigated this
            const matchingWf = data.workflows.find(w =>
              w.goal?.includes(issue.title.slice(0, 40)) && w.result?.status === 'succeeded'
            )

            return (
              <div key={issue.id} className="review-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 2 }}>{issue.projectLabel}</div>
                    {issue.errorType && <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--status-danger)', marginBottom: 2 }}>{issue.errorType}</div>}
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{issue.message.length > 80 ? issue.message.slice(0, 80) + '...' : issue.message}</div>
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{issue.count} events</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                  {matchingPr ? (
                    <>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#22c55e' }}>PR #{matchingPr.number} open</span>
                      <button className="review-action" onClick={() => onSwitchTab('prs')}>Review PR &rarr;</button>
                    </>
                  ) : matchingWf ? (
                    <>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent)' }}>Investigated</span>
                      <button className="review-action" onClick={() => { onSelectWorkflow(matchingWf.id); onClose() }}>View result &rarr;</button>
                    </>
                  ) : (
                    <>
                      <button className="review-action" onClick={() => onSwitchTab('issues')}>View issue &rarr;</button>
                      <button className="review-action-primary" onClick={() => {
                        onInvestigate(issue.projectId, `Investigate issue in ${issue.projectLabel}: "${issue.title}". ${issue.count} events. Search the repository for relevant code and identify the likely cause.`)
                      }}>Investigate</button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* PR Review */}
      {data.prs.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <div className="review-section-label" style={{ color: 'var(--accent)' }}>PR Review</div>
            <button className="review-link" onClick={() => onSwitchTab('prs')}>{data.prs.length} awaiting &rarr;</button>
          </div>
          {data.prs.slice(0, 2).map(pr => (
            <div key={`${pr.project}-${pr.number}`} className="review-card">
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 2 }}>{pr.title}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{pr.project} &middot; #{pr.number} &middot; {pr.author}</div>
            </div>
          ))}
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

      {/* Analytics */}
      {data.analytics.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <div className="review-section-label">Analytics</div>
            <button className="review-link" onClick={() => onSwitchTab('analytics')}>View details &rarr;</button>
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {data.analytics.map(a => (
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
            {data.portfolioRows.map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid rgba(42,43,48,0.4)' }}>
                <td style={{ padding: '7px 0', color: 'var(--text-primary)', fontWeight: 500, fontSize: 12 }}>{r.name}</td>
                <td style={{ padding: '7px 12px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)' }}>{r.branch || '-'}</td>
                <td style={{ padding: '7px 12px', fontSize: 11, color: r.sentryCount > 0 ? '#eab308' : 'var(--text-muted)' }}>{r.sentryCount > 0 ? r.sentryCount : 'Clear'}</td>
                <td style={{ padding: '7px 0', textAlign: 'right', fontSize: 11 }}>
                  {r.sessions != null ? (
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {r.sessions.toLocaleString()}
                      {r.sessionsChange != null && r.sessionsChange !== 0 && (
                        <span style={{ color: r.sessionsChange > 0 ? '#22c55e' : 'var(--text-muted)', marginLeft: 4 }}>{r.sessionsChange > 0 ? '+' : ''}{r.sessionsChange}%</span>
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
