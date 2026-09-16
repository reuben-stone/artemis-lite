type Tab = 'trace' | 'context' | 'metrics'

interface Props {
  workflowId: string | null
  tab: Tab
  onTabChange: (tab: Tab) => void
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'trace', label: 'Trace' },
  { id: 'context', label: 'Context' },
  { id: 'metrics', label: 'Metrics' }
]

export function InspectorPanel({ workflowId, tab, onTabChange }: Props) {
  return (
    <div className="inspector-panel">
      <div className="tab-bar">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`tab ${tab === t.id ? 'tab-active' : ''}`}
            onClick={() => onTabChange(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="inspector-body">
        {!workflowId ? (
          <p className="muted">Select a workflow to inspect</p>
        ) : tab === 'trace' ? (
          <div className="trace-view">
            <p className="muted">Trace events will appear here</p>
          </div>
        ) : tab === 'context' ? (
          <div className="context-view">
            <p className="muted">Context composition will appear here</p>
          </div>
        ) : (
          <div className="metrics-view">
            <p className="muted">Usage metrics will appear here</p>
          </div>
        )}
      </div>
    </div>
  )
}
