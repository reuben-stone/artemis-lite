import type { WorkflowItem, InspectorTab, TraceEvent, WorkflowStep, UsageData } from '../App'
import { FailureLab } from './FailureLab'

interface Props {
  workflow: WorkflowItem | null
  tab: InspectorTab
  onTabChange: (tab: InspectorTab) => void
  traceEvents: TraceEvent[]
  steps: WorkflowStep[]
  usage: UsageData | null
  contextPackets: any[]
}

const TABS: { id: InspectorTab; label: string }[] = [
  { id: 'trace', label: 'Trace' },
  { id: 'context', label: 'Context' },
  { id: 'state', label: 'State' },
  { id: 'usage', label: 'Usage' },
  { id: 'faults', label: 'Faults' },
  { id: 'schedule', label: 'Schedule' }
]

export function Inspector({ workflow, tab, onTabChange, traceEvents, steps, usage, contextPackets }: Props) {
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
          <ContextView packets={contextPackets} />
        ) : tab === 'state' ? (
          <StateView workflow={workflow} steps={steps} />
        ) : tab === 'usage' ? (
          <UsageView usage={usage} />
        ) : tab === 'faults' ? (
          <FailureLab />
        ) : tab === 'schedule' ? (
          <ScheduleView />
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

function ContextView({ packets }: { packets: any[] }) {
  if (packets.length === 0) {
    return (
      <div>
        <div className="section-label">Context</div>
        <p className="empty-state-text" style={{ padding: '16px 0' }}>
          Context composition will appear after model calls execute.
        </p>
      </div>
    )
  }

  return (
    <div>
      {packets.map((packet: any, idx: number) => {
        let comp: any
        try { comp = typeof packet.composition === 'string' ? JSON.parse(packet.composition) : packet.composition }
        catch { return null }

        const items = comp.items ?? []
        const excluded = comp.excluded ?? []
        const budget = comp.budget ?? {}

        return (
          <div key={packet.id ?? idx} style={{ marginBottom: 20 }}>
            <div className="section-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Context / {packet.phase}</span>
              <span>{packet.estimatedTokens?.toLocaleString()} est tokens</span>
            </div>

            {/* Budget bar */}
            {budget.limit && (
              <div style={{ marginBottom: 8 }}>
                <div style={{
                  height: 4, borderRadius: 2, background: 'var(--border-subtle)',
                  overflow: 'hidden', marginBottom: 4
                }}>
                  <div style={{
                    height: '100%', borderRadius: 2,
                    background: (budget.used / budget.limit) > 0.85 ? 'var(--status-warning)' : 'var(--accent)',
                    width: `${Math.min(100, (budget.used / budget.limit) * 100)}%`
                  }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text-muted)' }}>
                  <span>{budget.used?.toLocaleString()} / {budget.limit?.toLocaleString()}</span>
                  <span>{budget.remaining?.toLocaleString()} remaining</span>
                </div>
              </div>
            )}

            {/* Provider tokens vs estimated */}
            {packet.providerInputTokens != null && (
              <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text-muted)', marginBottom: 8 }}>
                Provider: {packet.providerInputTokens.toLocaleString()} input tokens
              </div>
            )}

            {/* Included items */}
            {items.map((item: any, i: number) => (
              <div key={i} className="context-row">
                <span className="context-row-label" style={{ display: 'flex', flexDirection: 'column' }}>
                  <span>{item.identifier}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {item.reason}
                    {item.truncated && ' [truncated]'}
                  </span>
                </span>
                <span className="context-row-value">{item.estimatedTokens?.toLocaleString()}</span>
              </div>
            ))}

            {/* Total */}
            <div className="context-total">
              <span>Total estimated</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{packet.estimatedTokens?.toLocaleString()}</span>
            </div>

            {/* Excluded */}
            {excluded.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 4 }}>
                  Excluded ({excluded.length})
                </div>
                {excluded.slice(0, 10).map((ex: any, i: number) => (
                  <div key={i} style={{ fontSize: 11, color: 'var(--text-muted)', padding: '2px 0' }}>
                    {ex.identifier} <span style={{ opacity: 0.6 }}>{ex.reason}</span>
                  </div>
                ))}
                {excluded.length > 10 && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', opacity: 0.6 }}>
                    +{excluded.length - 10} more
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
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

// ── Schedule ──────────────────────────────────────────────────────

import { useState, useEffect } from 'react'

function ScheduleView() {
  const [schedules, setSchedules] = useState<any[]>([])
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => {
    window.artemis.scheduler.list().then(setSchedules)
  }, [])

  const refresh = async () => {
    const list = await window.artemis.scheduler.list()
    setSchedules(list)
  }

  const handleAdd = async (name: string, goal: string, hour: number, minute: number) => {
    await window.artemis.scheduler.add({ name, goal, cronHour: hour, cronMinute: minute })
    setShowAdd(false)
    refresh()
  }

  const handleRemove = async (id: string) => {
    await window.artemis.scheduler.remove({ scheduleId: id })
    refresh()
  }

  const handleToggle = async (id: string, enabled: boolean) => {
    await window.artemis.scheduler.toggle({ scheduleId: id, enabled })
    refresh()
  }

  return (
    <div style={{ padding: '12px' }}>
      <div className="section-label" style={{ padding: 0, marginBottom: 8 }}>Scheduled Workflows</div>

      {schedules.length === 0 && !showAdd && (
        <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 12 }}>
          No schedules configured. Add one to run workflows automatically.
        </div>
      )}

      {schedules.map((s: any) => (
        <div key={s.id} style={{
          padding: '8px',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border-subtle)',
          marginBottom: 6,
          fontSize: 12
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 500, color: s.enabled ? 'var(--text-primary)' : 'var(--text-muted)' }}>
              {s.name}
            </span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)' }}>
              {String(s.cronHour).padStart(2, '0')}:{String(s.cronMinute).padStart(2, '0')}
            </span>
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 11, marginTop: 2 }}>
            {s.goal.slice(0, 60)}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6, fontSize: 11 }}>
            <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => handleToggle(s.id, !s.enabled)}>
              {s.enabled ? 'Disable' : 'Enable'}
            </button>
            <button className="btn btn-ghost" style={{ fontSize: 11, color: 'var(--status-danger)' }} onClick={() => handleRemove(s.id)}>
              Remove
            </button>
          </div>
        </div>
      ))}

      {showAdd ? (
        <AddScheduleForm onAdd={handleAdd} onCancel={() => setShowAdd(false)} />
      ) : (
        <button className="btn btn-ghost" style={{ fontSize: 11, marginTop: 4 }} onClick={() => setShowAdd(true)}>
          + Add schedule
        </button>
      )}
    </div>
  )
}

function AddScheduleForm({ onAdd, onCancel }: {
  onAdd: (name: string, goal: string, hour: number, minute: number) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('Morning Review')
  const [goal, setGoal] = useState('Review all registered projects. Summarize recent GitHub activity, open issues, and pull requests.')
  const [hour, setHour] = useState(8)
  const [minute, setMinute] = useState(0)

  return (
    <div style={{
      padding: '10px',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-md)',
      marginTop: 8
    }}>
      <div style={{ marginBottom: 6 }}>
        <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Name</label>
        <input
          value={name} onChange={e => setName(e.target.value)}
          style={{ width: '100%', padding: '4px 8px', fontSize: 12, background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', color: 'var(--text-primary)' }}
        />
      </div>
      <div style={{ marginBottom: 6 }}>
        <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Goal</label>
        <textarea
          value={goal} onChange={e => setGoal(e.target.value)}
          rows={2}
          style={{ width: '100%', padding: '4px 8px', fontSize: 12, background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', color: 'var(--text-primary)', resize: 'vertical' }}
        />
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Hour</label>
          <input
            type="number" min={0} max={23} value={hour} onChange={e => setHour(Number(e.target.value))}
            style={{ width: 50, padding: '4px 6px', fontSize: 12, background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', color: 'var(--text-primary)' }}
          />
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Minute</label>
          <input
            type="number" min={0} max={59} value={minute} onChange={e => setMinute(Number(e.target.value))}
            style={{ width: 50, padding: '4px 6px', fontSize: 12, background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)', color: 'var(--text-primary)' }}
          />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={() => onAdd(name, goal, hour, minute)}>Add</button>
      </div>
    </div>
  )
}
