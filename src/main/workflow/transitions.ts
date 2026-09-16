/**
 * Workflow state machine transition validation.
 * Pure logic — no persistence or Electron dependencies.
 */
import type { WorkflowStatus } from '../../shared/ipc'

const VALID_TRANSITIONS: Record<string, WorkflowStatus[]> = {
  queued:             ['planning', 'cancelled', 'failed'],
  planning:           ['executing', 'failed', 'cancelled'],
  executing:          ['awaiting_approval', 'verifying', 'failed', 'cancelled'],
  awaiting_approval:  ['executing', 'failed', 'cancelled'],
  verifying:          ['completed', 'executing', 'failed', 'cancelled'],
  completed:          [],
  failed:             [],
  cancelled:          []
}

export function validateTransition(from: WorkflowStatus, to: WorkflowStatus): boolean {
  return (VALID_TRANSITIONS[from] ?? []).includes(to)
}
