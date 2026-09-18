/**
 * search_repository - read-only tool.
 * Searches for text patterns in the workspace using string or regex matching.
 * Supports directory scoping for progressive discovery in monorepos.
 */
import { z } from 'zod'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative, extname } from 'path'
import type { ToolDefinition } from './registry'

const InputSchema = z.object({
  query: z.string().min(1).describe('Search term or regex pattern'),
  filePattern: z.string().optional().describe('File extension filter, e.g. ".ts" or ".js" (default: all text files). Omit unless you are sure of the file type.'),
  directory: z.string().optional().describe('Subdirectory to search within (default: workspace root). Use this to scope searches to specific packages or source directories.'),
  regex: z.boolean().optional().describe('Treat query as a regular expression (default: false, uses case-insensitive string match)'),
  contextLines: z.number().int().min(0).max(3).optional().describe('Lines of context around each match (default: 0)')
})

const MatchSchema = z.object({
  file: z.string(),
  line: z.number(),
  content: z.string()
})

const OutputSchema = z.object({
  query: z.string(),
  matches: z.array(MatchSchema),
  totalMatches: z.number(),
  truncated: z.boolean(),
  filesSearched: z.number(),
  searchRoot: z.string()
})

type Input = z.infer<typeof InputSchema>
type Output = z.infer<typeof OutputSchema>

const MAX_MATCHES = 50
const MAX_FILES = 200
const MAX_REGEX_LENGTH = 200
const TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.txt', '.css', '.html',
  '.yml', '.yaml', '.toml', '.sh', '.sql', '.py', '.go', '.rs', '.env',
  '.gitignore', '.eslintrc', '.prettierrc', ''
])
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'out', 'build', '.next', 'coverage'])

function collectFiles(dir: string, root: string, files: string[]): void {
  if (files.length >= MAX_FILES) return
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (files.length >= MAX_FILES) return
      if (SKIP_DIRS.has(entry.name)) continue
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        collectFiles(fullPath, root, files)
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase()
        if (TEXT_EXTENSIONS.has(ext)) {
          const stat = statSync(fullPath)
          if (stat.size < 256_000) {
            files.push(fullPath)
          }
        }
      }
    }
  } catch { /* skip unreadable dirs */ }
}

function buildMatcher(query: string, useRegex: boolean): (line: string) => boolean {
  if (useRegex) {
    if (query.length > MAX_REGEX_LENGTH) {
      throw new Error(`Regex pattern too long (max ${MAX_REGEX_LENGTH} chars)`)
    }
    const re = new RegExp(query, 'i')
    return (line: string) => re.test(line)
  }
  const queryLower = query.toLowerCase()
  return (line: string) => line.toLowerCase().includes(queryLower)
}

export const searchRepositoryTool: ToolDefinition<Input, Output> = {
  name: 'search_repository',
  description: 'Search for text or regex patterns in workspace files. Returns matching lines with file paths and line numbers. Use the directory parameter to scope searches to specific subdirectories - this is essential in monorepos to avoid hitting the file/match limit on irrelevant code. Use contextLines to see surrounding code.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  mode: 'read',
  approval: 'never',
  timeoutMs: 10_000,
  maxRetries: 0,

  async execute(input, ctx) {
    const searchRoot = input.directory
      ? join(ctx.workspacePath, input.directory)
      : ctx.workspacePath

    // Path containment check
    if (!searchRoot.startsWith(ctx.workspacePath)) {
      throw new Error('Path traversal blocked: directory outside workspace')
    }

    const matcher = buildMatcher(input.query, input.regex ?? false)

    const files: string[] = []
    collectFiles(searchRoot, ctx.workspacePath, files)

    let filtered = files
    if (input.filePattern) {
      const byExt = files.filter(f => f.endsWith(input.filePattern!))
      // Fall back to all files if the extension filter matches nothing -
      // avoids 0-result searches when the model guesses the wrong extension
      filtered = byExt.length > 0 ? byExt : files
    }

    const matches: { file: string; line: number; content: string }[] = []
    let truncated = false
    const contextN = input.contextLines ?? 0

    for (const filePath of filtered) {
      if (matches.length >= MAX_MATCHES) {
        truncated = true
        break
      }
      try {
        const content = readFileSync(filePath, 'utf-8')
        const lines = content.split('\n')
        for (let i = 0; i < lines.length; i++) {
          if (matcher(lines[i])) {
            let matchContent = lines[i].trim().slice(0, 200)
            if (contextN > 0) {
              const start = Math.max(0, i - contextN)
              const end = Math.min(lines.length - 1, i + contextN)
              const contextBlock = lines.slice(start, end + 1).map((l, idx) => {
                const lineNum = start + idx + 1
                const marker = (start + idx === i) ? '>' : ' '
                return `${marker}${lineNum}: ${l}`
              }).join('\n')
              matchContent = contextBlock.slice(0, 500)
            }
            matches.push({
              file: relative(ctx.workspacePath, filePath),
              line: i + 1,
              content: matchContent
            })
            if (matches.length >= MAX_MATCHES) {
              truncated = true
              break
            }
          }
        }
      } catch { /* skip unreadable files */ }
    }

    return {
      query: input.query,
      matches,
      totalMatches: matches.length,
      truncated,
      filesSearched: filtered.length,
      searchRoot: relative(ctx.workspacePath, searchRoot) || '.'
    }
  }
}
