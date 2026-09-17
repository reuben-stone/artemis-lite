import type { WorkflowItem, WorkflowStep, ApprovalData } from '../App'

interface Props {
  workflow: WorkflowItem | null
  steps: WorkflowStep[]
  pendingApproval: ApprovalData | null
  onApproval: (approvalId: string, decision: 'approved' | 'rejected') => void
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch { return '' }
}

function statusLabel(s: string): string {
  return s.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())
}

const STAGES = ['queued', 'planning', 'executing', 'verifying', 'completed'] as const

function stageStatus(workflowStatus: string, stage: string): string {
  const order = STAGES.indexOf(stage as typeof STAGES[number])
  const currentOrder = STAGES.indexOf(workflowStatus as typeof STAGES[number])

  if (workflowStatus === 'failed' || workflowStatus === 'cancelled') {
    if (currentOrder === -1) return order === 0 ? 'completed' : 'pending'
    if (order < currentOrder) return 'completed'
    return 'pending'
  }
  if (workflowStatus === 'awaiting_approval') {
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

function stepKind(type: string): string {
  switch (type) {
    case 'reason': return 'model'
    case 'tool': return 'tool'
    case 'verify': return 'model'
    case 'approval': return 'approval'
    default: return 'deterministic'
  }
}

export function WorkflowPanel({ workflow, steps, pendingApproval, onApproval }: Props) {
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

  // Group steps by stage
  const executeSteps = steps.filter(s => s.type === 'tool')
  const planStep = steps.find(s => s.type === 'reason')
  const verifyStep = steps.find(s => s.type === 'verify')

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

                {/* Plan step detail */}
                {stage === 'planning' && planStep && (
                  <div className="execution-nodes">
                    <div className="exec-node">
                      <div className="exec-node-left">
                        <span className="exec-node-type" data-kind="model">MODEL CALL</span>
                        <span className="exec-node-name">Generate structured plan</span>
                      </div>
                      <div className="exec-node-right">
                        {planStep.status === 'completed' ? '✓' : planStep.status === 'running' ? '...' : ''}
                      </div>
                    </div>
                  </div>
                )}

                {/* Execute step details */}
                {stage === 'executing' && executeSteps.length > 0 && (
                  <div className="execution-nodes">
                    {executeSteps.map(step => (
                      <div key={step.id} className="exec-node">
                        <div className="exec-node-left">
                          <span className="exec-node-type" data-kind={stepKind(step.type)}>TOOL</span>
                          <span className="exec-node-name">{step.toolName ?? 'unknown'}</span>
                          {step.status === 'completed' && step.outputData && (
                            <span className="exec-node-detail">
                              {(() => {
                                try {
                                  const d = JSON.parse(step.outputData)
                                  if (d.files) return `${d.files.length} entries`
                                  if (d.created) return `Created: ${d.path}`
                                  if (d.issues) return `${d.issues.length} issues`
                                  if (d.pullRequests) return `${d.pullRequests.length} PRs`
                                  if (d.issue) return `#${d.issue.number}: ${d.issue.title}`
                                  if (d.pullRequest) return `#${d.pullRequest.number}: ${d.pullRequest.title}`
                                  if (d.matches) return `${d.totalMatches} matches in ${d.filesSearched} files`
                                  if (d.content !== undefined) return `${d.lines} lines`
                                  if (d.passed !== undefined) return d.passed ? 'Passed' : 'Failed'
                                  if (d.diff !== undefined) return `${d.changedFiles?.length ?? 0} files changed`
                                  if (d.branchName) return d.branchName
                                  if (d.url) return d.url
                                  if (d.reconciled) return 'Reconciled'
                                  return 'Done'
                                } catch { return 'Done' }
                              })()}
                            </span>
                          )}
                        </div>
                        <div className="exec-node-right">
                          {step.status === 'completed' ? '✓' :
                           step.status === 'running' ? '...' :
                           step.status === 'failed' ? '✕' :
                           step.status === 'awaiting_approval' ? '!' : '○'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Approval card */}
                {stage === 'executing' && pendingApproval && pendingApproval.workflowId === workflow.id && (
                  <div className="approval-card" style={{
                    margin: '8px 0',
                    padding: '12px',
                    border: '1px solid var(--status-warning)',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-panel-raised)'
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--status-warning)', marginBottom: 8 }}>
                      Approval Required
                    </div>
                    <div style={{ fontSize: 13, marginBottom: 4 }}>{pendingApproval.action}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>{pendingApproval.summary}</div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button
                        className="btn btn-ghost"
                        onClick={() => onApproval(pendingApproval.id, 'rejected')}
                      >
                        Reject
                      </button>
                      <button
                        className="btn btn-primary"
                        onClick={() => onApproval(pendingApproval.id, 'approved')}
                      >
                        Approve
                      </button>
                    </div>
                  </div>
                )}

                {/* Verify step detail */}
                {stage === 'verifying' && verifyStep && (
                  <div className="execution-nodes">
                    <div className="exec-node">
                      <div className="exec-node-left">
                        <span className="exec-node-type" data-kind="model">MODEL CALL</span>
                        <span className="exec-node-name">Verify workflow outcome</span>
                        {verifyStep.outputData && (
                          <span className="exec-node-detail">
                            {(() => {
                              try {
                                const d = JSON.parse(verifyStep.outputData)
                                return d.pass ? 'Passed' : `Failed: ${d.reason}`
                              } catch { return '' }
                            })()}
                          </span>
                        )}
                      </div>
                      <div className="exec-node-right">
                        {verifyStep.status === 'completed' ? '✓' : verifyStep.status === 'running' ? '...' : ''}
                      </div>
                    </div>
                  </div>
                )}

                {/* Status descriptions */}
                {status === 'running' && !planStep && stage === 'planning' && (
                  <div className="stage-description">Creating bounded plan...</div>
                )}
                {status === 'awaiting_approval' && !pendingApproval && (
                  <div className="stage-description">Awaiting human approval</div>
                )}

                {/* Completion summary */}
                {stage === 'completed' && workflow.status === 'completed' && (
                  <div className="stage-description" style={{ color: 'var(--status-success)' }}>
                    Workflow completed successfully
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {/* Failed state */}
        {workflow.status === 'failed' && (
          <div className="stage-node">
            <div className="stage-indicator">
              <span className="stage-dot" data-status="failed" />
            </div>
            <div className="stage-content">
              <span className="stage-title" style={{ color: 'var(--status-danger)' }}>Failed</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
