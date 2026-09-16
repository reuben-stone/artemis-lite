import type { WorkflowItem } from '../App'

interface Props {
  workflows: WorkflowItem[]
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
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

export function WorkflowRail({ workflows, activeId, onSelect, onNew }: Props) {
  return (
    <div className="workflow-rail">
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
              <span className="workflow-rail-item-title">
                {statusMarker(w.status)}{' '}
                {w.goal.length > 40 ? w.goal.slice(0, 40) + '\u2026' : w.goal}
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
