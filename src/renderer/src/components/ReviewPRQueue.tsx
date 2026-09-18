import { useState, useEffect } from 'react'

interface ReviewPR {
  number: number
  title: string
  project: string
  author: string
  headBranch: string
  baseBranch: string
  draft: boolean
  state: string
  labels: string[]
}

export function ReviewPRQueue() {
  const [prs, setPrs] = useState<ReviewPR[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const projects = await window.artemis.projects.list()
        const allPrs: ReviewPR[] = []

        for (const project of projects) {
          if (project.githubOwner && project.githubRepo) {
            try {
              const res = await window.artemis.github.projectPrs({ owner: project.githubOwner, repo: project.githubRepo })
              if (res.pullRequests) {
                allPrs.push(...res.pullRequests.map((pr: any) => ({
                  number: pr.number,
                  title: pr.title,
                  project: project.name,
                  author: pr.author,
                  headBranch: pr.headBranch,
                  baseBranch: pr.baseBranch,
                  draft: pr.draft,
                  state: pr.state,
                  labels: pr.labels || []
                })))
              }
            } catch { /* skip */ }
          }
        }

        setPrs(allPrs)
      } catch (err) {
        console.error('PR queue load failed:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '60px 0', textAlign: 'center' }}>Loading pull requests...</div>
  }

  if (prs.length === 0) {
    return (
      <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '60px 0', textAlign: 'center' }}>
        No open pull requests across registered projects.
      </div>
    )
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 16 }}>
        {prs.length} open PR{prs.length !== 1 ? 's' : ''} across registered projects
      </div>

      {prs.map(pr => (
        <div key={`${pr.project}-${pr.number}`} className="review-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 3 }}>{pr.title}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                {pr.project} &middot; #{pr.number} &middot; {pr.author}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11 }}>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--text-secondary)' }}>{pr.headBranch}</span>
                <span style={{ color: 'var(--text-muted)' }}>&rarr;</span>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--text-muted)' }}>{pr.baseBranch}</span>
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              {pr.draft && <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Draft</div>}
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: pr.state === 'open' ? '#22c55e' : 'var(--text-muted)' }}>
                {pr.state}
              </div>
            </div>
          </div>
          {pr.labels.length > 0 && (
            <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
              {pr.labels.map(l => (
                <span key={l} style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)', padding: '1px 6px', border: '1px solid var(--border-subtle)', borderRadius: 3 }}>{l}</span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
