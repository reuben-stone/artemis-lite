import type { ReviewData } from './ReviewDialog'

interface Props {
  data: ReviewData
  projects?: { name: string; githubOwner?: string | null; githubRepo?: string | null }[]
}

export function ReviewPRQueue({ data, projects }: Props) {
  if (data.prs.length === 0) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '60px 0', textAlign: 'center' }}>No open pull requests across registered projects.</div>
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 16 }}>{data.prs.length} open PR{data.prs.length !== 1 ? 's' : ''}</div>

      {data.prs.map(pr => {
        const proj = (projects ?? data.projects ?? []).find((p: any) => p.name === pr.project)
        const prUrl = proj?.githubOwner && proj?.githubRepo
          ? `https://github.com/${proj.githubOwner}/${proj.githubRepo}/pull/${pr.number}`
          : null
        return (
          <div key={`${pr.project}-${pr.number}`} className="review-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 3 }}>{pr.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{pr.project} &middot; #{pr.number} &middot; {pr.author}</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11 }}>
                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--text-secondary)' }}>{pr.headBranch}</span>
                  <span style={{ color: 'var(--text-muted)' }}>&rarr;</span>
                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--text-muted)' }}>{pr.baseBranch}</span>
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                {pr.draft && <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Draft</div>}
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: pr.state === 'open' ? '#22c55e' : 'var(--text-muted)' }}>{pr.state}</div>
              </div>
            </div>
            {prUrl && (
              <div style={{ marginTop: 8 }}>
                <a href={prUrl} target="_blank" rel="noopener" className="review-action" style={{ textDecoration: 'none' }}>View PR &rarr;</a>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
