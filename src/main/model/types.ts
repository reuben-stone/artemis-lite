/**
 * Domain-owned model provider types.
 * No SDK types leak into orchestration.
 */
import { z } from 'zod'
import type { ContextPacket } from '../context/types'

// ── Usage ──────────────────────────────────────────────────────────

export interface ModelUsage {
  inputTokens: number
  outputTokens: number
  estimatedCost?: number
}

export interface ModelResult<T> {
  data: T
  usage: ModelUsage
  latencyMs: number
  provider: string
  model: string
}

// ── Structured output schemas ──────────────────────────────────────

export const PlanStepSchema = z.object({
  id: z.string(),
  objective: z.string(),
  preferredAction: z.enum(['retrieve', 'inspect_workspace', 'use_tool', 'ask_user', 'verify']),
  toolName: z.string().optional(),
  toolArgs: z.record(z.unknown()).optional(),
  reason: z.string().max(300)
})

export const PlanSchema = z.object({
  summary: z.string().max(500),
  steps: z.array(PlanStepSchema).min(1).max(8)
})

export type PlanOutput = z.infer<typeof PlanSchema>
export type PlanStep = z.infer<typeof PlanStepSchema>

export const VerificationSchema = z.object({
  pass: z.boolean(),
  reason: z.string().max(500)
})

export type VerificationOutput = z.infer<typeof VerificationSchema>

// ── Tool definition for model context ──────────────────────────────

export interface ToolDescription {
  name: string
  description: string
  mode: 'read' | 'write'
  inputSchema: Record<string, unknown>
}

// ── Provider interface ─────────────────────────────────────────────

export interface PlanRequest {
  goal: string
  workspacePath: string
  tools: ToolDescription[]
  context?: ContextPacket
}

export interface VerifyRequest {
  goal: string
  plan: PlanOutput
  stepResults: Record<string, unknown>
  context?: ContextPacket
}

export interface ModelProvider {
  generatePlan(request: PlanRequest): Promise<ModelResult<PlanOutput>>
  generateVerification(request: VerifyRequest): Promise<ModelResult<VerificationOutput>>
}
