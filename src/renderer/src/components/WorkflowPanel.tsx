import type { WorkflowItem } from '../App'

interface Props {
  workflow: WorkflowItem | null
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  } catch {
    return ''
  }
}

function statusLabel(s: string): string {
  return s.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())
}

// Stages reflect the workflow state machine from the architecture
const STAGES = ['queued', 'planning', 'executing', 'verifying', 'completed'] as const

function stageStatus(workflowStatus: string, stage: string): string {
  const order = STAGES.indexOf(stage as typeof STAGES[number])
  const currentOrder = STAGES.indexOf(workflowStatus as typeof STAGES[number])

  if (workflowStatus === 'failed' || workflowStatus === 'cancelled') {
    if (order < currentOrder || currentOrder === -1) return 'completed'
    if (stage === workflowStatus) return workflowStatus
    return 'pending'
  }

  if (workflowStatus === 'awaiting_approval') {
    // executing stage is where approval happens
    if (order < STAGES.indexOf('executing')) return 'completed'
    if (stage === 'executing') return 'awaiting_approval'
    return 'pending'
  }

  if (currentOrder === -1) return 'pending'
  if (order < currentOrder) return 'completed'
  if (order === currentOrder) return 'running'
  return 'pending'
}

function stageName(stage: string): string {
  switch (stage) {
    case 'queued': return 'Goal received'
    case 'planning': return 'Plan'
    case 'executing': return 'Execute'
    case 'verifying': return 'Verify'
    case 'completed': return 'Complete'
    default: return stage
  }
}

export function WorkflowPanel({ workflow }: Props) {
  if (!workflow) {
    return (
      <div className="workflow-panel">
        <div className="empty-state">
          <span className="empty-state-title">Select a workflow</span>
          <span className="empty-state-text">
            Inspect its execution, context, state and usage.
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="workflow-panel">
      <div className="workflow-header">
        <div className="section-label">Active Workflow</div>
        <h1 className="workflow-goal">{workflow.goal}</h1>
        <div className="workflow-meta">
          <span>{statusLabel(workflow.status)}</span>
          <span>&middot;</span>
          <span>started {formatTime(workflow.createdAt)}</span>
          <span>&middot;</span>
          <code title={workflow.id}>{workflow.id.slice(0, 8)}</code>
        </div>
      </div>

      <div className="stage-pipeline">
        {STAGES.map((stage, i) => {
          const status = stageStatus(workflow.status, stage)
          const isLast = i === STAGES.length - 1
          return (
            <div key={stage} className="stage-node">
              <div className="stage-indicator">
                <span className="stage-dot" data-status={status} />
                {!isLast && <span className="stage-line" />}
              </div>
              <div className="stage-content">
                <span className="stage-title" data-status={status}>
                  {stageName(stage)}
                </span>
                {status === 'running' && (
                  <div className="stage-description">
                    {stage === 'planning' && 'Creating bounded plan...'}
                    {stage === 'executing' && 'Executing workflow steps...'}
                    {stage === 'verifying' && 'Verifying outputs...'}
                    {stage === 'queued' && 'Queued for execution'}
                  </div>
                )}
                {status === 'awaiting_approval' && (
                  <div className="stage-description">Awaiting human approval</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
