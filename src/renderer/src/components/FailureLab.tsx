import { useState, useEffect } from 'react'

const FAULTS = [
  { group: 'Model', items: [
    { id: 'model.timeout', label: 'Timeout next call' },
    { id: 'model.invalid_output', label: 'Invalid plan output' },
    { id: 'model.provider_unavailable', label: 'Provider unavailable' }
  ]},
  { group: 'Tool', items: [
    { id: 'tool.timeout', label: 'Timeout next tool' },
    { id: 'tool.failure', label: 'Fail next tool' }
  ]},
  { group: 'Recovery', items: [
    { id: 'interrupt.after_step', label: 'Interrupt after next step' },
    { id: 'interrupt.after_side_effect', label: 'Crash after side effect' },
    { id: 'interrupt.before_verify', label: 'Interrupt before verify' }
  ]}
]

export function FailureLab() {
  const [armed, setArmed] = useState<string[]>([])

  useEffect(() => {
    window.artemis.faultLab.list().then((r: { armed: string[] }) => setArmed(r.armed))
  }, [])

  const handleToggle = async (fault: string) => {
    const isCurrentlyArmed = armed.includes(fault)
    const result = isCurrentlyArmed
      ? await window.artemis.faultLab.disarm(fault)
      : await window.artemis.faultLab.arm(fault)
    setArmed(result.armed)
  }

  return (
    <div>
      <div className="section-label">Failure Lab</div>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
        One-shot faults. Armed faults trigger once then auto-clear.
      </p>

      {FAULTS.map(group => (
        <div key={group.group} style={{ marginBottom: 12 }}>
          <div style={{
            fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 4
          }}>
            {group.group}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {group.items.map(item => {
              const isArmed = armed.includes(item.id)
              return (
                <button
                  key={item.id}
                  className="btn btn-ghost"
                  style={{
                    textAlign: 'left',
                    fontSize: 11,
                    padding: '4px 8px',
                    borderColor: isArmed ? 'var(--status-warning)' : undefined,
                    color: isArmed ? 'var(--status-warning)' : undefined
                  }}
                  onClick={() => handleToggle(item.id)}
                >
                  {isArmed ? '● ' : ''}{item.label}
                  {isArmed && <span style={{ float: 'right', fontSize: 9 }}>ARMED</span>}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
