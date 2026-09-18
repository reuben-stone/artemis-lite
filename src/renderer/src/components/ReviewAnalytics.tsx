import type { ReviewData } from './ReviewDialog'

interface Props {
  data: ReviewData
}

export function ReviewAnalytics({ data }: Props) {
  if (data.analytics.length === 0) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '60px 0', textAlign: 'center' }}>No analytics properties configured. Add GA4 Property IDs in Settings &rarr; Connections.</div>
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 4 }}>Last 7 days vs prior 7 days</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16 }}>{data.analytics.length} product{data.analytics.length !== 1 ? 's' : ''} tracked</div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <th style={{ textAlign: 'left', padding: '8px 0', color: 'var(--text-muted)', fontWeight: 400, fontSize: 11 }}>Product</th>
            <th style={{ textAlign: 'right', padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 400, fontSize: 11 }}>Sessions</th>
            <th style={{ textAlign: 'right', padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 400, fontSize: 11 }}>Users</th>
            <th style={{ textAlign: 'right', padding: '8px 0', color: 'var(--text-muted)', fontWeight: 400, fontSize: 11 }}>Page Views</th>
          </tr>
        </thead>
        <tbody>
          {data.analytics.map(r => (
            <tr key={r.propertyId} style={{ borderBottom: '1px solid rgba(42,43,48,0.4)' }}>
              <td style={{ padding: '10px 0', color: 'var(--text-primary)', fontWeight: 500 }}>{r.label}</td>
              <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                {r.sessions.toLocaleString()}
                {r.sessionsChange !== null && r.sessionsChange !== 0 && (
                  <span style={{ color: r.sessionsChange > 0 ? '#22c55e' : 'var(--text-muted)', marginLeft: 6, fontSize: 11 }}>
                    {r.sessionsChange > 0 ? '+' : ''}{r.sessionsChange}%
                  </span>
                )}
              </td>
              <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>{r.users.toLocaleString()}</td>
              <td style={{ padding: '10px 0', textAlign: 'right', color: 'var(--text-secondary)' }}>{r.pageViews.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
