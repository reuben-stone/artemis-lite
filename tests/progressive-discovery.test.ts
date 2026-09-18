/**
 * Progressive discovery regression tests.
 *
 * Uses a monorepo-shaped fixture where the relevant implementation sits
 * beyond the global 200-file search limit. Verifies that directory-scoped
 * progressive investigation locates it without increasing global limits.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { executeTool, type ToolRegistry } from '../src/main/tools/registry'
import { listWorkspaceFilesTool } from '../src/main/tools/list_workspace_files'
import { searchRepositoryTool } from '../src/main/tools/search_repository'
import { readFileTool } from '../src/main/tools/read_file'

let testDir: string
let registry: ToolRegistry

// Create a monorepo with 200+ filler files and a target buried deep
function createMonorepoFixture(root: string) {
  // Top-level config files
  writeFileSync(join(root, 'package.json'), '{ "name": "monorepo", "workspaces": ["apps/*", "packages/*"] }')
  writeFileSync(join(root, 'tsconfig.json'), '{ "compilerOptions": {} }')

  // apps/frontend - lots of components (fills up file budget)
  const frontendSrc = join(root, 'apps', 'frontend', 'src', 'components')
  mkdirSync(frontendSrc, { recursive: true })
  for (let i = 0; i < 120; i++) {
    writeFileSync(
      join(frontendSrc, `Component${i}.tsx`),
      `import React from 'react'\nexport function Component${i}() {\n  const headers = { 'Content-Type': 'application/json' }\n  return <div>Component ${i}</div>\n}\n`
    )
  }

  // apps/admin - more filler
  const adminSrc = join(root, 'apps', 'admin', 'src')
  mkdirSync(adminSrc, { recursive: true })
  for (let i = 0; i < 60; i++) {
    writeFileSync(
      join(adminSrc, `page${i}.ts`),
      `export function page${i}() {\n  const headers = { Authorization: 'Bearer token' }\n  return fetch('/api/data', { headers })\n}\n`
    )
  }

  // packages/shared - more filler
  const sharedSrc = join(root, 'packages', 'shared', 'src')
  mkdirSync(sharedSrc, { recursive: true })
  for (let i = 0; i < 40; i++) {
    writeFileSync(
      join(sharedSrc, `util${i}.ts`),
      `export function util${i}(input: string) { return input.toLowerCase() }\n`
    )
  }

  // apps/worker/src - the target subsystem (beyond the 200-file limit in global walk)
  const workerSrc = join(root, 'apps', 'worker', 'src')
  mkdirSync(workerSrc, { recursive: true })
  writeFileSync(join(workerSrc, 'index.ts'), `import { dispatchScan } from './dispatcher'\ndispatchScan()`)

  // THE TARGET: dispatcher.ts sets a custom header with user-supplied page title
  // This is where a non-ASCII character in the title would cause a ByteString error
  writeFileSync(join(workerSrc, 'dispatcher.ts'), `
import { fetchWithRetry } from './http'

export async function dispatchScan(pageTitle: string, url: string) {
  // BUG: pageTitle may contain non-ASCII characters (em-dashes, smart quotes)
  // which cause "Cannot convert argument to a ByteString" when set as a header value
  const response = await fetchWithRetry(url, {
    headers: {
      'X-Page-Title': pageTitle,
      'X-Scan-URL': url,
      'Content-Type': 'application/json'
    }
  })
  return response.json()
}
`)

  writeFileSync(join(workerSrc, 'http.ts'), `
export async function fetchWithRetry(url: string, init: RequestInit, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fetch(url, init)
    } catch (err) {
      if (i === retries - 1) throw err
    }
  }
  throw new Error('unreachable')
}
`)

  return {
    totalFiles: 120 + 60 + 40 + 4 + 2, // 226 files
    targetFile: 'apps/worker/src/dispatcher.ts',
    targetLine: 7 // 'X-Page-Title': pageTitle
  }
}

beforeEach(() => {
  testDir = join(tmpdir(), `artemis-progressive-${Date.now()}`)
  mkdirSync(testDir, { recursive: true })
  registry = new Map()
  registry.set(listWorkspaceFilesTool.name, listWorkspaceFilesTool)
  registry.set(searchRepositoryTool.name, searchRepositoryTool)
  registry.set(readFileTool.name, readFileTool)
})

afterEach(() => {
  if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true })
})

describe('Progressive monorepo discovery', () => {
  it('global unscoped search for "headers" hits match limit without finding target', async () => {
    const fixture = createMonorepoFixture(testDir)

    // Unscoped search for broad term - should truncate before reaching worker/
    const result = await executeTool(registry, 'search_repository', {
      query: 'headers'
    }, { workspacePath: testDir }) as any

    expect(result.truncated).toBe(true)
    expect(result.totalMatches).toBe(50) // hits MAX_MATCHES

    // The target file should NOT appear in results (buried beyond file limit)
    const targetMatch = result.matches.find((m: any) => m.file.includes('worker/src/dispatcher'))
    expect(targetMatch).toBeUndefined()
  })

  it('scoped search within worker/ finds the target directly', async () => {
    createMonorepoFixture(testDir)

    const result = await executeTool(registry, 'search_repository', {
      query: 'X-Page-Title',
      directory: 'apps/worker/src'
    }, { workspacePath: testDir }) as any

    expect(result.truncated).toBe(false)
    expect(result.totalMatches).toBe(1)
    expect(result.matches[0].file).toBe('apps/worker/src/dispatcher.ts')
    expect(result.searchRoot).toBe('apps/worker/src')
  })

  it('progressive discovery pattern: structure -> scope -> read', async () => {
    createMonorepoFixture(testDir)

    // Step 1: list_workspace_files to understand structure
    const structure = await executeTool(registry, 'list_workspace_files', {}, { workspacePath: testDir }) as any
    const dirs = structure.files.filter((f: any) => f.type === 'directory').map((f: any) => f.path)
    expect(dirs).toContain('apps')
    expect(dirs).toContain('packages')

    // Step 2: drill into apps/
    const apps = await executeTool(registry, 'list_workspace_files', { directory: 'apps' }, { workspacePath: testDir }) as any
    const appDirs = apps.files.filter((f: any) => f.type === 'directory').map((f: any) => f.path)
    expect(appDirs).toContain(join('apps', 'worker'))

    // Step 3: scoped search for specific error-related term
    const scoped = await executeTool(registry, 'search_repository', {
      query: 'X-Page-Title',
      directory: 'apps/worker'
    }, { workspacePath: testDir }) as any

    expect(scoped.totalMatches).toBeGreaterThan(0)
    const targetFile = scoped.matches[0].file
    expect(targetFile).toBe('apps/worker/src/dispatcher.ts')

    // Step 4: read the target file to understand context
    const content = await executeTool(registry, 'read_file', {
      path: targetFile
    }, { workspacePath: testDir }) as any

    expect(content.content).toContain('X-Page-Title')
    expect(content.content).toContain('pageTitle')
    expect(content.content).toContain('non-ASCII')
  })

  it('regex search finds specific patterns', async () => {
    createMonorepoFixture(testDir)

    // Regex for custom header assignment with a variable (not a string literal)
    const result = await executeTool(registry, 'search_repository', {
      query: "'X-[A-Za-z-]+':\\s*[a-z]",
      regex: true,
      directory: 'apps/worker'
    }, { workspacePath: testDir }) as any

    expect(result.totalMatches).toBeGreaterThan(0)
    expect(result.matches.some((m: any) => m.file.includes('dispatcher'))).toBe(true)
  })

  it('contextLines shows surrounding code', async () => {
    createMonorepoFixture(testDir)

    const result = await executeTool(registry, 'search_repository', {
      query: 'X-Page-Title',
      directory: 'apps/worker',
      contextLines: 2
    }, { workspacePath: testDir }) as any

    expect(result.totalMatches).toBe(1)
    // Context should include lines before and after
    expect(result.matches[0].content).toContain('>')  // marker for matching line
    expect(result.matches[0].content).toContain('headers')
  })

  it('read_file offset jumps to match location', async () => {
    createMonorepoFixture(testDir)

    // Search finds a match at a specific line
    const search = await executeTool(registry, 'search_repository', {
      query: 'fetchWithRetry',
      directory: 'apps/worker/src',
      filePattern: '.ts'
    }, { workspacePath: testDir }) as any

    const dispatcherMatch = search.matches.find((m: any) => m.file.includes('dispatcher'))
    expect(dispatcherMatch).toBeDefined()

    // Read from just before the match
    const offset = Math.max(0, dispatcherMatch.line - 3)
    const content = await executeTool(registry, 'read_file', {
      path: dispatcherMatch.file,
      offset,
      maxLines: 10
    }, { workspacePath: testDir }) as any

    expect(content.content).toContain('fetchWithRetry')
    expect(content.content).toContain('headers')
  })

  it('directory path traversal is blocked', async () => {
    createMonorepoFixture(testDir)

    await expect(executeTool(registry, 'search_repository', {
      query: 'test',
      directory: '../../etc'
    }, { workspacePath: testDir })).rejects.toThrow('Path traversal blocked')
  })

  it('searchRoot is reported in output', async () => {
    createMonorepoFixture(testDir)

    const global = await executeTool(registry, 'search_repository', {
      query: 'fetchWithRetry'
    }, { workspacePath: testDir }) as any
    expect(global.searchRoot).toBe('.')

    const scoped = await executeTool(registry, 'search_repository', {
      query: 'fetchWithRetry',
      directory: 'apps/worker'
    }, { workspacePath: testDir }) as any
    expect(scoped.searchRoot).toBe('apps/worker')
  })
})
