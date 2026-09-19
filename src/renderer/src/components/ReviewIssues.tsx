import type { ReviewData } from './ReviewDialog'

interface Props {
  data: ReviewData
  onSelectWorkflow: (workflowId: string) => void
  onInvestigate: (projectId: string, goal: string) => void
  onClose: () => void
}

export function ReviewIssues({ data, onSelectWorkflow, onInvestigate, onClose }: Props) {
  const getInvestigationState = (issueTitle: string) => {
    const matching = data.workflows.find(w => w.goal?.includes(issueTitle.slice(0, 40)))
    if (!matching) return { state: 'uninvestigated' as const, workflowId: null }
    if (matching.status === 'completed' || matching.status === 'failed') return { state: 'complete' as const, workflowId: matching.id }
    return { state: 'investigating' as const, workflowId: matching.id }
  }

  if (data.issues.length === 0) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '60px 0', textAlign: 'center' }}>No unresolved issues across registered projects.</div>
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 16 }}>{data.issues.length} issue{data.issues.length !== 1 ? 's' : ''} across registered projects</div>

      {data.issues.map(issue => {
        const investigation = getInvestigationState(issue.title)
        const levelColor = issue.level === 'fatal' || issue.level === 'error' ? 'var(--status-danger)' : issue.level === 'warning' ? '#eab308' : 'var(--text-muted)'

        return (
          <div key={issue.id} className="review-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 6 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 2 }}>{issue.projectLabel}</div>
                {issue.errorType && <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: levelColor, marginBottom: 3 }}>{issue.errorType}</div>}
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{issue.message}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: levelColor }}>{issue.count} events</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{issue.projectSlug}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
              {(() => {
                // Check if a PR already exists for this issue
                const matchingPr = data.prs?.find(pr =>
                  pr.headBranch.startsWith('artemis/') &&
                  pr.title.toLowerCase().includes(issue.projectLabel.toLowerCase())
                )
                if (matchingPr) {
                  const proj = (data.projects ?? []).find((p: any) => p.name === matchingPr.project)
                  const prUrl = proj?.githubOwner && proj?.githubRepo
                    ? `https://github.com/${proj.githubOwner}/${proj.githubRepo}/pull/${matchingPr.number}`
                    : null
                  return (
                    <>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#22c55e' }}>PR #{matchingPr.number} open</span>
                      {prUrl && <a href={prUrl} target="_blank" rel="noopener" className="review-action" style={{ textDecoration: 'none' }}>Review PR &rarr;</a>}
                    </>
                  )
                }
                if (investigation.state === 'uninvestigated') {
                  return (
                    <button className="review-action-primary" onClick={() => onInvestigate(
                      issue.projectId,
                      `Investigate issue in ${issue.projectLabel}: "${issue.title}". ${issue.count} events. Search the repository for relevant code and identify the likely cause.`
                    )}>Investigate</button>
                  )
                }
                if (investigation.state === 'investigating') {
                  return <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent)' }}>Investigating...</span>
                }
                if (investigation.state === 'complete' && investigation.workflowId) {
                  return <button className="review-action" onClick={() => { onSelectWorkflow(investigation.workflowId!); onClose() }}>View result &rarr;</button>
                }
                return null
              })()}
            </div>
          </div>
        )
      })}
    </div>
  )
}
