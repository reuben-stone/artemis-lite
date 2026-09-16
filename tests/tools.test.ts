import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { executeTool, type ToolRegistry } from '../src/main/tools/registry'
import { listWorkspaceFilesTool } from '../src/main/tools/list_workspace_files'
import { createWorkItemTool } from '../src/main/tools/create_work_item'

let testDir: string
let registry: ToolRegistry

beforeEach(() => {
  testDir = join(tmpdir(), `artemis-lite-test-${Date.now()}`)
  mkdirSync(testDir, { recursive: true })
  writeFileSync(join(testDir, 'file1.txt'), 'hello')
  writeFileSync(join(testDir, 'file2.md'), '# doc')
  mkdirSync(join(testDir, 'subdir'))

  registry = new Map()
  registry.set(listWorkspaceFilesTool.name, listWorkspaceFilesTool)
  registry.set(createWorkItemTool.name, createWorkItemTool)
})

afterEach(() => {
  if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true })
})

describe('list_workspace_files', () => {
  it('lists files in workspace root', async () => {
    const result = await executeTool(registry, 'list_workspace_files', {}, { workspacePath: testDir }) as any
    expect(result.files.length).toBe(3) // file1.txt, file2.md, subdir
    expect(result.truncated).toBe(false)
    const names = result.files.map((f: any) => f.path)
    expect(names).toContain('file1.txt')
    expect(names).toContain('file2.md')
    expect(names).toContain('subdir')
  })

  it('lists subdirectory', async () => {
    writeFileSync(join(testDir, 'subdir', 'nested.txt'), 'nested')
    const result = await executeTool(registry, 'list_workspace_files', { directory: 'subdir' }, { workspacePath: testDir }) as any
    expect(result.files.length).toBe(1)
    expect(result.files[0].path).toBe(join('subdir', 'nested.txt'))
  })

  it('reports file types and sizes', async () => {
    const result = await executeTool(registry, 'list_workspace_files', {}, { workspacePath: testDir }) as any
    const file = result.files.find((f: any) => f.path === 'file1.txt')
    expect(file.type).toBe('file')
    expect(file.sizeBytes).toBe(5) // 'hello'
    const dir = result.files.find((f: any) => f.path === 'subdir')
    expect(dir.type).toBe('directory')
  })

  it('rejects unknown tool', async () => {
    await expect(executeTool(registry, 'nonexistent', {}, { workspacePath: testDir }))
      .rejects.toThrow('Unknown tool')
  })
})

describe('create_work_item', () => {
  it('creates a work item JSON file', async () => {
    const result = await executeTool(registry, 'create_work_item', {
      title: 'Test item',
      description: 'A test work item',
      priority: 'high'
    }, { workspacePath: testDir }) as any

    expect(result.created).toBe(true)
    expect(result.path).toMatch(/^work-items\//)

    const fullPath = join(testDir, result.path)
    expect(existsSync(fullPath)).toBe(true)

    const content = JSON.parse(readFileSync(fullPath, 'utf-8'))
    expect(content.title).toBe('Test item')
    expect(content.description).toBe('A test work item')
    expect(content.priority).toBe('high')
  })

  it('rejects empty title', async () => {
    await expect(executeTool(registry, 'create_work_item', {
      title: ''
    }, { workspacePath: testDir })).rejects.toThrow()
  })

  it('uses default priority', async () => {
    const result = await executeTool(registry, 'create_work_item', {
      title: 'Default priority item'
    }, { workspacePath: testDir }) as any

    const content = JSON.parse(readFileSync(join(testDir, result.path), 'utf-8'))
    expect(content.priority).toBe('medium')
  })
})

describe('tool contracts', () => {
  it('list_workspace_files is read mode, no approval', () => {
    expect(listWorkspaceFilesTool.mode).toBe('read')
    expect(listWorkspaceFilesTool.approval).toBe('never')
  })

  it('create_work_item is write mode, requires approval', () => {
    expect(createWorkItemTool.mode).toBe('write')
    expect(createWorkItemTool.approval).toBe('write')
  })
})
