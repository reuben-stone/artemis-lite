import { useState, useEffect, useCallback } from 'react'

interface Props {
  onClose: () => void
}

interface SecretState {
  anthropic: boolean
  github: boolean
  sentry: boolean
  google_analytics: boolean
}

export function SettingsDialog({ onClose }: Props) {
  const [secrets, setSecrets] = useState<SecretState>({ anthropic: false, github: false, sentry: false, google_analytics: false })
  const [tab, setTab] = useState<'keys' | 'connections'>('keys')
  const [anthropicKey, setAnthropicKey] = useState('')
  const [githubToken, setGithubToken] = useState('')
  const [sentryToken, setSentryToken] = useState('')
  const [gaCredentials, setGaCredentials] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const [a, g, s, ga] = await Promise.all([
        window.artemis.secrets.has({ name: 'anthropic' }),
        window.artemis.secrets.has({ name: 'github' }),
        window.artemis.secrets.has({ name: 'sentry' }),
        window.artemis.secrets.has({ name: 'google_analytics' })
      ])
      setSecrets({ anthropic: a.has, github: g.has, sentry: s.has, google_analytics: ga.has })
    }
    load()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    try {
      if (anthropicKey.trim()) {
        await window.artemis.secrets.set({ name: 'anthropic', value: anthropicKey.trim() })
        setAnthropicKey('')
      }
      if (githubToken.trim()) {
        await window.artemis.secrets.set({ name: 'github', value: githubToken.trim() })
        setGithubToken('')
      }
      if (sentryToken.trim()) {
        await window.artemis.secrets.set({ name: 'sentry', value: sentryToken.trim() })
        setSentryToken('')
      }
      if (gaCredentials.trim()) {
        await window.artemis.secrets.set({ name: 'google_analytics', value: gaCredentials.trim() })
        setGaCredentials('')
      }
      // Refresh state
      const [a, g, s, ga] = await Promise.all([
        window.artemis.secrets.has({ name: 'anthropic' }),
        window.artemis.secrets.has({ name: 'github' }),
        window.artemis.secrets.has({ name: 'sentry' }),
        window.artemis.secrets.has({ name: 'google_analytics' })
      ])
      setSecrets({ anthropic: a.has, github: g.has, sentry: s.has, google_analytics: ga.has })
      setMessage('Saved. Restart the app for changes to take effect.')
    } catch (err: any) {
      setMessage(`Error: ${err.message ?? String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  const handleClear = async (name: 'anthropic' | 'github') => {
    await window.artemis.secrets.clear({ name })
    const result = await window.artemis.secrets.has({ name })
    setSecrets(prev => ({ ...prev, [name]: result.has }))
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" onClick={e => e.stopPropagation()} style={{ maxWidth: 500, padding: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="dialog-title" style={{ margin: 0 }}>Settings</div>
          <button className="btn btn-ghost" onClick={onClose} style={{ fontSize: 16 }}>&times;</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border-subtle)', padding: '0 20px' }}>
          {(['keys', 'connections'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '8px 14px', fontSize: 12, fontWeight: 500, border: 'none', background: 'none', cursor: 'pointer',
              color: tab === t ? 'var(--accent)' : 'var(--text-muted)',
              borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent'
            }}>
              {t === 'keys' ? 'API Keys' : 'Connections'}
            </button>
          ))}
        </div>

        <div style={{ padding: '16px 20px', height: '500px', overflowY: 'auto' }}>

        {tab === 'keys' && <>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
            Keys are encrypted at rest using your OS keychain. They never leave the main process.
          </p>

          {/* Anthropic */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 500 }}>Anthropic API Key</label>
              {secrets.anthropic ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--status-success)' }}>Configured</span>
                  <button className="btn btn-ghost" style={{ fontSize: 10 }} onClick={() => handleClear('anthropic')}>Clear</button>
                </div>
              ) : (
                <span style={{ fontSize: 11, color: 'var(--status-danger)' }}>Not set</span>
              )}
            </div>
            <input
              type="password"
              value={anthropicKey}
              onChange={e => setAnthropicKey(e.target.value)}
              placeholder={secrets.anthropic ? 'Replace existing key...' : 'sk-ant-...'}
              style={{
                width: '100%', padding: '6px 10px', fontSize: 12,
                background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius)', color: 'var(--text-primary)',
                fontFamily: 'var(--mono)'
              }}
            />
          </div>

          {/* GitHub */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 500 }}>GitHub Token</label>
              {secrets.github ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--status-success)' }}>Configured</span>
                  <button className="btn btn-ghost" style={{ fontSize: 10 }} onClick={() => handleClear('github')}>Clear</button>
                </div>
              ) : (
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Optional</span>
              )}
            </div>
            <input
              type="password"
              value={githubToken}
              onChange={e => setGithubToken(e.target.value)}
              placeholder={secrets.github ? 'Replace existing token...' : 'ghp_... or github_pat_...'}
              style={{
                width: '100%', padding: '6px 10px', fontSize: 12,
                background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius)', color: 'var(--text-primary)',
                fontFamily: 'var(--mono)'
              }}
            />
          </div>

          {/* Sentry */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 500 }}>Sentry Auth Token</label>
              {secrets.sentry ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--status-success)' }}>Configured</span>
                  <button className="btn btn-ghost" style={{ fontSize: 10 }} onClick={() => handleClear('sentry')}>Clear</button>
                </div>
              ) : (
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Optional</span>
              )}
            </div>
            <input
              type="password"
              value={sentryToken}
              onChange={e => setSentryToken(e.target.value)}
              placeholder={secrets.sentry ? 'Replace existing token...' : 'sntrys_...'}
              style={{
                width: '100%', padding: '6px 10px', fontSize: 12,
                background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius)', color: 'var(--text-primary)',
                fontFamily: 'var(--mono)'
              }}
            />
          </div>

          {/* Google Analytics */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 500 }}>Google Analytics Credentials</label>
              {secrets.google_analytics ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--status-success)' }}>Configured</span>
                  <button className="btn btn-ghost" style={{ fontSize: 10 }} onClick={() => handleClear('google_analytics')}>Clear</button>
                </div>
              ) : (
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Optional</span>
              )}
            </div>
            <textarea
              value={gaCredentials}
              onChange={e => setGaCredentials(e.target.value)}
              placeholder={secrets.google_analytics ? 'Replace existing credentials...' : 'Paste service account JSON...'}
              rows={3}
              style={{
                width: '100%', padding: '6px 10px', fontSize: 11,
                background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius)', color: 'var(--text-primary)',
                fontFamily: 'var(--mono)', resize: 'vertical'
              }}
            />
          </div>

          {message && (
            <div style={{
              fontSize: 12, padding: '8px 10px', borderRadius: 'var(--radius)',
              background: message.startsWith('Error') ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)',
              color: message.startsWith('Error') ? 'var(--status-danger)' : 'var(--status-success)',
              marginBottom: 12
            }}>
              {message}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving || (!anthropicKey.trim() && !githubToken.trim() && !sentryToken.trim() && !gaCredentials.trim())}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </>}

        {tab === 'connections' && <>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            Map each project to its Sentry project slug and Google Analytics property ID.
          </p>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
            Sentry org: <span style={{ fontFamily: 'var(--mono)', color: 'var(--text-secondary)' }}>livana-group-ltd-1a</span>
          </div>
          <ProjectIntegrations />
        </>}

        </div>
      </div>
    </div>
  )
}

function ProjectIntegrations() {
  const [projects, setProjects] = useState<any[]>([])
  const [edits, setEdits] = useState<Record<string, { sentryProject: string; gaPropertyId: string }>>({})
  const [saved, setSaved] = useState<string | null>(null)

  const load = useCallback(async () => {
    const list = await window.artemis.projects.list()
    setProjects(list)
    const e: Record<string, { sentryProject: string; gaPropertyId: string }> = {}
    for (const p of list) {
      e[p.id] = {
        sentryProject: p.sentryProject ?? '',
        gaPropertyId: p.gaPropertyId ?? ''
      }
    }
    setEdits(e)
  }, [])

  useEffect(() => { load() }, [load])

  const handleSave = async (projectId: string) => {
    const e = edits[projectId]
    if (!e) return
    await window.artemis.projects.updateIntegrations({
      projectId,
      sentryProject: e.sentryProject || undefined,
      gaPropertyId: e.gaPropertyId || undefined
    })
    setSaved(projectId)
    setTimeout(() => setSaved(null), 2000)
  }

  if (projects.length === 0) {
    return <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No projects registered.</div>
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '4px 8px', fontSize: 11,
    background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius)', color: 'var(--text-primary)',
    fontFamily: 'var(--mono)'
  }

  return (
    <div>
      {projects.map((p: any) => (
        <div key={p.id} style={{
          padding: '10px 12px', border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius)', marginBottom: 8
        }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 2 }}>{p.name}</div>
          {p.path && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 8, fontFamily: 'var(--mono)' }}>{p.path}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <div>
              <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Sentry project(s)</label>
              <input
                value={edits[p.id]?.sentryProject ?? ''}
                onChange={e => setEdits(prev => ({ ...prev, [p.id]: { ...prev[p.id], sentryProject: e.target.value } }))}
                placeholder="e.g. lumi, lumilens"
                title="Comma-separated for monorepos"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>GA4 Property ID(s)</label>
              <input
                value={edits[p.id]?.gaPropertyId ?? ''}
                onChange={e => setEdits(prev => ({ ...prev, [p.id]: { ...prev[p.id], gaPropertyId: e.target.value } }))}
                placeholder="e.g. 345678901, 345678902"
                title="Comma-separated for monorepos"
                style={inputStyle}
              />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="btn btn-ghost" style={{ fontSize: 10 }} onClick={() => handleSave(p.id)}>
              {saved === p.id ? 'Saved' : 'Save'}
            </button>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Comma-separate for monorepos</span>
          </div>
        </div>
      ))}
    </div>
  )
}
