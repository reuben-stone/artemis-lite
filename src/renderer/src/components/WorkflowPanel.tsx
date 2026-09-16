interface Props {
  workflowId: string | null
}

export function WorkflowPanel({ workflowId }: Props) {
  if (!workflowId) {
    return (
      <div className="workflow-panel empty-state">
        <p className="muted">Start a workflow to see progress here</p>
      </div>
    )
  }

  return (
    <div className="workflow-panel">
      <div className="workflow-header">
        <h2 className="section-title">Workflow</h2>
        <code className="workflow-id">{workflowId.slice(0, 8)}</code>
      </div>

      <div className="workflow-body">
        <p className="muted">Workflow execution will appear here in Phase 2</p>
      </div>
    </div>
  )
}
