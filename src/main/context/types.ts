/**
 * Context engineering types.
 * Context is an explicit, selective, budgeted and observable system resource.
 */
import { createHash } from 'crypto'

// ── Context item (runtime — full content for model call) ───────────

export interface ContextItem {
  source: ContextSource
  identifier: string     // e.g. file path, tool name, 'current_goal'
  reason: string         // why this was selected
  content: string        // full content sent to model
  estimatedTokens: number
  truncated: boolean
}

export type ContextSource =
  | 'goal'
  | 'step'
  | 'workflow_state'
  | 'file'
  | 'search'
  | 'tool_result'
  | 'tool_definitions'

// ── Persisted context item (compact — no full content duplication) ──

export interface PersistedContextItem {
  source: ContextSource
  identifier: string
  reason: string
  estimatedTokens: number
  truncated: boolean
  contentHash: string    // SHA-256 of full content for verification
  excerpt: string        // first 500 chars for reconstruction
  lineRange?: { start: number; end: number }
}

// ── Excluded item (observable) ─────────────────────────────────────

export type ExclusionReason =
  | 'not_relevant'
  | 'budget_exceeded'
  | 'unsupported'
  | 'too_large'
  | 'binary_file'

export interface ExcludedItem {
  source: string
  identifier: string
  reason: ExclusionReason
  estimatedTokens?: number
}

// ── Budget ─────────────────────────────────────────────────────────

export interface ContextBudget {
  limit: number
  used: number
  remaining: number
}

// ── Context packet (runtime) ───────────────────────────────────────

export interface ContextPacket {
  workflowId: string
  stepId: string | null
  phase: 'plan' | 'verify'
  items: ContextItem[]
  excluded: ExcludedItem[]
  budget: ContextBudget
  estimatedTokens: number
}

// ── Persisted context packet ───────────────────────────────────────

export interface PersistedContextPacket {
  id: string
  workflowId: string
  stepId: string | null
  phase: string
  items: PersistedContextItem[]
  excluded: ExcludedItem[]
  budget: ContextBudget
  estimatedTokens: number
  providerInputTokens: number | null
  createdAt: string
}

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Rough token estimation from character count.
 * Not authoritative — provider-reported usage is.
 * This explains composition; provider tokens explain actual API cost.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * SHA-256 hash of content for persistence verification.
 */
export function contentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16)
}

/**
 * Compact excerpt for persistence (first N chars).
 */
export function excerpt(content: string, maxChars = 500): string {
  if (content.length <= maxChars) return content
  return content.slice(0, maxChars) + '...'
}

/**
 * Convert a runtime ContextItem to its persisted form.
 */
export function toPersistedItem(item: ContextItem): PersistedContextItem {
  return {
    source: item.source,
    identifier: item.identifier,
    reason: item.reason,
    estimatedTokens: item.estimatedTokens,
    truncated: item.truncated,
    contentHash: contentHash(item.content),
    excerpt: excerpt(item.content)
  }
}
