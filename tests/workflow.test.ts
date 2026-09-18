import { describe, it, expect } from 'vitest'
import { validateTransition } from '../src/main/workflow/transitions'
import { PlanSchema, VerificationSchema } from '../src/main/model/types'

// ── State machine transitions ──────────────────────────────────────

describe('Workflow state machine', () => {
  describe('valid transitions', () => {
    const valid: [string, string][] = [
      ['queued', 'planning'],
      ['queued', 'cancelled'],
      ['queued', 'failed'],
      ['planning', 'executing'],
      ['planning', 'failed'],
      ['planning', 'cancelled'],
      ['executing', 'awaiting_approval'],
      ['executing', 'verifying'],
      ['executing', 'failed'],
      ['executing', 'cancelled'],
      ['awaiting_approval', 'executing'],
      ['awaiting_approval', 'failed'],
      ['awaiting_approval', 'cancelled'],
      ['verifying', 'completed'],
      ['verifying', 'executing'],
      ['verifying', 'failed'],
    ]

    for (const [from, to] of valid) {
      it(`allows ${from} → ${to}`, () => {
        expect(validateTransition(from as any, to as any)).toBe(true)
      })
    }
  })

  describe('invalid transitions', () => {
    const invalid: [string, string][] = [
      ['queued', 'executing'],
      ['queued', 'completed'],
      ['planning', 'completed'],
      ['planning', 'awaiting_approval'],
      ['executing', 'planning'],
      ['executing', 'queued'],
      ['completed', 'queued'],
      ['completed', 'failed'],
      ['failed', 'queued'],
      ['failed', 'completed'],
      ['cancelled', 'queued'],
    ]

    for (const [from, to] of invalid) {
      it(`rejects ${from} → ${to}`, () => {
        expect(validateTransition(from as any, to as any)).toBe(false)
      })
    }
  })

  describe('terminal states have no outgoing transitions', () => {
    for (const terminal of ['completed', 'failed', 'cancelled']) {
      it(`${terminal} has no valid transitions`, () => {
        for (const target of ['queued', 'planning', 'executing', 'verifying', 'completed', 'failed', 'cancelled']) {
          expect(validateTransition(terminal as any, target as any)).toBe(false)
        }
      })
    }
  })
})

// ── Plan schema validation ─────────────────────────────────────────

describe('PlanSchema', () => {
  it('validates a correct plan', () => {
    const plan = {
      summary: 'List files and create a work item',
      steps: [
        {
          id: 'step_1',
          objective: 'List workspace files',
          preferredAction: 'use_tool',
          toolName: 'list_workspace_files',
          reason: 'Need to see what files exist'
        },
        {
          id: 'step_2',
          objective: 'Create summary work item',
          preferredAction: 'use_tool',
          toolName: 'create_work_item',
          toolArgs: { title: 'Summary', description: 'Summary of files' },
          reason: 'Capture findings as a work item'
        }
      ]
    }
    expect(PlanSchema.safeParse(plan).success).toBe(true)
  })

  it('rejects empty steps', () => {
    const plan = { summary: 'Nothing to do', steps: [] }
    expect(PlanSchema.safeParse(plan).success).toBe(false)
  })

  it('rejects too many steps', () => {
    const steps = Array.from({ length: 9 }, (_, i) => ({
      id: `step_${i}`,
      objective: 'Do thing',
      preferredAction: 'use_tool',
      reason: 'Because'
    }))
    expect(PlanSchema.safeParse({ summary: 'Big plan', steps }).success).toBe(false)
  })

  it('rejects missing required fields', () => {
    const plan = { summary: 'Plan', steps: [{ id: 'step_1' }] }
    expect(PlanSchema.safeParse(plan).success).toBe(false)
  })

  it('rejects invalid preferredAction', () => {
    const plan = {
      summary: 'Plan',
      steps: [{
        id: 'step_1',
        objective: 'Do thing',
        preferredAction: 'hack_the_planet',
        reason: 'Because'
      }]
    }
    expect(PlanSchema.safeParse(plan).success).toBe(false)
  })
})

// ── Verification schema ────────────────────────────────────────────

describe('VerificationSchema', () => {
  it('validates pass', () => {
    expect(VerificationSchema.safeParse({ pass: true, reason: 'All good' }).success).toBe(true)
  })

  it('validates fail', () => {
    expect(VerificationSchema.safeParse({ pass: false, reason: 'Missing output' }).success).toBe(true)
  })

  it('rejects missing pass', () => {
    expect(VerificationSchema.safeParse({ reason: 'No pass field' }).success).toBe(false)
  })

  it('truncates reason to 500 chars', () => {
    const result = VerificationSchema.parse({ pass: true, reason: 'x'.repeat(600) })
    expect(result.reason.length).toBe(500)
  })
})
