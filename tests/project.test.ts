import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import {
  __setDbOpener,
  createProject, getProject, getProjectByPath, listProjects, removeProject,
  getActiveProjectId, setActiveProjectId, getActiveProject,
  getMetaValue, setMetaValue,
  createWorkflow, getWorkflow
} from '../src/main/store'

let testDb: Database.Database

beforeEach(() => {
  testDb = new Database(':memory:')
  __setDbOpener(() => testDb)
})

afterEach(() => {
  __setDbOpener(null)
  testDb.close()
})

describe('Project CRUD', () => {
  it('creates a project with stable UUID', () => {
    const p = createProject('artemis-lite', '/Users/test/artemis-lite', 'git@github.com:test/artemis-lite.git')
    expect(p.id).toBeTruthy()
    expect(p.name).toBe('artemis-lite')
    expect(p.path).toBe('/Users/test/artemis-lite')
    expect(p.remote).toBe('git@github.com:test/artemis-lite.git')
  })

  it('retrieves project by ID', () => {
    const p = createProject('test', '/tmp/test')
    const retrieved = getProject(p.id)
    expect(retrieved).toBeDefined()
    expect(retrieved!.name).toBe('test')
  })

  it('retrieves project by path', () => {
    createProject('test', '/tmp/test')
    const found = getProjectByPath('/tmp/test')
    expect(found).toBeDefined()
    expect(found!.name).toBe('test')
  })

  it('path is unique — duplicate path throws', () => {
    createProject('first', '/tmp/unique')
    expect(() => createProject('second', '/tmp/unique')).toThrow()
  })

  it('lists projects in creation order', () => {
    createProject('alpha', '/tmp/alpha')
    createProject('beta', '/tmp/beta')
    const list = listProjects()
    expect(list.length).toBe(2)
    expect(list[0].name).toBe('alpha')
    expect(list[1].name).toBe('beta')
  })

  it('removes a project', () => {
    const p = createProject('removable', '/tmp/removable')
    removeProject(p.id)
    expect(getProject(p.id)).toBeUndefined()
  })

  it('project has null remote when not provided', () => {
    const p = createProject('no-remote', '/tmp/no-remote')
    expect(p.remote).toBeNull()
  })
})

describe('Active project', () => {
  it('starts with no active project', () => {
    expect(getActiveProjectId()).toBeNull()
    expect(getActiveProject()).toBeUndefined()
  })

  it('sets and gets active project', () => {
    const p = createProject('test', '/tmp/test')
    setActiveProjectId(p.id)
    expect(getActiveProjectId()).toBe(p.id)

    const active = getActiveProject()
    expect(active).toBeDefined()
    expect(active!.name).toBe('test')
  })

  it('removing active project clears active to first remaining', () => {
    const p1 = createProject('first', '/tmp/first')
    const p2 = createProject('second', '/tmp/second')
    setActiveProjectId(p1.id)

    removeProject(p1.id)
    // Should fall back to p2
    expect(getActiveProjectId()).toBe(p2.id)
  })

  it('removing last project clears active to null', () => {
    const p = createProject('only', '/tmp/only')
    setActiveProjectId(p.id)
    removeProject(p.id)
    expect(getActiveProjectId()).toBeNull()
  })
})

describe('Meta key/value store', () => {
  it('returns null for missing key', () => {
    expect(getMetaValue('nonexistent')).toBeNull()
  })

  it('sets and gets a value', () => {
    setMetaValue('test_key', 'test_value')
    expect(getMetaValue('test_key')).toBe('test_value')
  })

  it('overwrites existing value', () => {
    setMetaValue('key', 'v1')
    setMetaValue('key', 'v2')
    expect(getMetaValue('key')).toBe('v2')
  })

  it('setting null deletes the key', () => {
    setMetaValue('key', 'value')
    setMetaValue('key', null)
    expect(getMetaValue('key')).toBeNull()
  })
})

describe('Workflow-project ownership', () => {
  it('workflow stores projectId', () => {
    const p = createProject('test', '/tmp/test')
    const wf = createWorkflow('Test goal', p.id)
    expect(wf.projectId).toBe(p.id)

    const retrieved = getWorkflow(wf.id)
    expect(retrieved!.projectId).toBe(p.id)
  })

  it('workflow without project has null projectId', () => {
    const wf = createWorkflow('No project goal')
    expect(wf.projectId).toBeNull()
  })

  it('workflow projectId survives restart (persistence)', () => {
    const p = createProject('persist-test', '/tmp/persist-test')
    const wf = createWorkflow('Persist goal', p.id)

    // Simulate restart: re-read from DB
    const retrieved = getWorkflow(wf.id)
    expect(retrieved!.projectId).toBe(p.id)

    // Project is still resolvable
    const project = getProject(retrieved!.projectId!)
    expect(project).toBeDefined()
    expect(project!.path).toBe('/tmp/persist-test')
  })
})

describe('Invalid project handling', () => {
  it('getProject returns undefined for nonexistent ID', () => {
    expect(getProject('nonexistent-id')).toBeUndefined()
  })

  it('getProjectByPath returns undefined for unregistered path', () => {
    expect(getProjectByPath('/not/registered')).toBeUndefined()
  })

  it('workflow with deleted project — projectId is nullified by ON DELETE SET NULL', () => {
    const p = createProject('ephemeral', '/tmp/ephemeral')
    const wf = createWorkflow('Goal', p.id)
    removeProject(p.id)

    const retrieved = getWorkflow(wf.id)
    // FK ON DELETE SET NULL clears the reference
    expect(retrieved!.projectId).toBeNull()
    expect(getProject(p.id)).toBeUndefined()
  })
})
