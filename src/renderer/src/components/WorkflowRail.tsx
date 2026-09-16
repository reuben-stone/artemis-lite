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

function statusColor(status: string): string {
  switch (status) {
    case 'completed': return 'var(--status-success)'
    case 'failed': return 'var(--status-danger)'
    case 'awaiting_approval': return 'var(--status-warning)'
    case 'running': case 'planning': case 'executing': case 'verifying': return 'var(--accent)'
    default: return 'var(--text-muted)'
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
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span style={{
                  width: 7, height: 7, borderRadius: '50%', flexShrink: 0, marginTop: 5,
                  background: statusColor(w.status)
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="workflow-rail-item-title">
                    {w.goal.length > 40 ? w.goal.slice(0, 40) + '\u2026' : w.goal}
                  </div>
                  <div className="workflow-rail-item-meta">
                    {statusLabel(w.status)} &middot; {formatTime(w.createdAt)}
                  </div>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); e.preventDefault(); onDelete(w.id) }}
                  className="workflow-delete-btn"
                  title="Delete workflow"
                  aria-label="Delete workflow"
                >
                  &times;
                </button>
              </div>
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
