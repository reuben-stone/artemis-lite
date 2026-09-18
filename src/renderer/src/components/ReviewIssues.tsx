import { useState, useEffect } from 'react'

interface Props {
  onSelectWorkflow: (workflowId: string) => void
  onCreateWorkflow: (goal: string) => void
  onClose: () => void
}

interface OperationalIssue {
  id: string
  source: 'sentry'
  projectLabel: string
  projectSlug: string
  title: string
  errorType: string | null
  message: string
  level: string
  count: string
  lastSeen: string
}

export function ReviewIssues({ onSelectWorkflow, onCreateWorkflow, onClose }: Props) {
  const [issues, setIssues] = useState<OperationalIssue[]>([])
  const [workflows, setWorkflows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const projects = await window.artemis.projects.list()
        const allIssues: OperationalIssue[] = []

        for (const project of projects) {
          let mappings: any[] = []
          try {
            const raw = project.sentryProject
            if (raw && raw.startsWith('[')) mappings = JSON.parse(raw)
          } catch { /* ok */ }

          for (const m of mappings) {
            if (m.sentrySlug) {
              try {
                const res = await window.artemis.sentry.issues({ projectSlug: m.sentrySlug })
                if (res.issues) {
                  allIssues.push(...res.issues.map((i: any) => {
                    const colonIdx = i.title.indexOf(':')
                    return {
                      id: i.id,
                      source: 'sentry' as const,
                      projectLabel: m.label || project.name,
                      projectSlug: m.sentrySlug,
                      title: i.title,
                      errorType: colonIdx > 0 ? i.title.slice(0, colonIdx) : null,
                      message: colonIdx > 0 ? i.title.slice(colonIdx + 1).trim() : i.title,
                      level: i.level,
                      count: i.count,
                      lastSeen: i.lastSeen
                    }
                  }))
                }
              } catch { /* skip */ }
            }
          }
        }

        // Load workflows to check investigation state
        const wfList = await window.artemis.workflows.list()
        setWorkflows(wfList)
        setIssues(allIssues)
      } catch (err) {
        console.error('Issues load failed:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const getInvestigationState = (issue: OperationalIssue) => {
    const matching = workflows.find(w => w.goal?.includes(issue.title.slice(0, 40)))
    if (!matching) return { state: 'uninvestigated' as const, workflowId: null }
    if (matching.status === 'completed') return { state: 'complete' as const, workflowId: matching.id }
    if (matching.status === 'failed') return { state: 'complete' as const, workflowId: matching.id }
    return { state: 'investigating' as const, workflowId: matching.id }
  }

  if (loading) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '60px 0', textAlign: 'center' }}>Loading issues...</div>
  }

  if (issues.length === 0) {
    return (
      <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '60px 0', textAlign: 'center' }}>
        No unresolved issues across registered projects.
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{issues.length} issue{issues.length !== 1 ? 's' : ''} across registered projects</div>
      </div>

      {issues.map(issue => {
        const investigation = getInvestigationState(issue)
        const levelColor = issue.level === 'fatal' || issue.level === 'error' ? 'var(--status-danger)' : issue.level === 'warning' ? '#eab308' : 'var(--text-muted)'

        return (
          <div key={issue.id} className="review-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 6 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 2 }}>{issue.projectLabel}</div>
                {issue.errorType && (
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: levelColor, marginBottom: 3 }}>{issue.errorType}</div>
                )}
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{issue.message}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: levelColor }}>{issue.count} events</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{issue.projectSlug}</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
              {investigation.state === 'uninvestigated' && (
                <button className="review-action-primary" onClick={() => {
                  onCreateWorkflow(`Investigate issue in ${issue.projectLabel}: "${issue.title}". ${issue.count} events. Search the repository for relevant code and identify the likely cause.`)
                }}>Investigate</button>
              )}
              {investigation.state === 'investigating' && (
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent)' }}>Investigating...</span>
              )}
              {investigation.state === 'complete' && investigation.workflowId && (
                <button className="review-action" onClick={() => { onSelectWorkflow(investigation.workflowId!); onClose() }}>
                  View result &rarr;
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
