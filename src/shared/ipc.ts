/**
 * IPC channel definitions and Zod schemas.
 * Every payload crossing the main↔renderer boundary is validated here.
 */
import { z } from 'zod'

// ── Project types ──────────────────────────────────────────────────────

export const ProjectSummary = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  remote: z.string().nullable(),
  branch: z.string().nullable().optional(),
  dirty: z.boolean().optional(),
  createdAt: z.string()
})
export type ProjectSummary = z.infer<typeof ProjectSummary>

export const AddProjectInput = z.object({
  path: z.string().min(1)
})
export type AddProjectInput = z.infer<typeof AddProjectInput>

export const RemoveProjectInput = z.object({
  projectId: z.string().min(1)
})
export type RemoveProjectInput = z.infer<typeof RemoveProjectInput>

export const SetActiveProjectInput = z.object({
  projectId: z.string().min(1)
})
export type SetActiveProjectInput = z.infer<typeof SetActiveProjectInput>

// ── Workflow types (shared between main + renderer) ────────────────────

export const WorkflowStatus = z.enum([
  'queued',
  'planning',
  'executing',
  'awaiting_approval',
  'verifying',
  'completed',
  'failed',
  'cancelled'
])
export type WorkflowStatus = z.infer<typeof WorkflowStatus>

export const StepStatus = z.enum([
  'pending',
  'running',
  'awaiting_approval',
  'completed',
  'failed',
  'skipped'
])
export type StepStatus = z.infer<typeof StepStatus>

export const StepType = z.enum(['reason', 'retrieve', 'tool', 'approval', 'verify'])
export type StepType = z.infer<typeof StepType>

export const WorkflowSummary = z.object({
  id: z.string(),
  goal: z.string(),
  status: WorkflowStatus,
  createdAt: z.string(),
  updatedAt: z.string(),
  currentStepId: z.string().optional(),
  tokenBudget: z.number().optional()
})
export type WorkflowSummary = z.infer<typeof WorkflowSummary>

export const StepSummary = z.object({
  id: z.string(),
  workflowId: z.string(),
  type: StepType,
  status: StepStatus,
  attempt: z.number(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional()
})
export type StepSummary = z.infer<typeof StepSummary>

export const TraceEntry = z.object({
  id: z.string(),
  workflowId: z.string(),
  stepId: z.string().optional(),
  timestamp: z.string(),
  type: z.string(),
  status: z.enum(['start', 'success', 'failure']).optional(),
  durationMs: z.number().optional(),
  model: z.string().optional(),
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  toolName: z.string().optional(),
  retry: z.number().optional(),
  errorCode: z.string().optional(),
  metadata: z.record(z.unknown()).optional()
})
export type TraceEntry = z.infer<typeof TraceEntry>

export const ApprovalRequest = z.object({
  id: z.string(),
  workflowId: z.string(),
  stepId: z.string(),
  action: z.string(),
  summary: z.string(),
  risk: z.enum(['low', 'medium', 'high']),
  payloadPreview: z.unknown(),
  status: z.enum(['pending', 'approved', 'rejected'])
})
export type ApprovalRequest = z.infer<typeof ApprovalRequest>

export const UsageSummary = z.object({
  modelCalls: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  estimatedCost: z.number(),
  toolCalls: z.number(),
  retries: z.number(),
  durationMs: z.number()
})
export type UsageSummary = z.infer<typeof UsageSummary>

// ── IPC request/response schemas ───────────────────────────────────────

export const StartWorkflowInput = z.object({
  goal: z.string().min(1).max(2000)
})
export type StartWorkflowInput = z.infer<typeof StartWorkflowInput>

export const CancelWorkflowInput = z.object({
  workflowId: z.string().min(1)
})
export type CancelWorkflowInput = z.infer<typeof CancelWorkflowInput>

export const ResolveApprovalInput = z.object({
  approvalId: z.string().min(1),
  decision: z.enum(['approved', 'rejected'])
})
export type ResolveApprovalInput = z.infer<typeof ResolveApprovalInput>

export const GetWorkflowInput = z.object({
  workflowId: z.string().min(1)
})
export type GetWorkflowInput = z.infer<typeof GetWorkflowInput>

// ── Renderer events (main → renderer push) ─────────────────────────────

export const RendererEvent = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('workflow.status'),
    workflowId: z.string(),
    status: WorkflowStatus
  }),
  z.object({
    type: z.literal('step.started'),
    workflowId: z.string(),
    step: StepSummary
  }),
  z.object({
    type: z.literal('step.completed'),
    workflowId: z.string(),
    step: StepSummary
  }),
  z.object({
    type: z.literal('model.usage'),
    workflowId: z.string(),
    stepId: z.string().optional(),
    inputTokens: z.number(),
    outputTokens: z.number(),
    estimatedCost: z.number().optional()
  }),
  z.object({
    type: z.literal('tool.started'),
    workflowId: z.string(),
    stepId: z.string(),
    toolName: z.string()
  }),
  z.object({
    type: z.literal('tool.completed'),
    workflowId: z.string(),
    stepId: z.string(),
    toolName: z.string(),
    durationMs: z.number()
  }),
  z.object({
    type: z.literal('approval.requested'),
    approval: ApprovalRequest
  }),
  z.object({
    type: z.literal('workflow.completed'),
    workflowId: z.string(),
    usage: UsageSummary
  }),
  z.object({
    type: z.literal('workflow.failed'),
    workflowId: z.string(),
    error: z.string()
  }),
  z.object({
    type: z.literal('model.text'),
    workflowId: z.string(),
    text: z.string()
  })
])
export type RendererEvent = z.infer<typeof RendererEvent>

// ── Channel names (re-exported from dependency-free module) ────────────

export { IpcChannel } from './channels'
