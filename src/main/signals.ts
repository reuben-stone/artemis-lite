/**
 * Operational signal normalization, ingestion, and collection.
 *
 * Converts external issue data (Sentry, future: CI, monitors) into
 * durable operational_signals records with atomic dedup.
 *
 * Core invariant: one external problem may be observed many times,
 * but Artemis maintains one durable identity for it and never creates
 * duplicate consequential work without an explicit retry/reopen decision.
 *
 * Two separate atomicity requirements:
 *  A. Observation deduplication - UNIQUE(source, externalId) via upsertSignal
 *  B. Consequential work claim  - compare-and-set via claimSignal
 */
import { randomUUID } from 'crypto'
import type { SentryIssue } from './sentry'
import { upsertSignal, claimSignal, failSignal, type SignalRow } from './store'

// Provider-agnostic signal source type.
// Sentry is the first provider; CI and monitor adapters will follow.
export type SignalSource = 'sentry' | 'ci' | 'monitor'

export interface IngestionResult {
  new: SignalRow[]
  updated: SignalRow[]
}

export interface CollectionResult {
  ingested: number
  claimed: number
  skipped: number
}

/**
 * Sentry adapter: convert SentryIssue[] into atomic signal upserts.
 *
 * New issues get status 'observed'. Existing issues get their
 * eventCount and lastSeen updated but status is NEVER regressed -
 * a signal in investigating/failed/published stays there.
 */
export function ingestSentryIssues(
  issues: SentryIssue[],
  projectId: string
): IngestionResult {
  const result: IngestionResult = { new: [], updated: [] }

  for (const issue of issues) {
    const { row, isNew } = upsertSignal({
      source: 'sentry' satisfies SignalSource,
      externalId: issue.id,
      shortId: issue.shortId ?? null,
      projectId,
      title: issue.title,
      level: issue.level ?? null,
      eventCount: typeof issue.count === 'string' ? parseInt(issue.count, 10) || 0 : issue.count,
      firstSeen: issue.firstSeen ?? null,
      lastSeen: issue.lastSeen ?? null
    })

    if (isNew) {
      result.new.push(row)
    } else {
      result.updated.push(row)
    }
  }

  return result
}

// ── Eligibility policy (V1 - deterministic) ──────────────────────

/**
 * Determines if a signal is eligible for automatic investigation.
 * V1: only error/fatal severity, only observed status.
 * No model decides whether the worker launches.
 */
export function isEligibleForAutoInvestigation(signal: SignalRow): boolean {
  if (signal.status !== 'observed') return false
  if (signal.level !== 'error' && signal.level !== 'fatal') return false
  return true
}

// ── Signal collection ────────────────────────────────────────────

/**
 * Process already-ingested signals: evaluate eligibility, claim, and notify.
 * Separated from fetch so it's testable without network.
 *
 * For each eligible signal:
 *  1. Generate final workflow ID
 *  2. Atomic claimSignal() - compare-and-set
 *  3. If claim succeeds: call onClaimed callback
 *  4. If onClaimed throws: failSignal (fail-closed)
 *
 * The onClaimed callback must handle workflow creation + execution.
 * The signal is already claimed when onClaimed fires.
 */
export function processIngestedSignals(
  ingested: IngestionResult,
  automationPolicy: string,
  onClaimed: (signal: SignalRow, workflowId: string, goal: string) => void
): { claimed: number; skipped: number } {
  let claimed = 0
  let skipped = 0

  if (automationPolicy !== 'auto_investigate') {
    return { claimed: 0, skipped: 0 }
  }

  // Process all signals (new and updated) - the eligibility check handles status filtering
  const allSignals = [...ingested.new, ...ingested.updated]

  for (const signal of allSignals) {
    if (!isEligibleForAutoInvestigation(signal)) {
      continue
    }

    const workflowId = randomUUID()
    const didClaim = claimSignal(signal.id, workflowId)

    if (!didClaim) {
      skipped++
      continue
    }

    // Signal is now claimed. Any failure from here must fail-closed.
    const goal = `Investigate Sentry issue: "${signal.title}". ${signal.eventCount} event(s). Search the repository for relevant code and identify the likely cause.`

    try {
      onClaimed(signal, workflowId, goal)
      claimed++
    } catch (err) {
      // Workflow creation or execution setup failed after claim.
      // Transition signal to failed so it never silently becomes
      // eligible for fresh consequential work.
      failSignal(signal.id)
      console.error(`[SignalCollector] onClaimed failed for signal ${signal.id}:`, err)
      skipped++
    }
  }

  return { claimed, skipped }
}

/**
 * Full collection cycle: fetch from Sentry, ingest, process.
 * Called by the periodic interval in the main process.
 * Uses dynamic import for createSentryClient to avoid pulling
 * electron-dependent secrets module into test context.
 */
export async function collectAndProcessSignals(deps: {
  projectId: string
  sentrySlug: string
  automationPolicy: string
  onClaimed: (signal: SignalRow, workflowId: string, goal: string) => void
}): Promise<CollectionResult> {
  const { createSentryClient } = await import('./sentry')
  const client = createSentryClient()
  if (!client) {
    return { ingested: 0, claimed: 0, skipped: 0 }
  }

  const issues = await client.listIssues(deps.sentrySlug)
  const ingested = ingestSentryIssues(issues, deps.projectId)

  const { claimed, skipped } = processIngestedSignals(
    ingested,
    deps.automationPolicy,
    deps.onClaimed
  )

  return {
    ingested: ingested.new.length + ingested.updated.length,
    claimed,
    skipped
  }
}

// ── Overlap guard ────────────────────────────────────────────────

let _collecting = false

/**
 * Returns true if a collection tick is already in progress.
 * Used by the interval to suppress overlapping ticks.
 */
export function isCollecting(): boolean {
  return _collecting
}

/**
 * Set the collection lock. Must always be released in a finally block
 * so an exception cannot permanently stop collection.
 */
export function setCollecting(v: boolean): void {
  _collecting = v
}
