import type { WorkflowItem } from '../App'

interface Props {
  workflow: WorkflowItem | null
}

function formatStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())
}

export function TopBar({ workflow }: Props) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="topbar-brand">Artemis</span>
        <span className="topbar-separator">/</span>
        <span className="topbar-product">Lite</span>
      </div>

      <div className="topbar-center">
        {/* Phase 2+: workspace/project context */}
      </div>

      <div className="topbar-right">
        {workflow ? (
          <>
            <span className="topbar-metric">0 tok</span>
            <span className="topbar-metric">0.0s</span>
            <span className="topbar-status">
              <span className="status-dot" data-status={workflow.status} />
              <span>{formatStatus(workflow.status)}</span>
            </span>
          </>
        ) : (
          <span>No active workflow</span>
        )}
      </div>
    </header>
  )
}
