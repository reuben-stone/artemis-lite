/**
 * search_repository - read-only tool.
 * Searches for text patterns in the workspace using simple string matching.
 */
import { z } from 'zod'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative, extname } from 'path'
import type { ToolDefinition } from './registry'

const InputSchema = z.object({
  query: z.string().min(1).describe('Search term or pattern'),
  filePattern: z.string().optional().describe('File extension filter, e.g. ".ts" (default: all text files)')
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
  filesSearched: z.number()
})

type Input = z.infer<typeof InputSchema>
type Output = z.infer<typeof OutputSchema>

const MAX_MATCHES = 50
const MAX_FILES = 200
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

export const searchRepositoryTool: ToolDefinition<Input, Output> = {
  name: 'search_repository',
  description: 'Search for text in workspace files. Returns matching lines with file paths and line numbers.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  mode: 'read',
  approval: 'never',
  timeoutMs: 10_000,
  maxRetries: 0,

  async execute(input, ctx) {
    const files: string[] = []
    collectFiles(ctx.workspacePath, ctx.workspacePath, files)

    const filtered = input.filePattern
      ? files.filter(f => f.endsWith(input.filePattern!))
      : files

    const queryLower = input.query.toLowerCase()
    const matches: { file: string; line: number; content: string }[] = []
    let truncated = false

    for (const filePath of filtered) {
      if (matches.length >= MAX_MATCHES) {
        truncated = true
        break
      }
      try {
        const content = readFileSync(filePath, 'utf-8')
        const lines = content.split('\n')
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(queryLower)) {
            matches.push({
              file: relative(ctx.workspacePath, filePath),
              line: i + 1,
              content: lines[i].trim().slice(0, 200)
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
      filesSearched: filtered.length
    }
  }
}
