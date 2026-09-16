import { useState, useEffect, useRef } from 'react'

interface Props {
  onSubmit: (goal: string) => void
  onClose: () => void
}

export function NewWorkflowDialog({ onSubmit, onClose }: Props) {
  const [goal, setGoal] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = goal.trim()
    if (trimmed) onSubmit(trimmed)
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" onClick={e => e.stopPropagation()} role="dialog" aria-label="New workflow">
        <h2 className="dialog-title">New workflow</h2>

        <form onSubmit={handleSubmit}>
          <label className="dialog-label" htmlFor="goal-input">Goal</label>
          <textarea
            ref={inputRef}
            id="goal-input"
            className="dialog-textarea"
            placeholder="Prepare release notes from the project notes and create a follow-up task for anything unresolved."
            value={goal}
            onChange={e => setGoal(e.target.value)}
            rows={4}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                handleSubmit(e)
              }
            }}
          />
          <p className="dialog-hint">
            Artemis Lite will create a bounded plan, execute permitted tools, request
            approval before side effects, and verify the result.
          </p>

          <div className="dialog-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={!goal.trim()}>
              Start workflow
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
