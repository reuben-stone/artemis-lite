import { useState, useEffect } from 'react'

interface Props {
  onClose: () => void
}

interface SecretState {
  anthropic: boolean
  github: boolean
}

export function SettingsDialog({ onClose }: Props) {
  const [secrets, setSecrets] = useState<SecretState>({ anthropic: false, github: false })
  const [anthropicKey, setAnthropicKey] = useState('')
  const [githubToken, setGithubToken] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const [a, g] = await Promise.all([
        window.artemis.secrets.has({ name: 'anthropic' }),
        window.artemis.secrets.has({ name: 'github' })
      ])
      setSecrets({ anthropic: a.has, github: g.has })
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
      // Refresh state
      const [a, g] = await Promise.all([
        window.artemis.secrets.has({ name: 'anthropic' }),
        window.artemis.secrets.has({ name: 'github' })
      ])
      setSecrets({ anthropic: a.has, github: g.has })
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

        <div style={{ padding: '16px 20px' }}>
          <div className="section-label" style={{ padding: 0, marginBottom: 12 }}>API Keys</div>
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
            <button className="btn btn-primary" onClick={handleSave} disabled={saving || (!anthropicKey.trim() && !githubToken.trim())}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
