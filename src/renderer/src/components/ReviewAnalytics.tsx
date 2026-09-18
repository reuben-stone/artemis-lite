import { useState, useEffect } from 'react'

interface AnalyticsRow {
  label: string
  propertyId: string
  sessions: number
  users: number
  pageViews: number
  sessionsChange: number | null
}

export function ReviewAnalytics() {
  const [rows, setRows] = useState<AnalyticsRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const projects = await window.artemis.projects.list()
        const allRows: AnalyticsRow[] = []

        for (const project of projects) {
          let mappings: any[] = []
          try {
            const raw = project.sentryProject
            if (raw && raw.startsWith('[')) mappings = JSON.parse(raw)
          } catch { /* ok */ }

          for (const m of mappings) {
            if (m.gaPropertyId) {
              try {
                const res = await window.artemis.analytics.summary({ propertyId: m.gaPropertyId, label: m.label || project.name })
                if (res.summary) {
                  allRows.push({
                    label: res.summary.label,
                    propertyId: m.gaPropertyId,
                    sessions: res.summary.sessions,
                    users: res.summary.users || 0,
                    pageViews: res.summary.pageViews || 0,
                    sessionsChange: res.summary.sessionsChange
                  })
                }
              } catch { /* skip */ }
            }
          }
        }

        setRows(allRows)
      } catch (err) {
        console.error('Analytics load failed:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '60px 0', textAlign: 'center' }}>Loading analytics...</div>
  }

  if (rows.length === 0) {
    return (
      <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '60px 0', textAlign: 'center' }}>
        No analytics properties configured. Add GA4 Property IDs in Settings &rarr; Connections.
      </div>
    )
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 4 }}>Last 7 days vs prior 7 days</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16 }}>{rows.length} product{rows.length !== 1 ? 's' : ''} tracked</div>

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
          {rows.map(r => (
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
