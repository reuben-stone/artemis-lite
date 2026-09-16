import type { WorkflowItem, ProjectInfo } from '../App'

interface Props {
  workflows: WorkflowItem[]
  activeId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onNew: () => void
  project: ProjectInfo | null
  onAddProject: () => void
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function statusLabel(status: string): string {
  return status.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())
}

function statusMarker(status: string): string {
  switch (status) {
    case 'completed': return '\u2713'
    case 'failed': return '\u00d7'
    case 'awaiting_approval': return '!'
    case 'cancelled': return '\u2014'
    default: return '\u25cf'
  }
}

export function WorkflowRail({ workflows, activeId, onSelect, onDelete, onNew, project, onAddProject }: Props) {
  return (
    <div className="workflow-rail">
      {/* Project section */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="section-label" style={{ padding: 0, marginBottom: 4 }}>Project</div>
        {project ? (
          <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>
            {project.name}
            {project.branch && (
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)', marginLeft: 6 }}>
                {project.branch}
              </span>
            )}
            {project.dirty && (
              <span style={{ fontSize: 10, color: 'var(--status-warning)', marginLeft: 4 }}>modified</span>
            )}
          </div>
        ) : (
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={onAddProject}>
            + Add repository
          </button>
        )}
      </div>

      <div className="section-label">Workflows</div>

      <div className="workflow-rail-list">
        {workflows.length === 0 ? (
          <div className="workflow-rail-empty">
            <p><strong>No workflows yet</strong></p>
            <p>Create a goal to inspect how Artemis Lite plans, executes and verifies it.</p>
            <button className="btn btn-primary" onClick={onNew}>
              New workflow
            </button>
          </div>
        ) : (
          workflows.map(w => (
            <div
              key={w.id}
              className="workflow-rail-item"
              data-selected={w.id === activeId ? 'true' : undefined}
              onClick={() => onSelect(w.id)}
              role="button"
              tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter') onSelect(w.id) }}
            >
              <span className="workflow-rail-item-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>
                  {statusMarker(w.status)}{' '}
                  {w.goal.length > 35 ? w.goal.slice(0, 35) + '\u2026' : w.goal}
                </span>
                <button
                  onClick={e => { e.stopPropagation(); onDelete(w.id) }}
                  style={{
                    background: 'none', border: 'none', color: 'var(--text-muted)',
                    cursor: 'pointer', fontSize: 11, padding: '0 2px', lineHeight: 1,
                    opacity: 0.5
                  }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '0.5')}
                  title="Delete workflow"
                  aria-label="Delete workflow"
                >
                  &#x2715;
                </button>
              </span>
              <span className="workflow-rail-item-meta">
                {statusLabel(w.status)} \u00b7 {formatTime(w.createdAt)}
              </span>
            </div>
          ))
        )}
      </div>

      {workflows.length > 0 && (
        <div className="workflow-rail-footer">
          <button className="btn btn-ghost btn-block" onClick={onNew}>
            + New workflow
          </button>
        </div>
      )}
    </div>
  )
}
