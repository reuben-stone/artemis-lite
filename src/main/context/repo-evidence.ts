/**
 * Repository evidence retrieval.
 * Targeted, bounded, metadata/lexical selection. No embeddings.
 *
 * Selection policy: given a goal, find the most relevant files in the
 * workspace using keyword matching and structural heuristics.
 */
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative, extname } from 'path'
import type { ContextItem, ExcludedItem, ContextSource, ExclusionReason } from './types'
import { estimateTokens } from './types'

// ── Config ─────────────────────────────────────────────────────────

const MAX_FILE_SIZE = 50_000        // chars — skip files larger than this
const MAX_EXCERPT_CHARS = 3000      // per-file excerpt limit
const MAX_FILES_SCANNED = 200       // limit directory traversal
const MAX_EVIDENCE_FILES = 8        // max files included as evidence

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'out', 'build', 'release',
  '.next', '.turbo', 'coverage', '__pycache__', '.vscode'
])

const IGNORED_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.woff', '.woff2',
  '.ttf', '.eot', '.mp3', '.mp4', '.zip', '.tar', '.gz', '.lock',
  '.map', '.min.js', '.min.css'
])

const TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.txt', '.yaml', '.yml',
  '.toml', '.css', '.html', '.sql', '.sh', '.py', '.rs', '.go',
  '.svelte', '.vue', '.env.example', '.gitignore'
])

// ── Types ──────────────────────────────────────────────────────────

export interface RepoEvidenceRequest {
  workspacePath: string
  goal: string
  budgetTokens: number
}

interface FileCandidate {
  path: string           // relative to workspace
  absolutePath: string
  sizeBytes: number
  relevanceScore: number
  reason: string
}

// ── Main entry ─────────────────────────────────────────────────────

export async function gatherRepositoryEvidence(
  req: RepoEvidenceRequest
): Promise<{ evidence: ContextItem[]; excludedFiles: ExcludedItem[] }> {
  const { workspacePath, goal, budgetTokens } = req
  const evidence: ContextItem[] = []
  const excludedFiles: ExcludedItem[] = []

  // 1. Discover files
  const allFiles = listFilesRecursive(workspacePath, '', 0)

  // 2. Score and rank by relevance to goal
  const keywords = extractKeywords(goal)
  const candidates: FileCandidate[] = []

  for (const file of allFiles) {
    const ext = extname(file.path).toLowerCase()

    // Skip binary/unsupported
    if (IGNORED_EXTENSIONS.has(ext)) {
      excludedFiles.push({ source: 'file', identifier: file.path, reason: 'binary_file' })
      continue
    }

    // Skip very large files
    if (file.sizeBytes > MAX_FILE_SIZE) {
      excludedFiles.push({ source: 'file', identifier: file.path, reason: 'too_large', estimatedTokens: Math.ceil(file.sizeBytes / 4) })
      continue
    }

    // Score relevance
    const score = scoreRelevance(file.path, keywords)
    const reason = score > 0 ? `keyword match: ${keywords.filter(k => file.path.toLowerCase().includes(k)).join(', ')}` : 'workspace file'

    candidates.push({
      path: file.path,
      absolutePath: file.absolutePath,
      sizeBytes: file.sizeBytes,
      relevanceScore: score,
      reason
    })
  }

  // 3. Sort by relevance (highest first), then by path for stability
  candidates.sort((a, b) => {
    if (b.relevanceScore !== a.relevanceScore) return b.relevanceScore - a.relevanceScore
    return a.path.localeCompare(b.path)
  })

  // 4. Select top candidates within budget
  let usedTokens = 0

  for (const candidate of candidates.slice(0, MAX_EVIDENCE_FILES * 2)) {
    if (evidence.length >= MAX_EVIDENCE_FILES) {
      excludedFiles.push({ source: 'file', identifier: candidate.path, reason: 'budget_exceeded' })
      continue
    }

    try {
      let content = readFileSync(candidate.absolutePath, 'utf-8')
      let truncated = false

      // Truncate to excerpt limit
      if (content.length > MAX_EXCERPT_CHARS) {
        content = content.slice(0, MAX_EXCERPT_CHARS) + '\n[truncated]'
        truncated = true
      }

      const tokens = estimateTokens(content)

      if (usedTokens + tokens > budgetTokens) {
        excludedFiles.push({ source: 'file', identifier: candidate.path, reason: 'budget_exceeded', estimatedTokens: tokens })
        continue
      }

      evidence.push({
        source: 'file' as ContextSource,
        identifier: candidate.path,
        reason: candidate.reason,
        content: `// ${candidate.path}\n${content}`,
        estimatedTokens: tokens,
        truncated
      })

      usedTokens += tokens
    } catch {
      excludedFiles.push({ source: 'file', identifier: candidate.path, reason: 'unsupported' })
    }
  }

  // Record remaining unscored files as excluded
  for (const candidate of candidates.slice(MAX_EVIDENCE_FILES * 2)) {
    if (candidate.relevanceScore === 0) {
      excludedFiles.push({ source: 'file', identifier: candidate.path, reason: 'not_relevant' })
    } else {
      excludedFiles.push({ source: 'file', identifier: candidate.path, reason: 'budget_exceeded' })
    }
  }

  return { evidence, excludedFiles }
}

// ── File discovery ─────────────────────────────────────────────────

interface DiscoveredFile {
  path: string           // relative
  absolutePath: string
  sizeBytes: number
}

function listFilesRecursive(root: string, rel: string, count: number): DiscoveredFile[] {
  if (count >= MAX_FILES_SCANNED) return []

  const results: DiscoveredFile[] = []
  const dir = rel ? join(root, rel) : root

  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (results.length + count >= MAX_FILES_SCANNED) break

      const entryRel = rel ? `${rel}/${entry.name}` : entry.name

      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
        const sub = listFilesRecursive(root, entryRel, count + results.length)
        results.push(...sub)
      } else if (entry.isFile()) {
        const abs = join(dir, entry.name)
        try {
          const stat = statSync(abs)
          results.push({ path: entryRel, absolutePath: abs, sizeBytes: stat.size })
        } catch { /* skip unreadable */ }
      }
    }
  } catch { /* skip unreadable directories */ }

  return results
}

// ── Keyword extraction and scoring ─────────────────────────────────

function extractKeywords(goal: string): string[] {
  const stopwords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
    'it', 'its', 'this', 'that', 'these', 'those', 'i', 'we', 'you', 'my',
    'me', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'can',
    'have', 'has', 'had', 'not', 'no', 'all', 'any', 'some', 'what', 'how',
    'which', 'when', 'where', 'who', 'why', 'if', 'then', 'than', 'so',
    'just', 'also', 'about', 'up', 'out', 'into', 'over', 'after', 'before'
  ])

  return goal
    .toLowerCase()
    .replace(/[^a-z0-9_\-./]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopwords.has(w))
}

function scoreRelevance(filePath: string, keywords: string[]): number {
  const lower = filePath.toLowerCase()
  let score = 0

  for (const kw of keywords) {
    if (lower.includes(kw)) score += 2
  }

  // Structural bonuses
  const ext = extname(filePath).toLowerCase()
  if (TEXT_EXTENSIONS.has(ext)) score += 1
  if (filePath.includes('src/')) score += 1
  if (filePath.endsWith('.md')) score += 1
  if (filePath === 'README.md') score += 2
  if (filePath === 'package.json') score += 1

  return score
}
