import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import {
  __setDbOpener,
  checkIdempotency,
  markIdempotencyPending,
  markIdempotencyComplete
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

describe('Idempotency ledger', () => {
  it('returns null for unknown key', () => {
    expect(checkIdempotency('nonexistent')).toBeFalsy()
  })

  it('marks pending and retrieves', () => {
    markIdempotencyPending('wf1:step1:create_work_item:1')
    const record = checkIdempotency('wf1:step1:create_work_item:1')
    expect(record).not.toBeNull()
    expect(record!.status).toBe('pending')
    expect(record!.result).toBeNull()
  })

  it('marks completed with result', () => {
    const key = 'wf1:step1:create_work_item:1'
    markIdempotencyPending(key)
    markIdempotencyComplete(key, { id: 'abc', path: 'work-items/abc.json', created: true })

    const record = checkIdempotency(key)
    expect(record!.status).toBe('completed')
    const result = JSON.parse(record!.result!)
    expect(result.id).toBe('abc')
    expect(result.created).toBe(true)
  })

  it('duplicate pending insert is ignored (idempotent)', () => {
    const key = 'wf1:step1:create_work_item:1'
    markIdempotencyPending(key)
    markIdempotencyPending(key) // should not throw
    expect(checkIdempotency(key)!.status).toBe('pending')
  })

  it('completed record prevents re-execution', () => {
    const key = 'wf1:step1:create_work_item:1'
    markIdempotencyPending(key)
    markIdempotencyComplete(key, { created: true })

    // Simulating the orchestrator check
    const existing = checkIdempotency(key)
    expect(existing!.status).toBe('completed')
    // Orchestrator would return stored result instead of re-executing
    const storedResult = JSON.parse(existing!.result!)
    expect(storedResult.created).toBe(true)
  })
})
