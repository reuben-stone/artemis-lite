import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import {
  __setDbOpener,
  upsertSignal, getSignalByExternalId, getSignal, listSignals,
  listSignalsByStatus, claimSignal, completeSignal, failSignal,
  publishSignal, ignoreSignal,
  createWorkflow, getWorkflow, createProject
} from '../src/main/store'
import {
  ingestSentryIssues, isEligibleForAutoInvestigation,
  processIngestedSignals, isCollecting, setCollecting
} from '../src/main/signals'
import type { SentryIssue } from '../src/main/sentry'
import type { SignalRow } from '../src/main/store'

let testDb: Database.Database

beforeEach(() => {
  testDb = new Database(':memory:')
  __setDbOpener(() => testDb)
})

afterEach(() => {
  __setDbOpener(null)
  testDb.close()
})

// ── Observation deduplication (Requirement A) ─────────────────────

describe('Observation deduplication', () => {
  it('creates a new signal on first observation', () => {
    const { row, isNew } = upsertSignal({
      source: 'sentry', externalId: '12345', shortId: 'LUMI-1',
      projectId: 'proj-1', title: 'TypeError: foo', level: 'error',
      eventCount: 3, firstSeen: '2026-09-18T10:00:00Z', lastSeen: '2026-09-18T12:00:00Z'
    })

    expect(isNew).toBe(true)
    expect(row.source).toBe('sentry')
    expect(row.externalId).toBe('12345')
    expect(row.status).toBe('observed')
    expect(row.workflowId).toBeNull()
    expect(row.prNumber).toBeNull()
    expect(row.eventCount).toBe(3)
  })

  it('updates counts on repeated observation without regressing status', () => {
    // First observation
    upsertSignal({
      source: 'sentry', externalId: '12345', projectId: 'proj-1',
      title: 'TypeError: foo', eventCount: 3, lastSeen: '2026-09-18T12:00:00Z'
    })

    // Claim the signal
    const signal = getSignalByExternalId('sentry', '12345')!
    claimSignal(signal.id, 'wf-1')

    // Second observation - higher event count
    const { row, isNew } = upsertSignal({
      source: 'sentry', externalId: '12345', projectId: 'proj-1',
      title: 'TypeError: foo', eventCount: 8, lastSeen: '2026-09-18T14:00:00Z'
    })

    expect(isNew).toBe(false)
    expect(row.eventCount).toBe(8)
    expect(row.lastSeen).toBe('2026-09-18T14:00:00Z')
    // Status must NOT regress
    expect(row.status).toBe('investigating')
    expect(row.workflowId).toBe('wf-1')
  })

  it('deduplicates by (source, externalId) - same issue = same row', () => {
    upsertSignal({ source: 'sentry', externalId: '100', projectId: 'p1', title: 'A', eventCount: 1 })
    upsertSignal({ source: 'sentry', externalId: '100', projectId: 'p1', title: 'A updated', eventCount: 5 })

    const all = listSignals()
    expect(all.length).toBe(1)
    expect(all[0].eventCount).toBe(5)
    expect(all[0].title).toBe('A updated')
  })

  it('different externalIds create separate signals', () => {
    upsertSignal({ source: 'sentry', externalId: '100', projectId: 'p1', title: 'A', eventCount: 1 })
    upsertSignal({ source: 'sentry', externalId: '200', projectId: 'p1', title: 'B', eventCount: 1 })

    expect(listSignals().length).toBe(2)
  })

  it('never overwrites status/workflowId/prNumber on conflict', () => {
    upsertSignal({ source: 'sentry', externalId: '100', projectId: 'p1', title: 'A', eventCount: 1 })
    const s = getSignalByExternalId('sentry', '100')!
    claimSignal(s.id, 'wf-x')
    publishSignal(s.id, 42)

    // Re-observe the same issue
    const { row } = upsertSignal({ source: 'sentry', externalId: '100', projectId: 'p1', title: 'A', eventCount: 10 })

    expect(row.status).toBe('published')
    expect(row.workflowId).toBe('wf-x')
    expect(row.prNumber).toBe(42)
    expect(row.eventCount).toBe(10) // count updates
  })
})

// ── Consequential work claim (Requirement B) ──────────────────────

describe('Atomic signal claiming', () => {
  it('first claim succeeds', () => {
    upsertSignal({ source: 'sentry', externalId: '100', projectId: 'p1', title: 'A', eventCount: 1 })
    const s = getSignalByExternalId('sentry', '100')!

    const claimed = claimSignal(s.id, 'wf-1')
    expect(claimed).toBe(true)

    const after = getSignal(s.id)!
    expect(after.status).toBe('investigating')
    expect(after.workflowId).toBe('wf-1')
  })

  it('second claim for same signal fails (concurrent claim test)', () => {
    upsertSignal({ source: 'sentry', externalId: '100', projectId: 'p1', title: 'A', eventCount: 1 })
    const s = getSignalByExternalId('sentry', '100')!

    // Caller A claims
    const claimA = claimSignal(s.id, 'wf-A')
    // Caller B attempts to claim the same signal
    const claimB = claimSignal(s.id, 'wf-B')

    expect(claimA).toBe(true)
    expect(claimB).toBe(false)

    // Only caller A owns the signal
    const after = getSignal(s.id)!
    expect(after.workflowId).toBe('wf-A')
    expect(after.status).toBe('investigating')
  })

  it('cannot claim a signal that is not in observed state', () => {
    upsertSignal({ source: 'sentry', externalId: '100', projectId: 'p1', title: 'A', eventCount: 1 })
    const s = getSignalByExternalId('sentry', '100')!

    // Claim and complete
    claimSignal(s.id, 'wf-1')
    completeSignal(s.id)

    // Try to claim the completed signal
    const claimed = claimSignal(s.id, 'wf-2')
    expect(claimed).toBe(false)

    const after = getSignal(s.id)!
    expect(after.status).toBe('investigated')
    expect(after.workflowId).toBe('wf-1')
  })

  it('cannot claim a failed signal', () => {
    upsertSignal({ source: 'sentry', externalId: '100', projectId: 'p1', title: 'A', eventCount: 1 })
    const s = getSignalByExternalId('sentry', '100')!

    claimSignal(s.id, 'wf-1')
    failSignal(s.id)

    const claimed = claimSignal(s.id, 'wf-2')
    expect(claimed).toBe(false)
    expect(getSignal(s.id)!.status).toBe('failed')
  })

  it('cannot claim an ignored signal', () => {
    upsertSignal({ source: 'sentry', externalId: '100', projectId: 'p1', title: 'A', eventCount: 1 })
    const s = getSignalByExternalId('sentry', '100')!

    ignoreSignal(s.id)

    const claimed = claimSignal(s.id, 'wf-1')
    expect(claimed).toBe(false)
  })

})

// ── Signal lifecycle transitions ──────────────────────────────────

describe('Signal lifecycle', () => {
  it('full lifecycle: observed -> investigating -> investigated -> published', () => {
    upsertSignal({ source: 'sentry', externalId: '100', projectId: 'p1', title: 'A', eventCount: 1 })
    const s = getSignalByExternalId('sentry', '100')!

    expect(s.status).toBe('observed')

    claimSignal(s.id, 'wf-1')
    expect(getSignal(s.id)!.status).toBe('investigating')

    completeSignal(s.id)
    expect(getSignal(s.id)!.status).toBe('investigated')

    publishSignal(s.id, 99)
    const after = getSignal(s.id)!
    expect(after.status).toBe('published')
    expect(after.prNumber).toBe(99)
  })

  it('failure lifecycle: observed -> investigating -> failed', () => {
    upsertSignal({ source: 'sentry', externalId: '100', projectId: 'p1', title: 'A', eventCount: 1 })
    const s = getSignalByExternalId('sentry', '100')!

    claimSignal(s.id, 'wf-1')
    failSignal(s.id)

    const after = getSignal(s.id)!
    expect(after.status).toBe('failed')
    expect(after.workflowId).toBe('wf-1')
  })

  it('listSignalsByStatus filters correctly', () => {
    upsertSignal({ source: 'sentry', externalId: '1', projectId: 'p1', title: 'A', eventCount: 1 })
    upsertSignal({ source: 'sentry', externalId: '2', projectId: 'p1', title: 'B', eventCount: 1 })
    upsertSignal({ source: 'sentry', externalId: '3', projectId: 'p1', title: 'C', eventCount: 1 })

    const s2 = getSignalByExternalId('sentry', '2')!
    claimSignal(s2.id, 'wf-1')

    expect(listSignalsByStatus('observed').length).toBe(2)
    expect(listSignalsByStatus('investigating').length).toBe(1)
  })

  it('listSignals filters by projectId', () => {
    upsertSignal({ source: 'sentry', externalId: '1', projectId: 'p1', title: 'A', eventCount: 1 })
    upsertSignal({ source: 'sentry', externalId: '2', projectId: 'p2', title: 'B', eventCount: 1 })

    expect(listSignals('p1').length).toBe(1)
    expect(listSignals('p2').length).toBe(1)
    expect(listSignals().length).toBe(2)
  })
})

// ── Failed workflow deduplication (Test B) ────────────────────────

describe('Failed workflow deduplication', () => {
  it('failed signal remains deduplicated after re-observation', () => {
    // Initial observation
    upsertSignal({ source: 'sentry', externalId: '100', projectId: 'p1', title: 'A', eventCount: 3 })
    const s = getSignalByExternalId('sentry', '100')!

    // Claim and fail
    claimSignal(s.id, 'wf-1')
    failSignal(s.id)

    // Re-observe the same issue with higher count
    const { row } = upsertSignal({
      source: 'sentry', externalId: '100', projectId: 'p1',
      title: 'A', eventCount: 12, lastSeen: '2026-09-19T10:00:00Z'
    })

    // Status stays failed, counts update
    expect(row.status).toBe('failed')
    expect(row.eventCount).toBe(12)
    expect(row.lastSeen).toBe('2026-09-19T10:00:00Z')
    expect(row.workflowId).toBe('wf-1')

    // Cannot claim again
    const claimed = claimSignal(s.id, 'wf-2')
    expect(claimed).toBe(false)
  })

  it('published signal remains deduplicated after re-observation', () => {
    upsertSignal({ source: 'sentry', externalId: '100', projectId: 'p1', title: 'A', eventCount: 3 })
    const s = getSignalByExternalId('sentry', '100')!
    claimSignal(s.id, 'wf-1')
    completeSignal(s.id)
    publishSignal(s.id, 42)

    // Re-observe
    const { row } = upsertSignal({
      source: 'sentry', externalId: '100', projectId: 'p1',
      title: 'A', eventCount: 20
    })

    expect(row.status).toBe('published')
    expect(row.prNumber).toBe(42)
    expect(row.eventCount).toBe(20)

    // Cannot claim
    const claimed = claimSignal(s.id, 'wf-3')
    expect(claimed).toBe(false)
  })
})

// ── Sentry ingestion adapter ──────────────────────────────────────

describe('Sentry signal ingestion', () => {
  function makeSentryIssue(id: string, title: string, count: string): SentryIssue {
    return {
      id, title, culprit: 'test.ts', shortId: `TEST-${id}`,
      level: 'error', status: 'unresolved', count,
      firstSeen: '2026-09-18T10:00:00Z', lastSeen: '2026-09-18T12:00:00Z',
      isRegression: false,
      metadata: { type: 'TypeError', value: 'foo' },
      project: { slug: 'test-project' }
    }
  }

  it('ingests new issues as observed signals', () => {
    const result = ingestSentryIssues([
      makeSentryIssue('100', 'TypeError: foo', '5'),
      makeSentryIssue('200', 'ReferenceError: bar', '2')
    ], 'proj-1')

    expect(result.new.length).toBe(2)
    expect(result.updated.length).toBe(0)
    expect(listSignals().length).toBe(2)
  })

  it('re-ingestion updates counts without creating duplicates', () => {
    ingestSentryIssues([makeSentryIssue('100', 'TypeError: foo', '5')], 'proj-1')
    const result = ingestSentryIssues([makeSentryIssue('100', 'TypeError: foo', '12')], 'proj-1')

    expect(result.new.length).toBe(0)
    expect(result.updated.length).toBe(1)
    expect(listSignals().length).toBe(1)
    expect(listSignals()[0].eventCount).toBe(12)
  })

  it('does not regress signal status on re-ingestion', () => {
    ingestSentryIssues([makeSentryIssue('100', 'TypeError: foo', '5')], 'proj-1')
    const s = getSignalByExternalId('sentry', '100')!
    claimSignal(s.id, 'wf-1')
    failSignal(s.id)

    // Re-ingest
    const result = ingestSentryIssues([makeSentryIssue('100', 'TypeError: foo', '20')], 'proj-1')
    expect(result.updated[0].status).toBe('failed')
    expect(result.updated[0].eventCount).toBe(20)
  })

  it('provider-agnostic: source field is sentry', () => {
    ingestSentryIssues([makeSentryIssue('100', 'TypeError: foo', '5')], 'proj-1')
    const s = getSignalByExternalId('sentry', '100')!
    expect(s.source).toBe('sentry')
  })
})

// ── Workflow-signal linkage ───────────────────────────────────────

describe('Workflow-signal linkage', () => {
  it('createWorkflow accepts signalId', () => {
    const proj = createProject('test-proj', '/tmp/test-proj')
    upsertSignal({ source: 'sentry', externalId: '100', projectId: proj.id, title: 'A', eventCount: 1 })
    const s = getSignalByExternalId('sentry', '100')!

    const wf = createWorkflow('Fix A', proj.id, s.id)
    expect(wf.signalId).toBe(s.id)
  })

  it('createWorkflow without signalId has null signalId', () => {
    const wf = createWorkflow('Manual task')
    expect(wf.signalId).toBeNull()
  })

  it('createWorkflow accepts a pre-generated id', () => {
    const preId = randomUUID()
    const wf = createWorkflow('Fix B', null, null, preId)
    expect(wf.id).toBe(preId)
    expect(getWorkflow(preId)).toBeDefined()
  })
})

// ── Final workflow ID from claim (hardening) ──────────────────────

describe('Claim-to-workflow identity consistency', () => {
  it('signal.workflowId matches workflow.id with no intermediate identity', () => {
    const proj = createProject('test-proj', '/tmp/test-proj-2')
    upsertSignal({ source: 'sentry', externalId: '100', projectId: proj.id, title: 'A', eventCount: 1 })
    const s = getSignalByExternalId('sentry', '100')!

    // Generate the final workflow ID upfront
    const workflowId = randomUUID()

    // Claim with the final ID
    const claimed = claimSignal(s.id, workflowId)
    expect(claimed).toBe(true)

    // Create workflow using the same ID
    const wf = createWorkflow('Fix A', proj.id, s.id, workflowId)

    // Signal and workflow share the same identity - no temporary/pre-claim ID
    const signal = getSignal(s.id)!
    expect(signal.workflowId).toBe(wf.id)
    expect(signal.workflowId).toBe(workflowId)
    expect(wf.signalId).toBe(s.id)
  })

  it('workflow creation failure after claim transitions signal to failed', () => {
    upsertSignal({ source: 'sentry', externalId: '200', projectId: 'p1', title: 'B', eventCount: 1 })
    const s = getSignalByExternalId('sentry', '200')!

    const workflowId = randomUUID()
    const claimed = claimSignal(s.id, workflowId)
    expect(claimed).toBe(true)

    // Simulate workflow creation failure: call failSignal (as the IPC handler would)
    failSignal(s.id)

    const after = getSignal(s.id)!
    expect(after.status).toBe('failed')
    // workflowId remains for forensic inspection even though no workflow row exists
    expect(after.workflowId).toBe(workflowId)
    expect(getWorkflow(workflowId)).toBeUndefined()

    // Re-ingest the same Sentry issue
    const { row } = upsertSignal({
      source: 'sentry', externalId: '200', projectId: 'p1',
      title: 'B', eventCount: 15, lastSeen: '2026-09-19T20:00:00Z'
    })

    // Remains failed, counts update, no new claim possible
    expect(row.status).toBe('failed')
    expect(row.eventCount).toBe(15)
    expect(row.workflowId).toBe(workflowId)
    expect(claimSignal(s.id, randomUUID())).toBe(false)
  })

  it('concurrent claim still works with final workflow IDs', () => {
    upsertSignal({ source: 'sentry', externalId: '300', projectId: 'p1', title: 'C', eventCount: 1 })
    const s = getSignalByExternalId('sentry', '300')!

    const idA = randomUUID()
    const idB = randomUUID()

    const claimA = claimSignal(s.id, idA)
    const claimB = claimSignal(s.id, idB)

    expect(claimA).toBe(true)
    expect(claimB).toBe(false)

    const after = getSignal(s.id)!
    expect(after.workflowId).toBe(idA)
    expect(after.status).toBe('investigating')
  })
})

// ── Eligibility policy ────────────────────────────────────────────

describe('isEligibleForAutoInvestigation', () => {
  function makeSignal(overrides: Partial<SignalRow> = {}): SignalRow {
    return {
      id: 'sig-1', source: 'sentry', externalId: '100', shortId: 'TEST-1',
      projectId: 'p1', title: 'Test', level: 'error', eventCount: 1,
      firstSeen: null, lastSeen: null, status: 'observed',
      workflowId: null, prNumber: null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      ...overrides
    }
  }

  it('eligible: observed + error', () => {
    expect(isEligibleForAutoInvestigation(makeSignal({ status: 'observed', level: 'error' }))).toBe(true)
  })

  it('eligible: observed + fatal', () => {
    expect(isEligibleForAutoInvestigation(makeSignal({ status: 'observed', level: 'fatal' }))).toBe(true)
  })

  it('not eligible: warning level', () => {
    expect(isEligibleForAutoInvestigation(makeSignal({ level: 'warning' }))).toBe(false)
  })

  it('not eligible: info level', () => {
    expect(isEligibleForAutoInvestigation(makeSignal({ level: 'info' }))).toBe(false)
  })

  it('not eligible: already investigating', () => {
    expect(isEligibleForAutoInvestigation(makeSignal({ status: 'investigating' }))).toBe(false)
  })

  it('not eligible: failed', () => {
    expect(isEligibleForAutoInvestigation(makeSignal({ status: 'failed' }))).toBe(false)
  })

  it('not eligible: published', () => {
    expect(isEligibleForAutoInvestigation(makeSignal({ status: 'published' }))).toBe(false)
  })

  it('not eligible: null level', () => {
    expect(isEligibleForAutoInvestigation(makeSignal({ level: null }))).toBe(false)
  })
})

// ── processIngestedSignals ────────────────────────────────────────

describe('processIngestedSignals', () => {
  function makeSentryIssue(id: string, title: string, count: string, level: string = 'error'): SentryIssue {
    return {
      id, title, culprit: 'test.ts', shortId: `TEST-${id}`,
      level: level as any, status: 'unresolved', count,
      firstSeen: '2026-09-18T10:00:00Z', lastSeen: '2026-09-18T12:00:00Z',
      isRegression: false, metadata: {}, project: { slug: 'test' }
    }
  }

  it('observe_only policy: ingests but never claims', () => {
    const ingested = ingestSentryIssues([
      makeSentryIssue('100', 'TypeError: foo', '5'),
      makeSentryIssue('200', 'ReferenceError: bar', '2')
    ], 'p1')

    const claimed: string[] = []
    const result = processIngestedSignals(ingested, 'observe_only', (signal) => {
      claimed.push(signal.id)
    })

    expect(result.claimed).toBe(0)
    expect(result.skipped).toBe(0)
    expect(claimed.length).toBe(0)
    // But signals exist in the database
    expect(listSignals().length).toBe(2)
  })

  it('auto_investigate policy: claims eligible signals', () => {
    const ingested = ingestSentryIssues([
      makeSentryIssue('100', 'TypeError: foo', '5', 'error'),
      makeSentryIssue('200', 'Info log', '2', 'info')
    ], 'p1')

    const claimed: string[] = []
    const result = processIngestedSignals(ingested, 'auto_investigate', (signal, workflowId) => {
      claimed.push(signal.id)
    })

    // Only error-level signal claimed, info-level skipped
    expect(result.claimed).toBe(1)
    expect(claimed.length).toBe(1)

    // Verify the claimed signal is now investigating
    const s = getSignalByExternalId('sentry', '100')!
    expect(s.status).toBe('investigating')

    // Info signal remains observed
    const s2 = getSignalByExternalId('sentry', '200')!
    expect(s2.status).toBe('observed')
  })

  it('already-claimed signals skipped on re-collection', () => {
    // First collection - claims the signal
    const ingested1 = ingestSentryIssues([
      makeSentryIssue('100', 'TypeError: foo', '5')
    ], 'p1')
    const result1 = processIngestedSignals(ingested1, 'auto_investigate', () => {})
    expect(result1.claimed).toBe(1)

    // Second collection - same issue, higher count
    const ingested2 = ingestSentryIssues([
      makeSentryIssue('100', 'TypeError: foo', '12')
    ], 'p1')
    const result2 = processIngestedSignals(ingested2, 'auto_investigate', () => {})

    // Not eligible (status is investigating, not observed)
    expect(result2.claimed).toBe(0)
    // Count updated but no new work
    expect(getSignalByExternalId('sentry', '100')!.eventCount).toBe(12)
  })

  it('failed signals remain suppressed on re-collection', () => {
    const ingested1 = ingestSentryIssues([
      makeSentryIssue('100', 'TypeError: foo', '5')
    ], 'p1')
    processIngestedSignals(ingested1, 'auto_investigate', () => {})

    // Fail the signal
    const s = getSignalByExternalId('sentry', '100')!
    failSignal(s.id)

    // Re-collect
    const ingested2 = ingestSentryIssues([
      makeSentryIssue('100', 'TypeError: foo', '20')
    ], 'p1')
    const result2 = processIngestedSignals(ingested2, 'auto_investigate', () => {})

    expect(result2.claimed).toBe(0)
    expect(getSignalByExternalId('sentry', '100')!.status).toBe('failed')
    expect(getSignalByExternalId('sentry', '100')!.eventCount).toBe(20)
  })

  it('onClaimed failure transitions signal to failed', () => {
    const ingested = ingestSentryIssues([
      makeSentryIssue('100', 'TypeError: foo', '5')
    ], 'p1')

    const result = processIngestedSignals(ingested, 'auto_investigate', () => {
      throw new Error('API key missing')
    })

    // Counted as skipped, not claimed
    expect(result.claimed).toBe(0)
    expect(result.skipped).toBe(1)

    // Signal transitioned to failed (fail-closed)
    const s = getSignalByExternalId('sentry', '100')!
    expect(s.status).toBe('failed')
  })

  it('multiple eligible signals in one collection', () => {
    const ingested = ingestSentryIssues([
      makeSentryIssue('100', 'TypeError: A', '5', 'error'),
      makeSentryIssue('200', 'RangeError: B', '3', 'fatal'),
      makeSentryIssue('300', 'Debug: C', '1', 'info')
    ], 'p1')

    let workflowCount = 0
    const result = processIngestedSignals(ingested, 'auto_investigate', () => {
      workflowCount++
    })

    expect(result.claimed).toBe(2) // error + fatal
    expect(workflowCount).toBe(2)
    expect(getSignalByExternalId('sentry', '100')!.status).toBe('investigating')
    expect(getSignalByExternalId('sentry', '200')!.status).toBe('investigating')
    expect(getSignalByExternalId('sentry', '300')!.status).toBe('observed')
  })
})

// ── Overlap guard ─────────────────────────────────────────────────

describe('Overlap guard', () => {
  afterEach(() => {
    setCollecting(false) // Always clean up
  })

  it('isCollecting is false by default', () => {
    expect(isCollecting()).toBe(false)
  })

  it('setCollecting(true) makes isCollecting() return true', () => {
    setCollecting(true)
    expect(isCollecting()).toBe(true)
  })

  it('setCollecting(false) releases the guard', () => {
    setCollecting(true)
    setCollecting(false)
    expect(isCollecting()).toBe(false)
  })

  it('guard resets after simulated exception in finally', () => {
    // Simulate the tick pattern: set true, exception occurs, finally resets
    setCollecting(true)
    try {
      throw new Error('simulated collection failure')
    } catch {
      // error handled
    } finally {
      setCollecting(false)
    }
    expect(isCollecting()).toBe(false)
  })
})
