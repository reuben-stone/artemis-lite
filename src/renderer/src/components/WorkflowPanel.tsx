import type { WorkflowItem, WorkflowStep, ApprovalData } from '../App'

export interface WorkflowResultData {
  status: string
  summary: string
  verificationReason: string | null
  artifacts: string | null // JSON
}

interface Props {
  workflow: WorkflowItem | null
  steps: WorkflowStep[]
  pendingApproval: ApprovalData | null
  onApproval: (approvalId: string, decision: 'approved' | 'rejected') => void
  result: WorkflowResultData | null
  onPublishPR?: (workflowId: string) => void
  publishedPR?: { prNumber: number; prUrl: string; branch: string; repository: string } | null
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

function toolOutputSummary(step: WorkflowStep): string {
  if (!step.outputData) return 'Done'
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
}

// ── Result renderer ───────────────────────────────────────────────

function ResultCard({ result }: { result: WorkflowResultData }) {
  const borderColor = result.status === 'succeeded' ? 'var(--status-success)'
    : result.status === 'partial' ? 'var(--status-warning)'
    : 'var(--status-danger)'

  const statusColor = borderColor

  let artifacts: { toolName: string; objective: string; data: any }[] = []
  try {
    if (result.artifacts) artifacts = JSON.parse(result.artifacts)
  } catch { /* ok */ }

  return (
    <div style={{
      padding: '16px 20px',
      border: `1px solid ${borderColor}`,
      borderRadius: 'var(--radius-md)',
      background: 'var(--bg-panel-raised)',
      marginBottom: 24
    }}>
      <div style={{
        fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em',
        color: statusColor, marginBottom: 8
      }}>
        Result: {result.status}
      </div>

      {/* Summary lines */}
      <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
        {result.summary}
      </div>

      {/* Artifact details */}
      {artifacts.length > 0 && (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
          {artifacts.map((a, i) => (
            <ArtifactRenderer key={i} artifact={a} />
          ))}
        </div>
      )}

      {/* Verification reason if failed */}
      {result.status === 'failed' && result.verificationReason && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--status-danger)' }}>
          {result.verificationReason}
        </div>
      )}
    </div>
  )
}

function ArtifactRenderer({ artifact }: { artifact: { toolName: string; objective: string; data: any } }) {
  const d = artifact.data

  // File listing
  if (d.files && Array.isArray(d.files)) {
    const files = d.files as { path: string; type?: string; sizeBytes?: number }[]
    return (
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{artifact.objective}</div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          {files.slice(0, 20).map((f, i) => (
            <div key={i}>
              {f.type === 'directory' ? `${f.path}/` : f.path}
              {f.sizeBytes !== undefined && f.type !== 'directory' && (
                <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>{formatBytes(f.sizeBytes)}</span>
              )}
            </div>
          ))}
          {files.length > 20 && (
            <div style={{ color: 'var(--text-muted)' }}>... and {files.length - 20} more</div>
          )}
        </div>
      </div>
    )
  }

  // Issues
  if (d.issues && Array.isArray(d.issues)) {
    if (d.issues.length === 0) {
      return <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>No open issues found.</div>
    }
    return (
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{d.issues.length} issue(s)</div>
        {d.issues.slice(0, 10).map((issue: any, i: number) => (
          <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 2 }}>
            <span style={{ color: 'var(--text-muted)' }}>#{issue.number}</span> {issue.title}
          </div>
        ))}
      </div>
    )
  }

  // Search results
  if (d.matches && Array.isArray(d.matches)) {
    return (
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
          {d.totalMatches} match(es) for "{d.query}" in {d.filesSearched} files
        </div>
        {d.matches.slice(0, 8).map((m: any, i: number) => (
          <div key={i} style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-secondary)', marginBottom: 1 }}>
            <span style={{ color: 'var(--text-muted)' }}>{m.file}:{m.line}</span> {m.content.slice(0, 80)}
          </div>
        ))}
      </div>
    )
  }

  // Test/build results
  if (d.passed !== undefined) {
    return (
      <div style={{ marginBottom: 8, fontSize: 12, color: d.passed ? 'var(--status-success)' : 'var(--status-danger)' }}>
        {artifact.toolName}: {d.passed ? 'Passed' : `Failed (exit ${d.exitCode})`}
      </div>
    )
  }

  // File content
  if (d.content !== undefined && d.path) {
    return (
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{d.path} ({d.lines} lines)</div>
      </div>
    )
  }

  // PR
  if (d.url) {
    return (
      <div style={{ marginBottom: 8, fontSize: 12 }}>
        <span style={{ color: 'var(--status-success)' }}>PR created:</span>{' '}
        <span style={{ color: 'var(--text-secondary)' }}>{d.url}</span>
      </div>
    )
  }

  return null
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

// ── Main panel ────────────────────────────────────────────────────

export function WorkflowPanel({ workflow, steps, pendingApproval, onApproval, result, onPublishPR, publishedPR }: Props) {
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

  const isTerminal = ['completed', 'failed', 'cancelled'].includes(workflow.status)

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

      {/* Result — the product output, shown above execution timeline */}
      {isTerminal && result && (
        <ResultCard result={result} />
      )}

      {/* Publication card — shown when delegation produced changes */}
      {isTerminal && result?.status === 'succeeded' && (() => {
        const delegateStep = steps.find(s => s.toolName === 'delegate_engineering' && s.status === 'completed')
        if (!delegateStep?.outputData) return null
        try {
          const data = JSON.parse(delegateStep.outputData)
          const obs = data.observed
          if (!obs?.diff?.files?.length) return null

          if (publishedPR) {
            return (
              <div style={{ padding: '16px 20px', border: '1px solid var(--accent)', borderRadius: 'var(--radius-md)', background: 'var(--bg-panel-raised)', marginBottom: 24 }}>
                <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--accent)', marginBottom: 8 }}>Published</div>
                <div style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 4 }}>PR #{publishedPR.prNumber} created on {publishedPR.repository}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>{publishedPR.branch}</div>
                <a href={publishedPR.prUrl} target="_blank" rel="noopener" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }}>View PR &rarr;</a>
              </div>
            )
          }

          const checks = obs.checks ?? []
          return (
            <div style={{ padding: '16px 20px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-md)', background: 'var(--bg-panel-raised)', marginBottom: 24 }}>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 8 }}>Change prepared</div>
              <div style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 8 }}>
                {obs.diff.files.length} file(s) changed, +{obs.diff.additions} -{obs.diff.deletions}
              </div>
              <div style={{ marginBottom: 12 }}>
                {checks.map((c: any, i: number) => (
                  <div key={i} style={{ fontSize: 11, color: c.skipped ? 'var(--text-muted)' : c.passed ? '#22c55e' : 'var(--status-danger)' }}>
                    {c.check}: {c.skipped ? 'skipped' : c.passed ? 'passed' : 'failed'}
                  </div>
                ))}
              </div>
              {obs.diff.files.length <= 5 && (
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
                  {obs.diff.files.map((f: string, i: number) => <div key={i}>{f}</div>)}
                </div>
              )}
              <button
                className="btn btn-primary"
                style={{ fontSize: 12 }}
                onClick={() => onPublishPR?.(workflow.id)}
              >
                Review &amp; Publish PR
              </button>
            </div>
          )
        } catch { return null }
      })()}

      {/* Execution timeline — the evidence/audit trail */}
      {(isTerminal && result) && (
        <div className="section-label" style={{ paddingLeft: 0, paddingBottom: 4 }}>Execution</div>
      )}

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
                        {planStep.status === 'completed' ? '\u2713' : planStep.status === 'running' ? '...' : ''}
                      </div>
                    </div>
                  </div>
                )}

                {/* Execute step details */}
                {stage === 'executing' && executeSteps.length > 0 && (
                  <div className="execution-nodes">
                    {executeSteps.map(step => {
                      const objective = (() => {
                        try { return JSON.parse(step.inputData ?? '{}')?.objective } catch { return null }
                      })()
                      return (
                      <div key={step.id} className="exec-node">
                        <div className="exec-node-left">
                          <span className="exec-node-type" data-kind={stepKind(step.type)}>TOOL</span>
                          <span className="exec-node-name">{step.toolName ?? 'unknown'}</span>
                          {objective && (
                            <span className="exec-node-detail" style={{ color: 'var(--text-muted)' }}>{objective}</span>
                          )}
                          {step.status === 'completed' && step.outputData && (
                            <span className="exec-node-detail">{toolOutputSummary(step)}</span>
                          )}
                        </div>
                        <div className="exec-node-right">
                          {step.status === 'completed' ? '\u2713' :
                           step.status === 'running' ? '...' :
                           step.status === 'failed' ? '\u2715' :
                           step.status === 'awaiting_approval' ? '!' : '\u25CB'}
                        </div>
                      </div>
                      )
                    })}
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
                      <button className="btn btn-ghost" onClick={() => onApproval(pendingApproval.id, 'rejected')}>Reject</button>
                      <button className="btn btn-primary" onClick={() => onApproval(pendingApproval.id, 'approved')}>Approve</button>
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
                        {verifyStep.status === 'completed' ? '\u2713' : verifyStep.status === 'running' ? '...' : ''}
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

                {/* Completion tick */}
                {stage === 'completed' && workflow.status === 'completed' && !result && (
                  <div className="stage-description" style={{ color: 'var(--status-success)' }}>
                    Workflow completed successfully
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {/* Failed state */}
        {workflow.status === 'failed' && !result && (
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
