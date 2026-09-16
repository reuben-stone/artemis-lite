import { useState } from 'react'

interface Props {
  activeId: string | null
  onSelect: (id: string) => void
}

export function WorkflowList({ activeId, onSelect }: Props) {
  const [goal, setGoal] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = goal.trim()
    if (!trimmed) return

    const result = await window.artemis.workflows.start({ goal: trimmed })
    setGoal('')
    onSelect(result.id)
  }

  return (
    <div className="workflow-list">
      <h2 className="section-title">Workflows</h2>

      <form className="composer" onSubmit={handleSubmit}>
        <textarea
          className="composer-input"
          placeholder="Describe a task..."
          value={goal}
          onChange={e => setGoal(e.target.value)}
          rows={3}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              handleSubmit(e)
            }
          }}
        />
        <button className="btn btn-primary" type="submit" disabled={!goal.trim()}>
          Start workflow
        </button>
      </form>

      <div className="workflow-history">
        <p className="muted">No workflows yet</p>
      </div>
    </div>
  )
}
