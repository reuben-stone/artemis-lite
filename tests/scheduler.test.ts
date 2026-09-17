import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { Scheduler } from '../src/main/scheduler'

let testDb: Database.Database
let createdWorkflows: { goal: string; projectId: string | null }[]

beforeEach(() => {
  testDb = new Database(':memory:')
  createdWorkflows = []
})

afterEach(() => {
  testDb.close()
})

function makeScheduler() {
  return new Scheduler({
    getDb: () => testDb,
    createWorkflowFn: (goal, projectId) => {
      createdWorkflows.push({ goal, projectId: projectId ?? null })
    }
  })
}

describe('Scheduler', () => {
  it('creates and lists schedules', () => {
    const s = makeScheduler()
    const row = s.addSchedule('Morning Review', 'Review all projects', 8, 0)
    expect(row.name).toBe('Morning Review')
    expect(row.cronHour).toBe(8)
    expect(row.cronMinute).toBe(0)
    expect(row.enabled).toBe(true)

    const list = s.listSchedules()
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(row.id)
  })

  it('removes schedules', () => {
    const s = makeScheduler()
    const row = s.addSchedule('Test', 'test', 12, 0)
    s.removeSchedule(row.id)
    expect(s.listSchedules()).toHaveLength(0)
  })

  it('toggles schedules', () => {
    const s = makeScheduler()
    const row = s.addSchedule('Test', 'test', 12, 0)
    s.toggleSchedule(row.id, false)
    expect(s.listSchedules()[0].enabled).toBe(false)
    s.toggleSchedule(row.id, true)
    expect(s.listSchedules()[0].enabled).toBe(true)
  })

  it('tick fires at matching time', () => {
    const s = makeScheduler()
    const now = new Date()
    s.addSchedule('Now', 'do it now', now.getHours(), now.getMinutes())

    s.tick()
    expect(createdWorkflows).toHaveLength(1)
    expect(createdWorkflows[0].goal).toBe('do it now')
  })

  it('tick does not fire disabled schedules', () => {
    const s = makeScheduler()
    const now = new Date()
    const row = s.addSchedule('Disabled', 'should not fire', now.getHours(), now.getMinutes())
    s.toggleSchedule(row.id, false)

    s.tick()
    expect(createdWorkflows).toHaveLength(0)
  })

  it('tick does not fire same schedule twice in one day', () => {
    const s = makeScheduler()
    const now = new Date()
    s.addSchedule('Once', 'only once', now.getHours(), now.getMinutes())

    s.tick()
    s.tick()
    expect(createdWorkflows).toHaveLength(1)
  })

  it('tick does not fire at wrong time', () => {
    const s = makeScheduler()
    const now = new Date()
    const wrongHour = (now.getHours() + 1) % 24
    s.addSchedule('Later', 'not now', wrongHour, now.getMinutes())

    s.tick()
    expect(createdWorkflows).toHaveLength(0)
  })
})
