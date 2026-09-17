import type { WorkflowItem, UsageData, ProjectInfo } from '../App'

interface Props {
  workflow: WorkflowItem | null
  usage: UsageData | null
  busy: boolean
  project: ProjectInfo | null
  onOpenSettings: () => void
}

function formatStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatCost(c: number): string {
  if (c === 0) return '$0.00'
  if (c < 0.001) return '<$0.001'
  return `$${c.toFixed(3)}`
}

export function TopBar({ workflow, usage, busy, project, onOpenSettings }: Props) {
  const totalTokens = usage ? usage.inputTokens + usage.outputTokens : 0

  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="topbar-brand">Artemis</span>
        <span className="topbar-separator">/</span>
        <span className="topbar-product">Lite</span>
      </div>

      <div className="topbar-center">
        {project && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>{project.name}</span>
            {project.branch && (
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                {project.branch}
              </span>
            )}
          </span>
        )}
      </div>

      <div className="topbar-right">
        <button
          className="btn btn-ghost"
          style={{ fontSize: 13, padding: '2px 6px', marginRight: 8 }}
          onClick={onOpenSettings}
          title="Settings"
        >
          Settings
        </button>
        {workflow && usage ? (
          <>
            <span className="topbar-metric">{formatCost(usage.estimatedCost)}</span>
            <span className="topbar-metric">{formatTokens(totalTokens)} tok</span>
            <span className="topbar-metric">{formatDuration(usage.durationMs)}</span>
            <span className="topbar-status">
              <span className="status-dot" data-status={workflow.status} />
              <span>{busy ? 'Running' : formatStatus(workflow.status)}</span>
            </span>
          </>
        ) : workflow ? (
          <span className="topbar-status">
            <span className="status-dot" data-status={busy ? 'running' : workflow.status} />
            <span>{busy ? 'Running' : formatStatus(workflow.status)}</span>
          </span>
        ) : (
          <span>No active workflow</span>
        )}
      </div>
    </header>
  )
}
