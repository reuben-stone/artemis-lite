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

interface ProjectState {
  project: ProjectInfo
  workflows: WorkflowResultSummary[]
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

          states.push({ project, workflows: results })
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
  const needsAttention = failed.length

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
            <div style={{ display: 'flex', gap: 24, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)', marginBottom: 24 }}>
              <span>{totalProjects} project{totalProjects !== 1 ? 's' : ''} registered</span>
              <span>{succeeded.length} workflow{succeeded.length !== 1 ? 's' : ''} succeeded</span>
              {needsAttention > 0 && <span>{needsAttention} need{needsAttention !== 1 ? '' : 's'} attention</span>}
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

            {/* Portfolio */}
            {projectStates.length > 0 && (
              <>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '20px 0 12px' }}>Portfolio</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <th style={{ textAlign: 'left', padding: '6px 0', color: 'var(--text-muted)', fontWeight: 400, fontSize: 11 }}></th>
                      <th style={{ textAlign: 'left', padding: '6px 12px', color: 'var(--text-muted)', fontWeight: 400, fontSize: 11 }}>Branch</th>
                      <th style={{ textAlign: 'right', padding: '6px 0', color: 'var(--text-muted)', fontWeight: 400, fontSize: 11 }}>Workflows</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projectStates.map(ps => (
                      <tr key={ps.project.id} style={{ borderBottom: '1px solid rgba(42,43,48,0.5)' }}>
                        <td style={{ padding: '8px 0', color: 'var(--text-primary)', fontWeight: 500 }}>{ps.project.name}</td>
                        <td style={{ padding: '8px 12px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)' }}>{ps.project.branch || '-'}</td>
                        <td style={{ padding: '8px 0', textAlign: 'right', color: 'var(--text-secondary)' }}>{ps.workflows.length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
