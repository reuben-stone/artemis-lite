import { useState } from 'react'
import type { ReviewTab } from './ReviewDialog'
import type { ReviewData, SignalInfo } from './ReviewDialog'

interface Props {
  data: ReviewData
  onSwitchTab: (tab: ReviewTab) => void
  onSelectWorkflow: (workflowId: string) => void
  onInvestigate: (projectId: string, goal: string, signalId?: string) => void
  onDismiss: (signalId: string) => void
  onClose: () => void
}

function getSignalForIssue(signals: SignalInfo[], issueId: string): SignalInfo | undefined {
  return signals.find(s => s.source === 'sentry' && s.externalId === issueId)
}

export function ReviewMorning({ data, onSwitchTab, onSelectWorkflow, onInvestigate, onDismiss, onClose }: Props) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null)
  const today = new Date()
  const dateStr = today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

  const succeededWf = data.workflows.filter(w => w.result?.status === 'succeeded')

  // PRs from Artemis branches (our work)
  const artemisPrs = data.prs.filter(pr => pr.headBranch.startsWith('artemis/'))

  // Categorise issues by signal status
  const issuesWithSignals = data.issues.map(issue => ({
    issue,
    signal: getSignalForIssue(data.signals, issue.id)
  }))

  // Issues ready for review (have published signal or matching PR)
  const publishedIssues = issuesWithSignals.filter(({ signal }) =>
    signal?.status === 'published'
  )

  // Issues currently being investigated
  const investigatingIssues = issuesWithSignals.filter(({ signal }) =>
    signal?.status === 'investigating'
  )

  // Issues where investigation failed
  const failedIssues = issuesWithSignals.filter(({ signal }) =>
    signal?.status === 'failed'
  )

  // Issues needing attention (observed or no signal yet)
  const needsAttentionIssues = issuesWithSignals.filter(({ signal }) =>
    !signal || signal.status === 'observed'
  )

  // Issues already investigated but not yet published
  const investigatedIssues = issuesWithSignals.filter(({ signal }) =>
    signal?.status === 'investigated'
  )

  // Summary counts
  const parts: string[] = []
  parts.push(`${data.portfolioRows.length} projects`)
  if (data.issues.length > 0) parts.push(`${data.issues.length} Sentry issue${data.issues.length !== 1 ? 's' : ''}`)
  if (artemisPrs.length > 0) parts.push(`${artemisPrs.length} fix${artemisPrs.length !== 1 ? 'es' : ''} prepared`)
  if (needsAttentionIssues.length > 0) parts.push(`${needsAttentionIssues.length} needs attention`)

  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{dateStr}</div>
      <div style={{ fontSize: 15, color: 'var(--text-primary)', lineHeight: 1.6, marginBottom: 8 }}>
        Good morning, Reuben.{' '}
        {needsAttentionIssues.length > 0 || artemisPrs.length > 0 ? (
          <>
            {needsAttentionIssues.length > 0 && `${needsAttentionIssues.length} issue${needsAttentionIssues.length !== 1 ? 's need' : ' needs'} your attention`}
            {needsAttentionIssues.length > 0 && artemisPrs.length > 0 && ' and '}
            {artemisPrs.length > 0 && `${artemisPrs.length} verified fix${artemisPrs.length !== 1 ? 'es are' : ' is'} ready for review`}
            .
          </>
        ) : data.issues.length === 0 ? 'Everything looks clear.' : ''}
      </div>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)', marginBottom: 28 }}>
        {parts.map((p, i) => <span key={i}>{p}</span>)}
      </div>

      {/* Ready for Review - PRs from Artemis with structured cards */}
      {artemisPrs.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <div className="review-section-label" style={{ color: '#22c55e' }}>Ready for Review</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)' }}>{artemisPrs.length}</div>
          </div>
          {artemisPrs.map(pr => {
            const proj = data.projects.find((p: any) => p.name === pr.project)
            const prUrl = proj?.githubOwner && proj?.githubRepo
              ? `https://github.com/${proj.githubOwner}/${proj.githubRepo}/pull/${pr.number}`
              : null
            const wf = data.workflows.find((w: any) =>
              (w as any).delegateOutput?.observed?.branchName === pr.headBranch ||
              w.goal?.toLowerCase().includes(pr.project.toLowerCase()) ||
              w.goal?.toLowerCase().includes(pr.title.slice(0, 30).toLowerCase())
            )
            const delegateOutput = (wf as any)?.delegateOutput
            const engineOutput = delegateOutput?.engine?.output ?? ''
            const observed = delegateOutput?.observed

            let finding = ''
            if (engineOutput) {
              const cleaned = engineOutput
                .replace(/^Done\.?\s*(Here'?s?\s*(a\s+)?summary[^:]*:?\s*)?/i, '')
                .replace(/^---+\s*/m, '')
                .trim()
              const firstLine = cleaned.split('\n').find((l: string) => l.trim().length > 20)
              if (firstLine) finding = firstLine.trim().slice(0, 150)
            }

            const issueTitle = pr.title.replace(/^fix\(\w+\):\s*/i, '')

            return (
              <div key={`${pr.project}-${pr.number}`} className="review-card" style={{ padding: '16px 20px' }}>
                <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>{pr.project}</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  {issueTitle}
                </div>
                {finding && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.5 }}>
                    {finding}
                  </div>
                )}
                {observed?.diff && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
                    {observed.diff.files?.length} file(s) changed, +{observed.diff.additions} -{observed.diff.deletions}
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '4px 16px', fontSize: 12, marginBottom: 16 }}>
                  {(() => {
                    // Check for [sentry] tag in PR title (set by publishWorkflowPR)
                    const tagMatch = pr.title.match(/\[(\w+)\]$/)
                    if (tagMatch) {
                      return (
                        <>
                          <span style={{ color: 'var(--text-muted)' }}>Signal</span>
                          <span style={{ color: 'var(--text-secondary)' }}>{tagMatch[1].charAt(0).toUpperCase() + tagMatch[1].slice(1)}</span>
                        </>
                      )
                    }
                    // Fallback: check if workflow is linked to a signal
                    const hasSignalLink = wf && data.signals.some(s => s.workflowId === wf.id)
                    return hasSignalLink ? (
                      <>
                        <span style={{ color: 'var(--text-muted)' }}>Signal</span>
                        <span style={{ color: 'var(--text-secondary)' }}>Sentry</span>
                      </>
                    ) : null
                  })()}
                  <span style={{ color: 'var(--text-muted)' }}>Branch</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-secondary)' }}>{pr.headBranch}</span>
                  <span style={{ color: 'var(--text-muted)' }}>PR</span>
                  <span style={{ color: '#22c55e' }}>#{pr.number} {pr.draft ? '(draft)' : 'open'}</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {wf && (
                    <button className="review-action" onClick={() => { onSelectWorkflow(wf.id); onClose() }}>Inspect workflow</button>
                  )}
                  {prUrl && (
                    <a href={prUrl} target="_blank" rel="noopener" className="review-action-primary" style={{ textDecoration: 'none', display: 'inline-block' }}>Review changes</a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Investigating - in-progress workflows */}
      {investigatingIssues.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <div className="review-section-label" style={{ color: '#3b82f6' }}>Investigating</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)' }}>{investigatingIssues.length}</div>
          </div>
          {investigatingIssues.map(({ issue, signal }) => (
            <div key={issue.id} className="review-card" style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>{issue.projectLabel}</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
                {issue.message.length > 100 ? issue.message.slice(0, 100) + '...' : issue.message}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '4px 16px', fontSize: 12, marginBottom: 12 }}>
                <span style={{ color: 'var(--text-muted)' }}>Signal</span>
                <span style={{ color: 'var(--text-secondary)' }}>Sentry - {signal?.eventCount ?? issue.count} events</span>
                <span style={{ color: 'var(--text-muted)' }}>Status</span>
                <span style={{ color: '#3b82f6' }}>Investigating...</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {signal?.workflowId && (
                  <button className="review-action" onClick={() => { onSelectWorkflow(signal.workflowId!); onClose() }}>View workflow</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Failed investigations */}
      {failedIssues.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <div className="review-section-label" style={{ color: '#ef4444' }}>Investigation Failed</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)' }}>{failedIssues.length}</div>
          </div>
          {failedIssues.map(({ issue, signal }) => (
            <div key={issue.id} className="review-card" style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>{issue.projectLabel}</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
                {issue.message.length > 100 ? issue.message.slice(0, 100) + '...' : issue.message}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '4px 16px', fontSize: 12, marginBottom: 12 }}>
                <span style={{ color: 'var(--text-muted)' }}>Signal</span>
                <span style={{ color: 'var(--text-secondary)' }}>Sentry - {signal?.eventCount ?? issue.count} events</span>
                <span style={{ color: 'var(--text-muted)' }}>Status</span>
                <span style={{ color: '#ef4444' }}>Investigation failed</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {signal?.workflowId && (
                  <button className="review-action" onClick={() => { onSelectWorkflow(signal.workflowId!); onClose() }}>View trace</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Needs Attention - observed or unknown issues */}
      {needsAttentionIssues.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <div className="review-section-label" style={{ color: '#eab308' }}>Needs Attention</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)' }}>{needsAttentionIssues.length}</div>
          </div>
          {needsAttentionIssues.slice(0, 3).map(({ issue, signal }) => (
            <div key={issue.id} className="review-card" style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>{issue.projectLabel}</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
                {issue.message.length > 100 ? issue.message.slice(0, 100) + '...' : issue.message}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '4px 16px', fontSize: 12, marginBottom: 12 }}>
                <span style={{ color: 'var(--text-muted)' }}>Signal</span>
                <span style={{ color: 'var(--text-secondary)' }}>Sentry - {signal?.eventCount ?? issue.count} events</span>
                <span style={{ color: 'var(--text-muted)' }}>Investigation</span>
                <span style={{ color: '#eab308' }}>Not yet investigated</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="review-action" onClick={() => onSwitchTab('issues')}>View issue</button>
                <button className="review-action-primary" disabled={!!loadingAction} onClick={() => {
                  setLoadingAction(`investigate-${issue.id}`)
                  onInvestigate(
                    issue.projectId,
                    `Investigate issue in ${issue.projectLabel}: "${issue.title}". ${issue.count} events. Search the repository for relevant code and identify the likely cause.`,
                    signal?.id
                  )
                }}>{loadingAction === `investigate-${issue.id}` ? 'Starting...' : 'Investigate'}</button>
                {signal && (
                  <button className="review-action" disabled={!!loadingAction} onClick={async () => {
                    setLoadingAction(`dismiss-${signal.id}`)
                    try { await onDismiss(signal.id) } finally { setLoadingAction(null) }
                  }}>{loadingAction === `dismiss-${signal.id}` ? 'Dismissing...' : 'Dismiss'}</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Other open PRs (non-Artemis) */}
      {data.prs.filter(pr => !pr.headBranch.startsWith('artemis/')).length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <div className="review-section-label" style={{ color: 'var(--accent)' }}>Other PRs</div>
            <button className="review-link" onClick={() => onSwitchTab('prs')}>View all &rarr;</button>
          </div>
          {data.prs.filter(pr => !pr.headBranch.startsWith('artemis/')).slice(0, 2).map(pr => (
            <div key={`${pr.project}-${pr.number}`} className="review-card">
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 2 }}>{pr.title}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{pr.project} &middot; #{pr.number} &middot; {pr.author}</div>
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
