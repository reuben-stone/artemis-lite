import { useState } from 'react'
import type { WorkflowItem, ProjectInfo } from '../App'
import type { ReviewPR } from './ReviewDialog'

interface Props {
  workflows: WorkflowItem[]
  activeId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onNew: () => void
  projects: ProjectInfo[]
  activeProject: ProjectInfo | null
  onAddProject: () => void
  onSwitchProject: (id: string) => void
  onRemoveProject: (id: string) => void
  prs: ReviewPR[]
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

export function WorkflowRail({
  workflows, activeId, onSelect, onDelete, onNew,
  projects, activeProject, onAddProject, onSwitchProject, onRemoveProject,
  prs
}: Props) {
  const [prCollapsed, setPrCollapsed] = useState(false)

  return (
    <div className="workflow-rail">
      {/* Portfolio section */}
      <div style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="section-label">Portfolio</div>
        <div style={{ padding: '0 8px 8px' }}>
          {projects.map(p => (
            <div
              key={p.id}
              className="project-item"
              data-active={p.id === activeProject?.id ? 'true' : undefined}
              onClick={() => onSwitchProject(p.id)}
              role="button"
              tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter') onSwitchProject(p.id) }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                  background: p.id === activeProject?.id ? 'var(--accent)' : 'var(--text-muted)'
                }} />
                <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {p.name}
                </span>
                {p.branch && (
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
                    {p.branch}
                  </span>
                )}
                {p.dirty && (
                  <span style={{ fontSize: 9, color: 'var(--status-warning)', flexShrink: 0 }}>M</span>
                )}
              </div>
            </div>
          ))}
          <button className="btn btn-ghost" style={{ fontSize: 11, width: '100%', marginTop: 4 }} onClick={onAddProject}>
            + Add repository
          </button>
        </div>
      </div>

      {/* PR Queue section */}
      <div style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div
          className="section-label"
          style={{ cursor: prs.length > 0 ? 'pointer' : 'default', display: 'flex', justifyContent: 'space-between', alignItems: 'center', userSelect: 'none' }}
          onClick={() => { if (prs.length > 0) setPrCollapsed(!prCollapsed) }}
          role={prs.length > 0 ? 'button' : undefined}
          tabIndex={prs.length > 0 ? 0 : undefined}
          onKeyDown={e => { if (e.key === 'Enter' && prs.length > 0) setPrCollapsed(!prCollapsed) }}
        >
          <span>PR Queue ({prs.length})</span>
          {prs.length > 0 && (
            <span style={{ fontSize: 10, color: 'var(--text-muted)', transform: prCollapsed ? 'rotate(-90deg)' : 'rotate(0)', transition: 'transform 0.15s' }}>&#9662;</span>
          )}
        </div>
        {prs.length === 0 ? (
          <div style={{ padding: '0 8px 8px', fontSize: 11, color: 'var(--text-muted)' }}>No open PRs</div>
        ) : !prCollapsed && (
          <div style={{ padding: '0 8px 8px' }}>
            {prs.map(pr => (
              <div
                key={`${pr.project}-${pr.number}`}
                className="project-item"
                style={{ cursor: 'default' }}
              >
                <div style={{ fontSize: 12, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
                  {pr.title}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{pr.project}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>#{pr.number}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)' }}>{pr.headBranch}</span>
                  {pr.draft && <span style={{ fontSize: 9, color: 'var(--text-muted)', fontStyle: 'italic' }}>draft</span>}
                </div>
              </div>
            ))}
          </div>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
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
