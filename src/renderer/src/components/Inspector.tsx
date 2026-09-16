import type { WorkflowItem, InspectorTab } from '../App'

interface Props {
  workflow: WorkflowItem | null
  tab: InspectorTab
  onTabChange: (tab: InspectorTab) => void
}

const TABS: { id: InspectorTab; label: string }[] = [
  { id: 'trace', label: 'Trace' },
  { id: 'context', label: 'Context' },
  { id: 'state', label: 'State' },
  { id: 'usage', label: 'Usage' }
]

export function Inspector({ workflow, tab, onTabChange }: Props) {
  return (
    <div className="inspector">
      <div className="tab-bar" role="tablist">
        {TABS.map(t => (
          <button
            key={t.id}
            className="tab"
            data-active={tab === t.id ? 'true' : undefined}
            onClick={() => onTabChange(t.id)}
            role="tab"
            aria-selected={tab === t.id}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="inspector-body" role="tabpanel">
        {!workflow ? (
          <div className="empty-state">
            <span className="empty-state-text">Select a workflow to inspect</span>
          </div>
        ) : tab === 'trace' ? (
          <TraceView workflowId={workflow.id} />
        ) : tab === 'context' ? (
          <ContextView workflowId={workflow.id} />
        ) : tab === 'state' ? (
          <StateView workflow={workflow} />
        ) : (
          <UsageView workflowId={workflow.id} />
        )}
      </div>
    </div>
  )
}

function TraceView({ workflowId: _ }: { workflowId: string }) {
  return (
    <div>
      <div className="section-label">Trace</div>
      <p className="empty-state-text" style={{ padding: '16px 0' }}>
        Trace events will appear here when workflows execute.
      </p>
    </div>
  )
}

function ContextView({ workflowId: _ }: { workflowId: string }) {
  return (
    <div>
      <div className="section-label">Context Composition</div>
      <div style={{ marginTop: 8 }}>
        <div className="context-row">
          <span className="context-row-label">System instructions</span>
          <span className="context-row-value">&mdash;</span>
        </div>
        <div className="context-row">
          <span className="context-row-label">Current goal</span>
          <span className="context-row-value">&mdash;</span>
        </div>
        <div className="context-row">
          <span className="context-row-label">Workflow state</span>
          <span className="context-row-value">&mdash;</span>
        </div>
        <div className="context-row">
          <span className="context-row-label">Retrieved memory</span>
          <span className="context-row-value">&mdash;</span>
        </div>
        <div className="context-row">
          <span className="context-row-label">Retrieved documents</span>
          <span className="context-row-value">&mdash;</span>
        </div>
        <div className="context-row">
          <span className="context-row-label">Tool evidence</span>
          <span className="context-row-value">&mdash;</span>
        </div>
        <div className="context-total">
          <span>Total</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>&mdash;</span>
        </div>
      </div>
    </div>
  )
}

function StateView({ workflow }: { workflow: WorkflowItem }) {
  return (
    <div>
      <div className="section-label">Workflow State</div>
      <div style={{ marginTop: 8 }}>
        <div className="state-field">
          <span className="state-field-label">Status</span>
          <span className="state-field-value">{workflow.status}</span>
        </div>
        <div className="state-field">
          <span className="state-field-label">Current step</span>
          <span className="state-field-value">&mdash;</span>
        </div>
        <div className="state-field">
          <span className="state-field-label">Checkpoint</span>
          <span className="state-field-value">&mdash;</span>
        </div>
        <div className="state-field">
          <span className="state-field-label">Plan version</span>
          <span className="state-field-value">&mdash;</span>
        </div>
        <div className="state-field">
          <span className="state-field-label">Pending approval</span>
          <span className="state-field-value">false</span>
        </div>
        <div className="state-field">
          <span className="state-field-label">Created</span>
          <span className="state-field-value">
            {new Date(workflow.createdAt).toLocaleTimeString()}
          </span>
        </div>
      </div>
    </div>
  )
}

function UsageView({ workflowId: _ }: { workflowId: string }) {
  return (
    <div>
      <div className="section-label">Usage</div>
      <div style={{ marginTop: 8 }}>
        <div className="usage-row">
          <span className="usage-row-label">Model calls</span>
          <span className="usage-row-value">0</span>
        </div>
        <div className="usage-row">
          <span className="usage-row-label">Input tokens</span>
          <span className="usage-row-value">0</span>
        </div>
        <div className="usage-row">
          <span className="usage-row-label">Output tokens</span>
          <span className="usage-row-value">0</span>
        </div>
        <div className="usage-row">
          <span className="usage-row-label">Tool calls</span>
          <span className="usage-row-value">0</span>
        </div>
        <div className="usage-row">
          <span className="usage-row-label">Retries</span>
          <span className="usage-row-value">0</span>
        </div>
        <div className="usage-row">
          <span className="usage-row-label">Duration</span>
          <span className="usage-row-value">0.0s</span>
        </div>
        <div className="usage-row">
          <span className="usage-row-label">Estimated cost</span>
          <span className="usage-row-value">&mdash;</span>
        </div>
      </div>
    </div>
  )
}
