import type { WorkflowItem, InspectorTab, TraceEvent, WorkflowStep, UsageData } from '../App'
import { FailureLab } from './FailureLab'

interface Props {
  workflow: WorkflowItem | null
  tab: InspectorTab
  onTabChange: (tab: InspectorTab) => void
  traceEvents: TraceEvent[]
  steps: WorkflowStep[]
  usage: UsageData | null
}

const TABS: { id: InspectorTab; label: string }[] = [
  { id: 'trace', label: 'Trace' },
  { id: 'context', label: 'Context' },
  { id: 'state', label: 'State' },
  { id: 'usage', label: 'Usage' },
  { id: 'faults', label: 'Faults' }
]

export function Inspector({ workflow, tab, onTabChange, traceEvents, steps, usage }: Props) {
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
          <TraceView events={traceEvents} />
        ) : tab === 'context' ? (
          <ContextView />
        ) : tab === 'state' ? (
          <StateView workflow={workflow} steps={steps} />
        ) : tab === 'usage' ? (
          <UsageView usage={usage} />
        ) : tab === 'faults' ? (
          <FailureLab />
        ) : null}
      </div>
    </div>
  )
}

// ── Trace ──────────────────────────────────────────────────────────

function TraceView({ events }: { events: TraceEvent[] }) {
  if (events.length === 0) {
    return (
      <div>
        <div className="section-label">Trace</div>
        <p className="empty-state-text" style={{ padding: '16px 0' }}>
          Trace events will appear here when workflows execute.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="section-label">Trace ({events.length} events)</div>
      <div style={{ marginTop: 4 }}>
        {events.map(ev => (
          <div key={ev.id} className="trace-event-row">
            <span className="trace-time">
              {new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 } as any)}
            </span>
            <span className="trace-type">
              {ev.type}
              {ev.toolName ? ` (${ev.toolName})` : ''}
            </span>
            <span className="trace-detail">
              {ev.durationMs != null ? `${ev.durationMs.toFixed(0)}ms` : ''}
              {ev.inputTokens != null ? ` ${ev.inputTokens}in` : ''}
              {ev.outputTokens != null ? ` ${ev.outputTokens}out` : ''}
              {ev.status === 'failure' ? ' ✕' : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Context ────────────────────────────────────────────────────────

function ContextView() {
  return (
    <div>
      <div className="section-label">Context Composition</div>
      <p className="empty-state-text" style={{ padding: '16px 0' }}>
        Context inspection will be available when retrieval and memory are implemented.
      </p>
    </div>
  )
}

// ── State ──────────────────────────────────────────────────────────

function StateView({ workflow, steps }: { workflow: WorkflowItem; steps: WorkflowStep[] }) {
  return (
    <div>
      <div className="section-label">Workflow State</div>
      <div style={{ marginTop: 8 }}>
        <div className="state-field">
          <span className="state-field-label">Status</span>
          <span className="state-field-value">{workflow.status}</span>
        </div>
        <div className="state-field">
          <span className="state-field-label">Steps</span>
          <span className="state-field-value">{steps.length}</span>
        </div>
        <div className="state-field">
          <span className="state-field-label">Created</span>
          <span className="state-field-value">
            {new Date(workflow.createdAt).toLocaleTimeString()}
          </span>
        </div>
      </div>

      {steps.length > 0 && (
        <>
          <div className="section-label" style={{ marginTop: 16 }}>Steps</div>
          {steps.map(s => (
            <div key={s.id} className="state-field">
              <span className="state-field-label">
                {s.type}{s.toolName ? `: ${s.toolName}` : ''}
              </span>
              <span className="state-field-value">{s.status}</span>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

// ── Usage ──────────────────────────────────────────────────────────

function UsageView({ usage }: { usage: UsageData | null }) {
  if (!usage || (usage.modelCalls === 0 && usage.toolCalls === 0)) {
    return (
      <div>
        <div className="section-label">Usage</div>
        <p className="empty-state-text" style={{ padding: '16px 0' }}>
          Usage data will appear after the workflow executes.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="section-label">Usage</div>
      <div style={{ marginTop: 8 }}>
        <div className="usage-row">
          <span className="usage-row-label">Model calls</span>
          <span className="usage-row-value">{usage.modelCalls}</span>
        </div>
        <div className="usage-row">
          <span className="usage-row-label">Input tokens</span>
          <span className="usage-row-value">{usage.inputTokens.toLocaleString()}</span>
        </div>
        <div className="usage-row">
          <span className="usage-row-label">Output tokens</span>
          <span className="usage-row-value">{usage.outputTokens.toLocaleString()}</span>
        </div>
        <div className="usage-row">
          <span className="usage-row-label">Tool calls</span>
          <span className="usage-row-value">{usage.toolCalls}</span>
        </div>
        <div className="usage-row">
          <span className="usage-row-label">Retries</span>
          <span className="usage-row-value">{usage.retries}</span>
        </div>
        <div className="usage-row">
          <span className="usage-row-label">Duration</span>
          <span className="usage-row-value">
            {usage.durationMs < 1000
              ? `${usage.durationMs}ms`
              : `${(usage.durationMs / 1000).toFixed(1)}s`}
          </span>
        </div>
        <div className="usage-row">
          <span className="usage-row-label">Estimated cost</span>
          <span className="usage-row-value">
            {usage.estimatedCost > 0
              ? `$${usage.estimatedCost.toFixed(4)}`
              : 'Unavailable'}
          </span>
        </div>
      </div>
    </div>
  )
}
