import { describe, it, expect } from 'vitest'
import {
  StartWorkflowInput,
  CancelWorkflowInput,
  ResolveApprovalInput,
  GetWorkflowInput,
  IpcChannel
} from '../src/shared/ipc'

describe('IPC input validation', () => {
  describe('StartWorkflowInput', () => {
    it('accepts a valid goal', () => {
      const result = StartWorkflowInput.safeParse({ goal: 'Review the project notes' })
      expect(result.success).toBe(true)
    })

    it('rejects empty goal', () => {
      const result = StartWorkflowInput.safeParse({ goal: '' })
      expect(result.success).toBe(false)
    })

    it('rejects missing goal', () => {
      const result = StartWorkflowInput.safeParse({})
      expect(result.success).toBe(false)
    })

    it('rejects goal over 2000 chars', () => {
      const result = StartWorkflowInput.safeParse({ goal: 'x'.repeat(2001) })
      expect(result.success).toBe(false)
    })

    it('rejects non-string goal', () => {
      const result = StartWorkflowInput.safeParse({ goal: 42 })
      expect(result.success).toBe(false)
    })
  })

  describe('CancelWorkflowInput', () => {
    it('accepts a valid workflowId', () => {
      const result = CancelWorkflowInput.safeParse({ workflowId: 'abc-123' })
      expect(result.success).toBe(true)
    })

    it('rejects empty workflowId', () => {
      const result = CancelWorkflowInput.safeParse({ workflowId: '' })
      expect(result.success).toBe(false)
    })
  })

  describe('ResolveApprovalInput', () => {
    it('accepts approved', () => {
      const result = ResolveApprovalInput.safeParse({
        approvalId: 'appr-1',
        decision: 'approved'
      })
      expect(result.success).toBe(true)
    })

    it('accepts rejected', () => {
      const result = ResolveApprovalInput.safeParse({
        approvalId: 'appr-1',
        decision: 'rejected'
      })
      expect(result.success).toBe(true)
    })

    it('rejects invalid decision', () => {
      const result = ResolveApprovalInput.safeParse({
        approvalId: 'appr-1',
        decision: 'maybe'
      })
      expect(result.success).toBe(false)
    })
  })

  describe('GetWorkflowInput', () => {
    it('accepts a valid workflowId', () => {
      const result = GetWorkflowInput.safeParse({ workflowId: 'wf-123' })
      expect(result.success).toBe(true)
    })

    it('rejects missing workflowId', () => {
      const result = GetWorkflowInput.safeParse({})
      expect(result.success).toBe(false)
    })
  })
})

describe('IPC channel names', () => {
  it('all channels are unique', () => {
    const values = Object.values(IpcChannel)
    expect(new Set(values).size).toBe(values.length)
  })

  it('channels use colon namespace convention', () => {
    for (const ch of Object.values(IpcChannel)) {
      expect(ch).toMatch(/^[a-z]+:[a-zA-Z]+$/)
    }
  })
})
