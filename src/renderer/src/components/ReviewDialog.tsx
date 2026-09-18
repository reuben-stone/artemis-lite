import { useState } from 'react'
import { ReviewMorning } from './ReviewMorning'
import { ReviewIssues } from './ReviewIssues'
import { ReviewPRQueue } from './ReviewPRQueue'
import { ReviewAnalytics } from './ReviewAnalytics'

export type ReviewTab = 'morning' | 'issues' | 'prs' | 'analytics'

interface Props {
  onClose: () => void
  onSelectWorkflow: (workflowId: string) => void
  onCreateWorkflow: (goal: string) => void
  initialTab?: ReviewTab
}

const TABS: { id: ReviewTab; label: string }[] = [
  { id: 'morning', label: 'Morning' },
  { id: 'issues', label: 'Issues' },
  { id: 'prs', label: 'PR Queue' },
  { id: 'analytics', label: 'Analytics' }
]

export function ReviewDialog({ onClose, onSelectWorkflow, onCreateWorkflow, initialTab = 'morning' }: Props) {
  const [tab, setTab] = useState<ReviewTab>(initialTab)

  const switchTab = (t: ReviewTab) => setTab(t)

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="review-dialog" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 0 0 4px', marginBottom: 0, flexShrink: 0 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Review</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '4px' }}>&times;</button>
        </div>

        {/* Tab bar */}
        <div className="tab-bar" style={{ marginBottom: 0, padding: '0 0' }}>
          {TABS.map(t => (
            <button
              key={t.id}
              className="tab"
              data-active={tab === t.id ? 'true' : undefined}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="review-content">
          {tab === 'morning' && (
            <ReviewMorning
              onSwitchTab={switchTab}
              onSelectWorkflow={onSelectWorkflow}
              onCreateWorkflow={onCreateWorkflow}
              onClose={onClose}
            />
          )}
          {tab === 'issues' && (
            <ReviewIssues
              onSelectWorkflow={onSelectWorkflow}
              onCreateWorkflow={(goal) => { onCreateWorkflow(goal); onClose() }}
              onClose={onClose}
            />
          )}
          {tab === 'prs' && (
            <ReviewPRQueue />
          )}
          {tab === 'analytics' && (
            <ReviewAnalytics />
          )}
        </div>
      </div>
    </div>
  )
}
